import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { env } from "./env.js";
import { pool } from "../db/pool.js";

const PgStore = connectPgSimple(session);

export const sessionMiddleware = session({
    store: new PgStore({ pool, tableName: "session", createTableIfMissing: true }),
    name: "sid",
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: env.isProd,
        maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
});

