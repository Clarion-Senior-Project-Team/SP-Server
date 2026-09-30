import "dotenv/config";
import express from "express";
import { initializeDatabase } from "./db/init.js";

const app = express();
const PORT = process.env.PORT;

app.use(express.json());

app.get("/", (req, res) => {
    res.send("Server is running");
});

await initializeDatabase();

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
