import {pool} from './db.js'; 

/** Transaction 1: Creates a new employee
 * Safley inserts a new user and track unique lowercase violations (code 23505)
 */
export async function createEmployeeTransaction({
    name,
    username,
    email,
    user_level = 'employee',
}) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const queryText = `
            INSERT INTO employees (name, username, email, user_level)
            VALUES ($1, $2, $3, $4)
            RETURNING id, name, username, email, user_level
        `;

        const result = await client.query(queryText, [
            name,
            username,
            email,
            user_level,
        ]);

        await client.query("COMMIT");
        return result.rows[0];
    }   catch (error) {
        await client.query("ROLLBACK");

        //Tracks lowercase index violations
        if (error.code == "23505") {
            throw new Error("An employee with that email or username already exists");
        }
        throw error;
    }   finally {
        client.release();
    }
}

/**
 * Transaction 2: Creates a schedule and all of its shifts in one operation.
 * If any shift it invalid then the schedule rolls back together
 */
export async function createScheduleWithShiftsTransaction({
  title,
  start_date,
  end_date,
  shifts = [],
}) {
    const client = await pool.connect();

    try {
        await client.querey("BEGIN");

        //Create the schedule
        const scheduleQuery = `
            INSERT INTO schedules (title, start_date, end_date)
            VALUES ($1, $2, $3)
            RETURNING id, title, start_date, end_date, created_at;
        `;

        const scheduleRes = await client.query(scheduleQuery, [
            title,
            start_date,
            end_date,
        ])

        // 2. Insert all shifts referencing the new schedule's id
        const shiftQuery = `
            INSERT INTO shifts (schedule_id, employee_id, start_time, end_time, role, notes)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, schedule_id, employee_id, start_time, end_time, role, notes;
        `;

        const createdShifts = [];
        for (const shift of shifts) {
            const shiftRes = await client.query(shiftQuery, [
                schedule.id,
                shift.employee_id || null, // null allowed for unassigned shifts
                shift.start_time,
                shift.end_time,
                shift.role || null,
                shift.notes || null,
            ])
            createdShifts.push(shiftRes.rows[0]);
        }

        await client.query("COMMIT");

        return {
            ...schedule,
            shifts: createdShifts,
        };
    }catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }finally {
        client.release();
        }
}

/**'
 * Transaction 3: Assign an employee or transfer and employee to an existing shift 
 * Make sure both the employee and the shift exist before transfering
 */

export async function assignEmployeeToShiftTransaction(shiftId, employeeId){
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        //1. Verify the employee exists. 
        const employeeCheck = await client.query(
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
        const shiftRes = await client.query(updateQuery, [employeeId, shiftId]);

        if (shiftRes.rowCount === 0) {
             throw new Error(`Shift with ID ${shiftId} does not exist.`);
        }

        await client.query("COMMIT");
        return shiftRes.rows[0];
    }   catch (error) {
        await client.query("ROLLBACK");
        throw error;
        } finally {
        client.release();
        }
 }
