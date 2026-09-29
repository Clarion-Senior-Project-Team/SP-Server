import "dotenv/config";
import express from "express";
import { initializeDatabase } from "./db/init.js";
import cors from "cors";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// import.meta.url is the ES-module replacement for CommonJS's __dirname
// (which doesn't exist in "type": "module" projects like this one).
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import authRoutes from "./auth/authentication/routes.js";
import { sessionMiddleware } from "./config/session.js";

const app = express();
const PORT = process.env.PORT;
const USERS_FILE = path.join(__dirname, "users.json");
const SALT_ROUNDS = 10; // how much work bcrypt puts into hashing — higher is slower but harder to crack

app.use(cors()); // lets the frontend (a different port) call this API
app.use(express.json()); // parses incoming JSON request bodies into req.body
app.use(sessionMiddleware);

app.use("/auth", authRoutes);

app.get("/", (req, res) => {
  res.send("Server is running");
});

// ---- dummy data we can use for now until database is created ----
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

await initializeDatabase();

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
