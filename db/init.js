import { pool } from "./pool.js"
import { createAllTables } from "./tables.js"

export async function initializeDatabase() {
    try {
        const client = await pool.connect();

        try {
            console.log("Connected to PostgreSQL");

            await createAllTables(client);

            console.log("Database initialized successfully");
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Database initialization failed:", error);
        throw error;
    }
}
