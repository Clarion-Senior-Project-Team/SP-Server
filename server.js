import "dotenv/config";
import express from "express";
import { initializeDatabase } from "./db/init.js";
import cors from "cors";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Login/signup routes — same ideas as the login tutorial (hash the
 * password, check for duplicates before inserting, compare hashes on
 * login), with two swaps:
 *
 *  - bcryptjs instead of bcrypt. Same hash()/compare() API, but it's
 *    pure JavaScript — the real "bcrypt" package needs a C++ compiler
 *    to install (node-gyp), which isn't set up on every dev machine.
 *    bcryptjs avoids that entirely and is a very common substitute.
 *
 *  - A JSON file instead of a real database. The
 *    3-create-database-and-transaction-logic branch is where the real
 *    database work belongs — loadUsers()/saveUsers() below are the only
 *    two functions that would change to swap one in; every route above
 *    them stays exactly the same either way.
 */

// import.meta.url is the ES-module replacement for CommonJS's __dirname
// (which doesn't exist in "type": "module" projects like this one).
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT;
const USERS_FILE = path.join(__dirname, "users.json");
const SALT_ROUNDS = 10; // how much work bcrypt puts into hashing — higher is slower but harder to crack

app.use(cors()); // lets the frontend (a different port) call this API
app.use(express.json()); // parses incoming JSON request bodies into req.body

app.get("/", (req, res) => {
  res.send("Server is running");
});

// ---- the "database" ----
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ---- sign up ----
app.post("/api/signup", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are all required." });
  }

  const users = loadUsers();

  // Check for an existing account BEFORE inserting — and this check
  // actually gates the insert below (an `else`, not two separate `if`s).
  // Skipping the `else` is an easy mistake: the duplicate check still
  // prints "already exists," but the insert code runs anyway right
  // after it, since nothing stopped it from executing.
  const existing = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists." });
  } else {
    // Never store the real password — only the hash. bcrypt.hash() is a
    // one-way scramble: there's no function that turns the hash back
    // into "password123". The only way to check a guess later is to
    // hash the guess the same way and compare the two hashes (see login
    // below), never by reversing this one.
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const newUser = {
      id: Date.now().toString(),
      name,
      email,
      password: hashedPassword,
    };
    users.push(newUser);
    saveUsers(users);

    // Send back everything EXCEPT the password (even hashed, no reason
    // for the frontend to ever see it).
    res.status(201).json({ id: newUser.id, name: newUser.name, email: newUser.email });
  }
});

// ---- log in ----
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are both required." });
  }

  const users = loadUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    return res.status(401).json({ error: "No account found with that email." });
  }

  // bcrypt.compare() hashes the submitted password the same way and
  // checks whether the two hashes match — this is the only correct way
  // to check a password against a hash; there's no "un-hash" step.
  const passwordMatches = await bcrypt.compare(password, user.password);

  if (!passwordMatches) {
    return res.status(401).json({ error: "Incorrect password." });
  }

  res.json({ id: user.id, name: user.name, email: user.email });
});

await initializeDatabase();

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
