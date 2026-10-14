import { getAllEmployees, findEmployeeById, createEmployee as create_employee, updateEmployee as update_employee, deleteEmployeeTransaction as delete_employee } from "../../db/transactions.js";

export const getEmployees = async (req, res, next) => {
    try {
        const employees = await getAllEmployees();
        res.status(200).json({
            employees: employees
        });
    } catch (error) {
        next(error);
    }
}

export const getEmployee = async (req, res, next) => {
    try {
        const employee = await findEmployeeById(req.params.employeeId)
        res.status(200).json({
            employee: employee
        });
    } catch (error) {
        next(error);
    }
}

export const createEmployee = async (req, res, next) => {
    try {
        const employee = await create_employee(req.body);
        res.status(201).json({
            exployee: employee
        });
    } catch (error) {
        next(error);
    }
}

export const updateEmployee = async (req, res, next) => {
    try {
        await update_employee(req.params.employeeId, req.body);
        const employee = await findEmployeeById(req.params.employeeId);
        res.status(200).json({
            employee: employee
        });
    } catch (error) {
        next(error);
    }
}

export const deleteEmployee = async (req, res, next) => {
    try {
        await delete_employee(req.params.employeeId);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
}
