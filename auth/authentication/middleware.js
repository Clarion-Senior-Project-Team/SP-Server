import { findEmployeeById } from "../../db/transactions.js";
import { PublicUser } from "./service.js";

export const requireAuth = async (req, res, next) => {
    if (req.session?.userId == null) {
        return res.status(401).json({ error: "Not logged in." });
    }
    const user = await findEmployeeById(req.session.userId);
    if (!user) return req.session.destroy(() => res.status(401).json({ error: "Not logged in."}));
    req.user = PublicUser(user);
    next();
};
