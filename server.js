import { env } from "./config/env.js";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { initializeDatabase } from "./db/init.js";
import { findEmployeeById } from "./db/transactions.js";
import { PublicUser } from "./auth/authentication/service.js";
import helmet from "helmet";
import cors from "cors";
import authRoutes from "./auth/authentication/routes.js";
import { sessionMiddleware } from "./config/session.js";

// import.meta.url is the ES-module replacement for CommonJS's __dirname.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = env.port;

app.use(helmet());
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json()); // parses incoming JSON request bodies into req.body
app.use(sessionMiddleware);

// views/ and public/ both live at the repo root, same level as this file.
// The actual GET /auth/login and GET /auth/signup page routes live in
// auth/authentication/routes.js, right alongside the POST versions that
// already handle the real login/signup logic — those pages' <form>s call
// those exact POST routes via fetch (see the <script> in each .ejs file).
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

app.use("/auth", authRoutes);

// Same check middleware.js's requireAuth does — logged in shows the home
// page with their name, logged out bounces to the login screen. This is
// what makes "visit the backend's URL" show the login screen like Dane
// described: there's no session yet, so this redirects immediately.
app.get("/", async (req, res) => {
  if (!req.session?.userId) return res.redirect("/auth/login");

  const user = await findEmployeeById(req.session.userId);
  if (!user) return req.session.destroy(() => res.redirect("/auth/login"));

  res.render("home", { name: PublicUser(user).name });
});

// After all routes
app.use((req, res) => res.status(404).json({ error: "Not found."}));

app.use((err, req, res, next) => {
    console.error(err);
    const status = err.status >= 400 && err.status < 500 ? err.status : 500;
    res.status(status).json({
        error: status === 500 ? "Internal server error" : "Bad request.",
    });
})

await initializeDatabase();

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
