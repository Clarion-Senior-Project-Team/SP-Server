import { pool } from "./pool.js"
import { createtablees } from "./tables.js"


export async function initializeDatabase() {
    try {
        const client = await pool.connect();

        try {
            console.log("Connected to PostgreSQL");

            await createTables(client);

            console.log("Database initialized successfully");
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Database initialization failed:", error);
        throw error;
    }
}