import { getSchedules as get_schedules, createScheduleWithShifts, updateScheduleTransaction, deleteScheduleTransaction } from "../../db/transactions.js";

export const getSchedules = async (req, res, next) => {
    try {
        const schedules = await get_schedules();
        res.status(200).json({
            schedules: schedules
        });
    } catch (error) {
        next(error);
    }
}

export const getSchedule = async (req, res, next) => {
    try {
        const schedule = await get_schedules(req.params.scheduleId);
        res.status(200).json({
            schedule: schedule
        });
    } catch (error) {
        next(error);
    }
}

export const createSchedule = async (req, res, next) => {
    try {
        const schedule = await createScheduleWithShifts(req.params.title, req.params.start_date, req.params.end_date, req.params.created_by, req.params.shifts);
        res.status(201).json({
            schedule: schedule
        });

    } catch (error) {
        next(error);
    }
}

export const updateSchedule = async (req, res, next) => {
    try {
        const scheduleUpdates = {
            title: req.params.title,
            start_date: req.params.start_date,
            end_date: req.params.end_date,
            shifts: req.params.shifts
        };
        await updateScheduleTransaction(req.params.scheduleId, scheduleUpdates);
        const schedule = await get_schedules(req.params.scheduleId);
        res.status(200).json({
            schedule: schedule
        });
    } catch (error) {
        next(error);
    }
}

export const deleteSchedule = async (req, res, next) => {
    try {
        await deleteScheduleTransaction(req.params.scheduleId);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
}
