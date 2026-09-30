import { env } from "./config/env.js";
import express from "express";
import { initializeDatabase } from "./db/init.js";
import helmet from "helmet";
import cors from "cors";
import authRoutes from "./auth/authentication/routes.js";
import { sessionMiddleware } from "./config/session.js";

const app = express();
const PORT = env.port;

app.use(helmet());
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json()); // parses incoming JSON request bodies into req.body
app.use(sessionMiddleware);
app.use("/auth", authRoutes);

app.get("/", (req, res) => {
  res.send("Server is running");
});

// After all routes
app.use((req, res) => res.status(400).json({ error: "Not found."}));

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
