import { pool } from "./pool.js";

// Helper: Find employee by email (uses lowercase index)
export const findEmployee = async (email) => {
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, email, user_level, password, pto_balance
     FROM employees 
     WHERE lower(email) = lower($1)`,
    [email]
  );
  return rows[0] ?? null;
};

// Helper: Find employee by ID
export const findEmployeeById = async (userId) => {
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, email, user_level, password, pto_balance
     FROM employees 
     WHERE id = $1`,
    [userId]
  );
  return rows[0] ?? null;
};

// Transaction: Register Employee
export async function createEmployee({
  first_name,
  last_name,
  dob,
  phone,
  email,
  password,
  user_level = "employee",
  pto_balance = 0.00,
  is_active = true,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const queryText = `
      INSERT INTO employees (
        first_name,
        last_name,
        dob,
        phone,
        email,
        password,
        user_level,
        pto_balance,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING 
        id, 
        first_name, 
        last_name, 
        dob, 
        phone, 
        email, 
        user_level, 
        pto_balance,
        is_active;
    `;

    const values = [
      first_name,
      last_name,
      dob,
      phone,
      email,
      password,
      user_level,
      pto_balance,
      is_active,
    ];

    const result = await client.query(queryText, values);

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      throw new Error("An account with this email already exists.");
    }
    if (error.constraint === "chk_pto_non_negative") {
      throw new Error("Initial PTO balance cannot be negative.");
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function rolloverPayPeriod({
  new_period_start,
  new_period_end,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Close active periods
    await client.query(`
      UPDATE employee_pay_period_hours
      SET closed = TRUE
      WHERE closed = FALSE;
    `);

    // 2. Only seed records for currently active employees
    const resetSQL = `
      INSERT INTO employee_pay_period_hours (
        employee_id,
        period_start_date,
        period_end_date,
        regular_hours,
        overtime_hours,
        pto_hours,
        closed
      )
      SELECT 
        id AS employee_id,
        $1::DATE AS period_start_date,
        $2::DATE AS period_end_date,
        0.00 AS regular_hours,
        0.00 AS overtime_hours,
        0.00 AS pto_hours,
        FALSE AS closed
      FROM employees
      WHERE is_active = TRUE
      ON CONFLICT (employee_id, period_start_date, period_end_date) DO NOTHING
      RETURNING *;
    `;

    const result = await client.query(resetSQL, [new_period_start, new_period_end]);

    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Transaction: Create schedule and nested shifts atomically
export async function createScheduleWithShifts({
  title,
  start_date,
  end_date,
  shifts = [],
}) {
  const conn = await pool.connect();

  try {
    await conn.query("BEGIN");

    const scheduleQuery = `
      INSERT INTO schedules (title, start_date, end_date)
      VALUES ($1, $2, $3)
      RETURNING id, title, start_date, end_date, created_at;
    `;

    const scheduleRes = await conn.query(scheduleQuery, [
      title,
      start_date,
      end_date,
    ]);
    const schedule = scheduleRes.rows[0];

    const shiftQuery = `
      INSERT INTO shifts (schedule_id, employee_id, start_time, end_time, role, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, schedule_id, employee_id, start_time, end_time, role, notes;
    `;

    const createdShifts = [];
    for (const shift of shifts) {
      const shiftRes = await conn.query(shiftQuery, [
        schedule.id,
        shift.employee_id || null,
        shift.start_time,
        shift.end_time,
        shift.role || null,
        shift.notes || null,
      ]);
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

// Transaction: Assign employee to shift
export async function assignEmployeeToShift(shiftId, employeeId) {
  const conn = await pool.connect();

  try {
    await conn.query("BEGIN");

    const employeeCheck = await conn.query(
      "SELECT id, first_name, last_name FROM employees WHERE id = $1",
      [employeeId]
    );

    if (employeeCheck.rowCount === 0) {
      throw new Error(`Employee with ID ${employeeId} does not exist.`);
    }

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

export async function clockIn(employee_id, shift_id = null) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Ensure employee is active
    const empCheck = await client.query(
      `SELECT id, is_active FROM employees WHERE id = $1`,
      [employee_id]
    );

    if (empCheck.rowCount === 0) {
      throw new Error("Employee not found.");
    }
    if (!empCheck.rows[0].is_active) {
      throw new Error("Cannot clock in: employee account is inactive.");
    }

    // 2. Ensure they do not already have an open punch
    const activeCheck = await client.query(
      `SELECT id FROM time_punches WHERE employee_id = $1 AND clock_out IS NULL`,
      [employee_id]
    );

    if (activeCheck.rowCount > 0) {
      throw new Error("Employee is already clocked in.");
    }

    const insertSQL = `
      INSERT INTO time_punches (employee_id, shift_id, clock_in)
      VALUES ($1, $2, NOW())
      RETURNING id, employee_id, shift_id, clock_in;
    `;

    const { rows } = await client.query(insertSQL, [employee_id, shift_id]);

    await client.query("COMMIT");
    return rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function clockOut(employee_id, break_minutes = 0) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const breakMins = Number(break_minutes) || 0;
    if (breakMins < 0) {
      throw new Error("Break minutes cannot be negative.");
    }

    // 1. Locate and close open punch, saving break duration
    const punchRes = await client.query(
      `UPDATE time_punches
       SET clock_out = NOW(),
           break_minutes = $2
       WHERE employee_id = $1 AND clock_out IS NULL
       RETURNING id, employee_id, clock_in, clock_out, break_minutes;`,
      [employee_id, breakMins]
    );

    if (punchRes.rowCount === 0) {
      throw new Error("No active clock-in found for this employee.");
    }

    const punch = punchRes.rows[0];

    // 2. Gross elapsed hours
    const grossHours =
      (new Date(punch.clock_out).getTime() - new Date(punch.clock_in).getTime()) /
      (1000 * 60 * 60);

    // 3. Net hours = gross hours - unpaid break hours
    const breakHours = breakMins / 60;
    const netHours = Math.max(0, grossHours - breakHours);
    const roundedNetHours = Number(netHours.toFixed(2));

    // 4. Credit net hours to the open pay period
    const periodRes = await client.query(
      `UPDATE employee_pay_period_hours
       SET regular_hours = regular_hours + $1
       WHERE employee_id = $2 AND closed = FALSE
       RETURNING id, regular_hours, overtime_hours;`,
      [roundedNetHours, employee_id]
    );

    if (periodRes.rowCount === 0) {
      throw new Error("No active pay period found to credit these hours.");
    }

    await client.query("COMMIT");

    return {
      punch,
      grossHours: Number(grossHours.toFixed(2)),
      breakMinutesDeducted: breakMins,
      netHoursAdded: roundedNetHours,
      periodSummary: periodRes.rows[0],
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function deactivateEmployee(employeeId) {
  const { rows } = await pool.query(
    `UPDATE employees 
     SET is_active = FALSE 
     WHERE id = $1 
     RETURNING id, first_name, last_name, is_active;`,
    [employeeId]
  );

  if (rows.length === 0) {
    throw new Error("Employee not found.");
  }
  return rows[0];
}
