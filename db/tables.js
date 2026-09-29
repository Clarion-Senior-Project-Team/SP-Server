export async function dcreateTables(client) {
  await client.query(`
    -- Create type for user level
    DO $$ BEGIN
      CREATE TYPE user_role AS ENUM ('employee', 'employer', 'admin');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    -- Employee Table
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      username VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      user_level user_role NOT NULL DEFAULT 'employee'
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_email_lower
    ON employees (lower(email));

    CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_username_lower
    ON employees (lower(username));

    -- Schedules Table
    CREATE TABLE IF NOT EXISTS schedules (
      id SERIAL PRIMARY KEY,
      title VARCHAR(100) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Shifts Table
    CREATE TABLE IF NOT EXISTS shifts (
      id SERIAL PRIMARY KEY,
      schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      role VARCHAR(50),
      CONSTRAINT chk_shift_duration CHECK (end_time > start_time)
    );

    CREATE INDEX IF NOT EXISTS idx_shifts_schedule_id ON shifts(schedule_id);
    CREATE INDEX IF NOT EXISTS idx_shifts_employee_id ON shifts(employee_id);
  `);
}