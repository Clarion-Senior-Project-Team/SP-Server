import "dotenv/config";

const required = ["SESSION_SECRET", "CLIENT_ORIGIN"];
const missing = required.filter((k) => !process.env[k]);

if (missing.length) throw new Error (`Missing env vars: ${missing.join(", ")}`);

export const env = {
    port: Number(process.env.PORT ?? 3008),
    clientOrigin: process.env.CLIENT_ORIGIN,
    sessionSecret: process.env.SESSION_SECRET,
    isProd: process.env.NODE_ENV === "production",
    dbPort: Number(process.env.DB_PORT ?? 5432),
    dbHost: process.env.DB_HOST,
    db: process.env.DB,
    dbUser: process.env.DB_USER,
    dbPassword: process.env.DB_PASSWORD
};
