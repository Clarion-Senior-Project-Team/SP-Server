import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, signup, logout } from "./controller.js";
import { requireAuth } from './middleware.js';

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false });

// The actual login/signup screens — these just render the page. The
// <form> on each one submits to the POST routes below via fetch(), which
// is where the real logic (hashing, checking the database, sessions)
// happens; these GET routes never touch any of that themselves.
router.get("/login", (req, res) => res.render("login"));
router.get("/signup", (req, res) => res.render("signup"));

router.post("/login", authLimiter, login);
router.post("/signup", authLimiter, signup);
router.post("/logout", logout);
router.get("/me", requireAuth, (req, res) => {
    res.status(200).json({ user: req.user });
});


export default router;
