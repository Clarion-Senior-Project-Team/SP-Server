import express from "express";
import employeeRoutes from "./employees/routes.js";
import scheduleRoutes from "./schedules/routes.js";

const router = express.Router();

router.use("/employees", employeeRoutes);
router.use("/schedules", scheduleRoutes);

export default router;
