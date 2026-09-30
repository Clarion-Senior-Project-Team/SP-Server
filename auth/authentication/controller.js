import { loginUser, registerUser } from "./service.js";

export const login = async (req, res, next) => {

    const email = req?.body?.email;
    const password = req?.body?.password;

    if (typeof email !== "string" || typeof password !== "string") {
        return res.status(400).json({ error: "Email and password are both required." });
    }

    const user = await loginUser(email, password);
    if (user === null) return res.status(401).json({ error: "Incorrect Email or Password." });

    req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.userId = user.id;
        res.status(200).json({ user: user });
    });

};

export const signup = async (req, res, next) => {

    const name = req?.body?.name;
    const email = req?.body?.email;
    const password = req?.body?.password;

    if (name == null || email == null || password == null) {
        return res.status(400).json({ error: "Name, email, and password are all required." });
    }

    const user = await registerUser(name, email, password);

    if (user === null) return res.status(409).json({ error: "User email taken."});

    req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.userId = user.id;
        res.status(200).json({ user: user });
    });

};

export const logout = async (req, res, next) => {
    // Log user out
    req.session.destroy((err) => {
        if (err) return next(err);
        res.clearCookie("sid");
        res.status(204).end();
    });
}

