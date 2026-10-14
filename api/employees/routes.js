import express from "express";

import { getEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee } from "./controller.js";
const router = express.Router();

router.get("/", getEmployees);
router.get("/:employeeId", getEmployee);
router.post("/", createEmployee);
router.put("/:employeeId", updateEmployee);
router.delete("/:employeeId", deleteEmployee);

export default router;
