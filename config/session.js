import session from "express-session";
import connectPgSimple from "connect-pg-simple";
// import { pool } from "../db/pool";

const PgStore = connectPgSimple(session);

export const sessionMiddleware = session({
    store: new PgStore({ pool, tableName: "session" }),
    name: "sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
});

