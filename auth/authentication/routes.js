import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, signup, logout } from "./controller.js";
import { requireAuth } from './middleware.js';

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false });

router.post("/login", authLimiter, login);
router.post("/signup", authLimiter, signup);
router.post("/logout", logout);
router.get("/me", requireAuth, (req, res) => {
    res.status(200).json({ user: req.user });
});


export default router;
