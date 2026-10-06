const createEmployeeTable = async (conn) => {
  await conn.query(`
    -- Create type for user level
    DO $$ BEGIN
      CREATE TYPE user_role AS ENUM ('employee', 'employer', 'admin');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    -- Employee Table
    CREATE TABLE IF NOT EXISTS employees (
      id            SERIAL PRIMARY KEY,
      first_name    VARCHAR(50) NOT NULL,
      last_name     VARCHAR(50) NOT NULL,
      dob           DATE NOT NULL,
      phone         VARCHAR(20) NOT NULL,
      email         VARCHAR(255) NOT NULL,
      password      VARCHAR(255) NOT NULL,
      user_level    user_role NOT NULL DEFAULT 'employee',
      pto_balance   NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
      is_active     BOLEAN NOT NULL DEFAULT TRUE,
      CONSTRAINT chk_pto_non_negative CHECK (pto_balance >= 0)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_email_lower
    ON employees (lower(email));
  `);
};

const createHoursTable = async (conn) => {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS employee_pay_period_hours (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

      -- The date range for the pay period
      period_start_date DATE NOT NULL,
      period_end_date   DATE NOT NULL,

      regular_hours     NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
      overtime_hours    NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
      pto_hours         NUMERIC(6, 2) NOT NULL DEFAULT 0.00,

      closed            BOOLEAN NOT NULL DEFAULT FALSE,
      created_at        TIMESTAMPTZ DEFAULT NOW(),

      CONSTRAINT chk_period_dates CHECK (period_end_date >= period_start_date),
      CONSTRAINT chk_hours_non_negative CHECK (
        regular_hours >= 0 AND overtime_hours >= 0 AND pto_hours >= 0
      ),

      -- An employee can only be tracked once per pay period window
      CONSTRAINT uq_employee_pay_period UNIQUE (employee_id, period_start_date, period_end_date)
    );

    CREATE INDEX IF NOT EXISTS idx_pay_period_employee ON employee_pay_period_hours(employee_id);
    CREATE INDEX IF NOT EXISTS idx_pay_period_closed ON employee_pay_period_hours(closed);
  `);
};

const createSchedulesTable = async (conn) => {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schedules (
      id          SERIAL PRIMARY KEY,
      title       VARCHAR(100) NOT NULL,
      start_date  DATE NOT NULL,
      end_date    DATE NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);
};

const createTimeOffTables = async (conn) => {
  await conn.query(`
    -- Create type to track time off requests
    DO $$ BEGIN
      CREATE TYPE request_status AS ENUM ('pending', 'approved', 'denied', 'canceled');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    CREATE TABLE IF NOT EXISTS time_off_requests (
      id SERIAL PRIMARY KEY,

      -- ID of employee requesting off
      employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

      -- Time Window
      start_time      TIMESTAMPTZ NOT NULL,
      end_time        TIMESTAMPTZ NOT NULL,

      -- PTO Details
      hours_requested NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
      is_paid         BOOLEAN NOT NULL DEFAULT FALSE,
      reason          TEXT,

      -- Review Stage
      status          request_status NOT NULL DEFAULT 'pending',
      created_at      TIMESTAMPTZ DEFAULT NOW(),

      CONSTRAINT chk_time_off_duration CHECK (end_time > start_time),
      CONSTRAINT chk_positive_hours CHECK (hours_requested >= 0)
    );

    CREATE INDEX IF NOT EXISTS idx_time_off_employee_id ON time_off_requests(employee_id);
    CREATE INDEX IF NOT EXISTS idx_time_off_status ON time_off_requests(status);
  `);
};

const createShiftsTable = async (conn) => {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS shifts (
      id            SERIAL PRIMARY KEY,
      schedule_id   INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      employee_id   INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      start_time    TIMESTAMPTZ NOT NULL,
      end_time      TIMESTAMPTZ NOT NULL,
      role          VARCHAR(50),
      notes         TEXT,
      CONSTRAINT chk_shift_duration CHECK (end_time > start_time)
    );

    CREATE INDEX IF NOT EXISTS idx_shifts_schedule_id ON shifts(schedule_id);
    CREATE INDEX IF NOT EXISTS idx_shifts_employee_id ON shifts(employee_id);
  `);
};

const createTimePunchesTable = async (conn) => {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS time_punches (
      id            SERIAL PRIMARY KEY,
      employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      shift_id      INTEGER REFERENCES shifts(id) ON DELETE SET NULL,

      clock_in      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      clock_out     TIMESTAMPTZ, -- NULL while employee is currently clocked in
      break_minutes NUMERIC(4,2) NOT NULL DEFAULT 0.00,

      created_at    TIMESTAMPTZ DEFAULT NOW(),

      -- Clock out must be after clock in (only evaluated when clock_out is not NULL)
      CONSTRAINT chk_punch_order CHECK (clock_out IS NULL OR clock_out > clock_in)
    );

    -- Standard lookup index
    CREATE INDEX IF NOT EXISTS idx_punches_employee ON time_punches(employee_id);

    -- Partial index: Lightning fast lookups for currently active shifts
    CREATE INDEX IF NOT EXISTS idx_punches_active ON time_punches(employee_id) WHERE clock_out IS NULL;
  `);
};

export async function createAllTables(conn) {
  // Ordered by dependency: parent tables first, child foreign keys second
  await createEmployeeTable(conn);
  await createHoursTable(conn);
  await createSchedulesTable(conn);
  await createTimeOffTables(conn);
  await createShiftsTable(conn);
  await createTimePunchesTable(conn);
}
