import "dotenv/config";
import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

export const pool = new Pool({
  host: env.dbHost,
  port: env.dbPort,
  database: env.db,
  user: env.dbUser,
  password: env.dbPassword,
});

export default pool;
