import express from "express";

import { getSchedules, getSchedule, createSchedule, updateSchedule, deleteSchedule } from "./controller.js";

const router = express.Router();

router.get("/", getSchedules);
router.get("/:scheduleId", getSchedule);
router.post("/", createSchedule);
router.put("/:scheduleId", updateSchedule);
router.delete("/:scheduleId", deleteSchedule);

export default router;
