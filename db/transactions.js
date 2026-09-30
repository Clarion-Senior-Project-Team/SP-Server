import {pool} from './pool.js'; 

export const findEmployee = async (email) => {
    const conn = await pool.connect();
    try {
        const { rows } = await conn.query(
        `SELECT id, name, email, user_level, password
         FROM employees WHERE lower(email) = lower($1)
        `, [email]);
        return rows[0] ?? null;
    } finally {
        conn.release();
    }
}

export const findEmployeeById = async (userId) => {
    const conn = await pool.connect();
    try {
        const { rows } = await conn.query(
        `SELECT id, name, email, user_level, password
         FROM employees WHERE id = $1
        `, userId);
        return rows[0] ?? null;
    } finally {
        conn.release();
    }
}

export async function createEmployee({
    name,
    email,
    password,
    user_level = 'employee',
}) {
    const conn = await pool.connect();

    try {

        await conn.query("BEGIN");

        const queryText = `
            INSERT INTO employees (name, email, password, user_level)
            VALUES ($1, $2, $3, $4)
            RETURNING id, name, email, password, user_level
        `;

        const result = await conn.query(queryText, [
            name,
            email,
            password,
            user_level,
        ]);

        await conn.query("COMMIT");
        return result.rows[0];

    } catch (error) {

        await conn.query("ROLLBACK");

        //Tracks lowercase index violations
        if (error.code == "23505") {
            throw new Error("An employee with that email or username already exists");
        }
        throw error;
    }   finally {
        conn.release();
    }
}

export async function createScheduleWithShifts({
  title,
  start_date,
  end_date,
  shifts = [],
}) {
    const conn = await pool.connect();

    try {
        await conn.query("BEGIN");

        //Create the schedule
        const scheduleQuery = `
            INSERT INTO schedules (title, start_date, end_date)
            VALUES ($1, $2, $3)
            RETURNING id, title, start_date, end_date, created_at;
        `;

        const scheduleRes = await conn.query(scheduleQuery, [
            title,
            start_date,
            end_date,
        ])
        const schedule = scheduleRes.rows[0];

        // 2. Insert all shifts referencing the new schedule's id
        const shiftQuery = `
            INSERT INTO shifts (schedule_id, employee_id, start_time, end_time, role, notes)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, schedule_id, employee_id, start_time, end_time, role, notes;
        `;

        const createdShifts = [];
        for (const shift of shifts) {
            const shiftRes = await conn.query(shiftQuery, [
                schedule.id,
                shift.employee_id || null, // null allowed for unassigned shifts
                shift.start_time,
                shift.end_time,
                shift.role || null,
                shift.notes || null,
            ])
            createdShifts.push(shiftRes.rows[0]);
        }

        await conn.query("COMMIT");

        return {
            ...schedule,
            shifts: createdShifts,
        };
    } catch (error) {
        await conn.query("ROLLBACK");
        throw error;
    } finally {
        conn.release();
    }
}

export async function assignEmployeeToShift(shiftId, employeeId){
    const conn = await pool.connect();

    try {
        await conn.query("BEGIN");

        //1. Verify the employee exists. 
        const employeeCheck = await conn.query(
            "SELECT id, name FROM employees WHERE id = $1",
            [employeeId]
            );

        if (employeeCheck.rowCount === 0) {
             throw new Error(`Employee with ID ${employeeId} does not exist.`);
         }

         // 2. Assign the employee to the shift
        const updateQuery = `
            UPDATE shifts
            SET employee_id = $1
            WHERE id = $2
            RETURNING id, schedule_id, employee_id, start_time, end_time, role, notes;
        `;
        const shiftRes = await conn.query(updateQuery, [employeeId, shiftId]);

        if (shiftRes.rowCount === 0) {
             throw new Error(`Shift with ID ${shiftId} does not exist.`);
        }

        await conn.query("COMMIT");
        return shiftRes.rows[0];
    } catch (error) {
        await conn.query("ROLLBACK");
        throw error;
    } finally {
        conn.release();
    }
 }
