import { pool } from "./pool.js";

// ============================================================================
// EMPLOYEE OPERATIONS
// ============================================================================

export const getAllEmployees = async () => {
    const { rows } = await pool.query(
        `SELECT id, first_name, last_name, email, user_level, password, pto_balance, is_active
         FROM employees`
    );
    return rows[0] ?? null;
}

export const findEmployee = async (email) => {
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, email, user_level, password, pto_balance, is_active
     FROM employees 
     WHERE lower(email) = lower($1)`,
    [email]
  );
  return rows[0] ?? null;
};

export const findEmployeeById = async (userId) => {
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, email, user_level, password, pto_balance, is_active
     FROM employees 
     WHERE id = $1`,
    [userId]
  );
  return rows[0] ?? null;
};

export async function createEmployee({
  first_name,
  last_name,
  dob,
  phone,
  email,
  password, // Must be pre-hashed (e.g. bcrypt/argon2)
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

export async function updateEmployee(employeeId, {
  first_name,
  last_name,
  dob,
  phone,
  email,
  password,    // Must be hashed before passing in, or left undefined
  user_level,
  pto_balance,
  is_active
}) {
  const queryText = `
    UPDATE employees
    SET 
      first_name  = COALESCE($1, first_name),
      last_name   = COALESCE($2, last_name),
      dob         = COALESCE($3, dob),
      phone       = COALESCE($4, phone),
      email       = COALESCE($5, email),
      password    = COALESCE($6, password),
      user_level  = COALESCE($7, user_level),
      pto_balance = COALESCE($8, pto_balance),
      is_active   = COALESCE($9, is_active)
    WHERE id = $10
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

  try {
    const { rows } = await pool.query(queryText, [
      first_name ?? null,
      last_name ?? null,
      dob ?? null,
      phone ?? null,
      email ?? null,
      password ?? null,
      user_level ?? null,
      pto_balance ?? null,
      is_active ?? null,
      employeeId
    ]);

    if (rows.length === 0) {
      throw new Error(`Employee with ID ${employeeId} not found.`);
    }

    return rows[0];
  } catch (error) {
    if (error.code === "23505") {
      throw new Error("An account with this email already exists.");
    }
    if (error.constraint === "chk_pto_non_negative") {
      throw new Error("PTO balance cannot be negative.");
    }
    throw error;
  }
}

export async function deleteEmployeeTransaction(employeeId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Detach employee from schedules they authored
    await client.query(
      `UPDATE schedules 
       SET created_by = NULL 
       WHERE created_by = $1;`,
      [employeeId]
    );

    // 2. Delete employee (cascades to time_punches, time_off_requests, pay period hours, etc.)
    const deleteRes = await client.query(
      `DELETE FROM employees 
       WHERE id = $1 
       RETURNING id, first_name, last_name, email;`,
      [employeeId]
    );

    if (deleteRes.rowCount === 0) {
      throw new Error(`Employee with ID ${employeeId} not found.`);
    }

    await client.query("COMMIT");

    return {
      success: true,
      deletedEmployee: deleteRes.rows[0],
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// SCHEDULE & SHIFT OPERATIONS
// ============================================================================

export async function getSchedules(scheduleId = null) {
  const params = [];
  let whereClause = "";

  if (scheduleId !== null && scheduleId !== undefined) {
    params.push(scheduleId);
    whereClause = "WHERE s.id = $1";
  }

  const query = `
    SELECT 
      s.id,
      s.title,
      s.start_date,
      s.end_date,
      s.created_at,
      json_build_object(
        'id', e.id,
        'first_name', e.first_name,
        'last_name', e.last_name,
        'email', e.email
      ) AS created_by,
      COALESCE(
        json_agg(
          json_build_object(
            'id', sh.id,
            'employee_id', sh.employee_id,
            'employee_name', CASE 
              WHEN emp.id IS NOT NULL THEN emp.first_name || ' ' || emp.last_name 
              ELSE NULL 
            END,
            'start_time', sh.start_time,
            'end_time', sh.end_time,
            'role', sh.role,
            'notes', sh.notes
          ) ORDER BY sh.start_time ASC
        ) FILTER (WHERE sh.id IS NOT NULL),
        '[]'
      ) AS shifts
    FROM schedules s
    LEFT JOIN employees e ON s.created_by = e.id
    LEFT JOIN shifts sh ON s.id = sh.schedule_id
    LEFT JOIN employees emp ON sh.employee_id = emp.id
    ${whereClause}
    GROUP BY s.id, e.id
    ORDER BY s.start_date DESC;
  `;

  const { rows } = await pool.query(query, params);

  if (scheduleId !== null && scheduleId !== undefined) {
    return rows[0] ?? null;
  }
  return rows;
}

export async function createScheduleWithShifts({
  title,
  start_date,
  end_date,
  created_by = null,
  shifts = [],
}) {
  const conn = await pool.connect();

  try {
    await conn.query("BEGIN");

    // Insert schedule
    const scheduleQuery = `
      INSERT INTO schedules (title, start_date, end_date, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING id, title, start_date, end_date, created_by, created_at;
    `;

    const scheduleRes = await conn.query(scheduleQuery, [
      title,
      start_date,
      end_date,
      created_by,
    ]);
    const schedule = scheduleRes.rows[0];

    // Insert child shifts
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

export async function updateScheduleTransaction(scheduleId, {
  title,
  start_date,
  end_date,
  shifts = []
}) {
  const conn = await pool.connect();

  try {
    await conn.query("BEGIN");

    // 1. Update schedule
    const updateScheduleSQL = `
      UPDATE schedules
      SET title = COALESCE($1, title),
          start_date = COALESCE($2, start_date),
          end_date = COALESCE($3, end_date)
      WHERE id = $4
      RETURNING id, title, start_date, end_date, created_by, created_at;
    `;
    const scheduleRes = await conn.query(updateScheduleSQL, [
      title,
      start_date,
      end_date,
      scheduleId,
    ]);

    if (scheduleRes.rowCount === 0) {
      throw new Error(`Schedule with ID ${scheduleId} not found.`);
    }

    const updatedSchedule = scheduleRes.rows[0];

    // 2. Remove deleted shifts
    const retainedShiftIds = shifts
      .map((s) => s.id)
      .filter((id) => Boolean(id));

    if (retainedShiftIds.length > 0) {
      await conn.query(
        `DELETE FROM shifts 
         WHERE schedule_id = $1 AND id != ALL($2::int[])`,
        [scheduleId, retainedShiftIds]
      );
    } else if (shifts.length === 0) {
      await conn.query(`DELETE FROM shifts WHERE schedule_id = $1`, [scheduleId]);
    }

    // 3. Upsert shifts
    const savedShifts = [];
    for (const shift of shifts) {
      if (shift.id) {
        const updateShiftSQL = `
          UPDATE shifts
          SET employee_id = $1,
              start_time = $2,
              end_time = $3,
              role = $4,
              notes = $5
          WHERE id = $6 AND schedule_id = $7
          RETURNING id, schedule_id, employee_id, start_time, end_time, role, notes;
        `;
        const res = await conn.query(updateShiftSQL, [
          shift.employee_id || null,
          shift.start_time,
          shift.end_time,
          shift.role || null,
          shift.notes || null,
          shift.id,
          scheduleId,
        ]);
        if (res.rowCount > 0) savedShifts.push(res.rows[0]);
      } else {
        const insertShiftSQL = `
          INSERT INTO shifts (schedule_id, employee_id, start_time, end_time, role, notes)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, schedule_id, employee_id, start_time, end_time, role, notes;
        `;
        const res = await conn.query(insertShiftSQL, [
          scheduleId,
          shift.employee_id || null,
          shift.start_time,
          shift.end_time,
          shift.role || null,
          shift.notes || null,
        ]);
        savedShifts.push(res.rows[0]);
      }
    }

    await conn.query("COMMIT");

    return {
      ...updatedSchedule,
      shifts: savedShifts,
    };
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally {
    conn.release();
  }
}

export async function deleteScheduleTransaction(scheduleId) {
  const conn = await pool.connect();

  try {
    await conn.query("BEGIN");

    // Detach punch references before cascade deletion
    await conn.query(
      `UPDATE time_punches 
       SET shift_id = NULL 
       WHERE shift_id IN (
         SELECT id FROM shifts WHERE schedule_id = $1
       );`,
      [scheduleId]
    );

    const deleteRes = await conn.query(
      `DELETE FROM schedules 
       WHERE id = $1 
       RETURNING id, title;`,
      [scheduleId]
    );

    if (deleteRes.rowCount === 0) {
      throw new Error(`Schedule with ID ${scheduleId} not found.`);
    }

    await conn.query("COMMIT");

    return {
      success: true,
      deletedSchedule: deleteRes.rows[0],
    };
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally {
    conn.release();
  }
}

export async function assignEmployeeToShift(shiftId, employeeId) {
  const conn = await pool.connect();

  try {
    await conn.query("BEGIN");

    const employeeCheck = await conn.query(
      "SELECT id, first_name, last_name, is_active FROM employees WHERE id = $1",
      [employeeId]
    );

    if (employeeCheck.rowCount === 0) {
      throw new Error(`Employee with ID ${employeeId} does not exist.`);
    }
    if (!employeeCheck.rows[0].is_active) {
      throw new Error("Cannot assign inactive employee to shift.");
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

// ============================================================================
// TIME PUNCH & PAY PERIOD OPERATIONS
// ============================================================================

export async function getActivePunch(employeeId) {
  const { rows } = await pool.query(
    `SELECT id, employee_id, shift_id, clock_in 
     FROM time_punches 
     WHERE employee_id = $1 AND clock_out IS NULL`,
    [employeeId]
  );
  return rows[0] ?? null;
}

export async function clockIn(employee_id, shift_id = null) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

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

    // Compute net hours worked
    const grossHours =
      (new Date(punch.clock_out).getTime() - new Date(punch.clock_in).getTime()) /
      (1000 * 60 * 60);

    const breakHours = breakMins / 60;
    const netHours = Math.max(0, grossHours - breakHours);
    const roundedNetHours = Number(netHours.toFixed(2));

    // Credit to current open pay period
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

export async function rolloverPayPeriod({
  new_period_start,
  new_period_end,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Close open periods
    await client.query(`
      UPDATE employee_pay_period_hours
      SET closed = TRUE
      WHERE closed = FALSE;
    `);

    // Initialize new pay periods for active employees
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

export async function getEmployeeCurrentHours(employeeId) {
  const { rows } = await pool.query(
    `SELECT 
       id,
       employee_id,
       period_start_date,
       period_end_date,
       regular_hours,
       overtime_hours,
       pto_hours,
       (regular_hours + overtime_hours + pto_hours) AS total_hours
     FROM employee_pay_period_hours
     WHERE employee_id = $1 AND closed = FALSE;`,
    [employeeId]
  );
  return rows[0] ?? null;
}

// ============================================================================
// TIME OFF & PTO OPERATIONS
// ============================================================================

export async function submitTimeOffRequest({
  employee_id,
  start_time,
  end_time,
  hours_requested = 0.00,
  is_paid = false,
  reason = null,
}) {
  const { rows } = await pool.query(
    `INSERT INTO time_off_requests (
       employee_id,
       start_time,
       end_time,
       hours_requested,
       is_paid,
       reason,
       status
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING *;`,
    [employee_id, start_time, end_time, hours_requested, is_paid, reason]
  );
  return rows[0];
}

export async function reviewTimeOffRequest(requestId, decision) {
  // decision must be 'approved' or 'denied'
  if (!["approved", "denied"].includes(decision)) {
    throw new Error("Decision must be either 'approved' or 'denied'.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Lock the time off request row
    const reqRes = await client.query(
      `SELECT id, employee_id, hours_requested, is_paid, status 
       FROM time_off_requests 
       WHERE id = $1 FOR UPDATE;`,
      [requestId]
    );

    const request = reqRes.rows[0];
    if (!request) throw new Error("Time off request not found.");
    if (request.status !== "pending") {
      throw new Error(`Request has already been ${request.status}.`);
    }

    // 2. If approved and paid, deduct from employee's PTO balance and add to pay period
    if (decision === "approved" && request.is_paid && Number(request.hours_requested) > 0) {
      const empRes = await client.query(
        `SELECT pto_balance FROM employees WHERE id = $1 FOR UPDATE;`,
        [request.employee_id]
      );

      const currentBalance = Number(empRes.rows[0].pto_balance);
      const requested = Number(request.hours_requested);

      if (currentBalance < requested) {
        throw new Error(
          `Insufficient PTO balance. Employee has ${currentBalance} hrs, requested ${requested} hrs.`
        );
      }

      // Deduct from employee balance
      await client.query(
        `UPDATE employees 
         SET pto_balance = pto_balance - $1 
         WHERE id = $2;`,
        [requested, request.employee_id]
      );

      // Credit to open pay period
      await client.query(
        `UPDATE employee_pay_period_hours
         SET pto_hours = pto_hours + $1
         WHERE employee_id = $2 AND closed = FALSE;`,
        [requested, request.employee_id]
      );
    }

    // 3. Update the request status
    const updateRes = await client.query(
      `UPDATE time_off_requests 
       SET status = $1 
       WHERE id = $2 
       RETURNING *;`,
      [decision, requestId]
    );

    await client.query("COMMIT");
    return updateRes.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
