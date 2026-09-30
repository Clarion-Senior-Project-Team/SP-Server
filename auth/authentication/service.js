import { getHashedPassword, matchPasswords } from "./password.js";
import { findEmployee, createEmployee } from "../../db/transactions.js";

const DUMMY_HASH = await getHashedPassword("not-a-real-password");

export const PublicUser = (r) => ({ id: r.id, name: r.name, email: r.email, userLevel: r.user_level});

export const loginUser = async (email, password) => {
    const row = await findEmployee(email);
    const hash = row?.password ?? DUMMY_HASH;
    const ok = await matchPasswords(password, hash);
    return row && ok ? PublicUser(row) : null;
};

export const registerUser = async (name, email, password) => {
    const hashed = await getHashedPassword(password);
    try {
        return PublicUser(await createEmployee({ name, email, password: hashed}));
    } catch (err) {
        if (err.code === "EMAIL_TAKEN") return null;
        throw err;
    }
}
