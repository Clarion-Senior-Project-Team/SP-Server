// Weekly schedule page (view only for now).
//
// The whole grid is drawn from one list of shifts. Each shift looks like
//   { id, schedule_id, employee_id, employee_name, start_time, end_time, role, notes }
// employee_id and employee_name are null for an open shift that nobody has
// been assigned to yet.

// ---- Where the shifts come from ---------------------------------------
// This is the only part that knows where the data lives. It reads the
// schedule route that api/schedules/routes.js sets up:
//
//   GET /api/schedules  ->  { schedules: [ { id, title, start_date, end_date,
//                              created_at, created_by, shifts: [ ... ] } ] }
//
// Every shift already comes back nested inside its schedule, with the
// employee's name filled in. That route can't filter by date yet, so this file
// gathers the shifts from every schedule and keeps only the ones in the week
// on screen. Adding ?sample=1 to the page address shows made-up shifts
// instead, for checking the layout when the backend or database is off.
const USING_SAMPLE_DATA = new URLSearchParams(window.location.search).has("sample");

async function loadShifts(weekStart) {
  if (USING_SAMPLE_DATA) return sampleShifts(weekStart);

  let res;
  try {
    res = await fetch("/api/schedules", { headers: { Accept: "application/json" } });
  } catch {
    throw new Error("Could not reach the schedule route. Check that the server is running.");
  }
  if (res.status === 401) {
    window.location.href = "/auth/login"; // the session ended, so sign in again
    return [];
  }
  if (!res.ok) throw new Error("The server could not load the schedule. Try again in a moment.");

  const body = await res.json();
  const schedules = Array.isArray(body.schedules) ? body.schedules : [];
  const weekEnd = addDays(weekStart, 7);

  return schedules
    .flatMap((schedule) => (schedule.shifts ?? []).map((shift) => ({ ...shift, schedule_id: schedule.id })))
    .filter((shift) => {
      const start = new Date(shift.start_time);
      return start >= weekStart && start < weekEnd;
    });
}

// Sample data. Full-time staff work the same hours every week, and the
// part-time staff have a few shorter shifts, which is what the client
// described. Days are 0 = Monday through 6 = Sunday.
const SAMPLE_PEOPLE = [
  { id: 1, name: "Maria Lopez", role: "Lead teacher", days: [0, 1, 2, 3, 4], start: [7, 30], end: [15, 30] },
  { id: 2, name: "Sam Okafor", role: "Teacher", days: [0, 1, 2, 3, 4], start: [8, 0], end: [16, 0] },
  { id: 3, name: "Jordan Pace", role: "Classroom aide", days: [1, 3], start: [14, 0], end: [18, 0] },
  { id: 4, name: "Devon Ricci", role: "Classroom aide", days: [2], start: [15, 0], end: [18, 0] },
  { id: null, name: null, role: "Classroom aide", days: [4], start: [14, 0], end: [18, 0] }, // open shift
];

function sampleShifts(weekStart) {
  const shifts = [];
  let nextId = 1;
  for (const person of SAMPLE_PEOPLE) {
    for (const day of person.days) {
      const start = addDays(weekStart, day);
      start.setHours(person.start[0], person.start[1], 0, 0);
      const end = addDays(weekStart, day);
      end.setHours(person.end[0], person.end[1], 0, 0);
      shifts.push({
        id: nextId++,
        schedule_id: 1,
        employee_id: person.id,
        employee_name: person.name,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        role: person.role,
        notes: null,
      });
    }
  }
  return shifts;
}

// ---- Dates and times --------------------------------------------------
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// The grid starts on Monday. getDay() counts Sunday as 0, so Sunday has to
// count as the end of the week (6 days back) instead of the start of a new one.
function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

// Works on a copy, so the date that was passed in is never changed.
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// 7:30 AM becomes "7:30a", and 3:00 PM becomes "3p".
function formatTime(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = h < 12 ? "a" : "p";
  return m === 0 ? `${hour12}${suffix}` : `${hour12}:${String(m).padStart(2, "0")}${suffix}`;
}

function hoursBetween(start, end) {
  return (end - start) / 3600000;
}

function formatWeekLabel(weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const short = { month: "short", day: "numeric" };
  return `${weekStart.toLocaleDateString(undefined, short)} – ${weekEnd.toLocaleDateString(undefined, { ...short, year: "numeric" })}`;
}

// ---- Colors -----------------------------------------------------------
// One color per employee, so a person's shifts are easy to follow across
// the week. These five were checked for colorblind safety. Anyone past the
// fifth gets gray and is told apart by the name on their row instead of by color.
const PALETTE = ["#1B8368", "#C99A2E", "#2E6FA7", "#D14A2B", "#8E3A8F"];
const GRAY = "#8A8778";

function buildColorMap(employeeIds) {
  const map = new Map();
  [...employeeIds].sort((a, b) => a - b).forEach((id, i) => {
    map.set(id, i < PALETTE.length ? PALETTE[i] : GRAY);
  });
  return map;
}

// ---- Drawing the grid -------------------------------------------------
// Everything is built with createElement and textContent, never innerHTML.
// Names and notes will come from the database, and textContent guarantees
// they're shown as plain text and can't be read as HTML.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderGrid(weekStart, shifts) {
  const table = document.getElementById("grid");
  table.replaceChildren();

  const todayKey = new Date().toDateString();
  const days = DAY_NAMES.map((name, i) => ({ name, date: addDays(weekStart, i) }));

  // Header row: a blank corner, one column per day, and a total hours column.
  const thead = el("thead");
  const headRow = el("tr");
  const corner = el("th", null, "Employee");
  corner.scope = "col";
  headRow.append(corner);
  for (const day of days) {
    const th = el("th", day.date.toDateString() === todayKey ? "today" : null);
    th.scope = "col";
    th.append(day.name, el("span", "day-num", String(day.date.getDate())));
    headRow.append(th);
  }
  const hoursHead = el("th", null, "Hours");
  hoursHead.scope = "col";
  headRow.append(hoursHead);
  thead.append(headRow);
  table.append(thead);

  if (shifts.length === 0) {
    const tbody = el("tbody");
    const row = el("tr");
    const cell = el("td", "empty-message", "No shifts are scheduled this week.");
    cell.colSpan = days.length + 2;
    row.append(cell);
    tbody.append(row);
    table.append(tbody);
    return;
  }

  // Sort the shifts into rows: one per employee, plus a row for open shifts.
  // Each shift also needs to know which day column it belongs in.
  const people = new Map(); // employee_id -> { name, shifts: [] }
  const openShifts = [];
  for (const shift of shifts) {
    const start = new Date(shift.start_time);
    const end = new Date(shift.end_time);
    const dayIndex = Math.round((new Date(start.getFullYear(), start.getMonth(), start.getDate()) - weekStart) / 86400000);
    const entry = { ...shift, start, end, dayIndex };
    if (shift.employee_id == null) {
      openShifts.push(entry);
    } else {
      if (!people.has(shift.employee_id)) people.set(shift.employee_id, { name: shift.employee_name ?? `Employee ${shift.employee_id}`, shifts: [] });
      people.get(shift.employee_id).shifts.push(entry);
    }
  }

  const colors = buildColorMap(people.keys());
  const rows = [...people.entries()]
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([id, p]) => ({ id, name: p.name, shifts: p.shifts, color: colors.get(id), open: false }));
  if (openShifts.length > 0) {
    rows.push({ id: null, name: "Open shifts", shifts: openShifts, color: GRAY, open: true });
  }

  const tbody = el("tbody");
  for (const rowData of rows) {
    const row = el("tr", rowData.open ? "open-row" : null);

    const nameCell = el("th");
    nameCell.scope = "row";
    nameCell.append(el("span", "person", rowData.name));
    if (rowData.open) nameCell.append(el("span", "person-sub", "Needs someone assigned"));
    row.append(nameCell);

    let totalHours = 0;
    for (let i = 0; i < days.length; i++) {
      const isToday = days[i].date.toDateString() === todayKey;
      const cell = el("td", isToday ? "today" : null);
      const todays = rowData.shifts
        .filter((s) => s.dayIndex === i)
        .sort((a, b) => a.start - b.start);

      if (todays.length === 0) {
        cell.classList.add("empty-cell");
        cell.textContent = "–";
      }
      for (const s of todays) {
        totalHours += hoursBetween(s.start, s.end);
        const chip = el("div", "chip");
        chip.style.setProperty("--c", rowData.color);
        chip.title = `${rowData.name}: ${formatTime(s.start)} – ${formatTime(s.end)}${s.role ? ` (${s.role})` : ""}${s.notes ? `. ${s.notes}` : ""}`;
        chip.append(el("span", "chip-time", `${formatTime(s.start)}–${formatTime(s.end)}`));
        if (s.role) chip.append(el("span", "chip-role", s.role));
        cell.append(chip);
      }
      row.append(cell);
    }

    row.append(el("td", "hours-cell", `${totalHours.toFixed(1)}h`));
    tbody.append(row);
  }
  table.append(tbody);
}

// ---- Week navigation --------------------------------------------------
let weekStart = startOfWeek(new Date());
let latestRequest = 0; // if Next is clicked twice quickly, only the newest answer is drawn

async function showWeek() {
  const request = ++latestRequest;
  const errorBanner = document.getElementById("errorBanner");
  document.getElementById("weekLabel").textContent = formatWeekLabel(weekStart);
  errorBanner.hidden = true;

  try {
    const shifts = await loadShifts(weekStart);
    if (request !== latestRequest) return;
    renderGrid(weekStart, shifts);
  } catch (err) {
    if (request !== latestRequest) return;
    errorBanner.textContent = err.message || "Could not load the schedule.";
    errorBanner.hidden = false;
  }
}

document.getElementById("prevWeek").addEventListener("click", () => {
  weekStart = addDays(weekStart, -7);
  showWeek();
});
document.getElementById("nextWeek").addEventListener("click", () => {
  weekStart = addDays(weekStart, 7);
  showWeek();
});
document.getElementById("thisWeek").addEventListener("click", () => {
  weekStart = startOfWeek(new Date());
  showWeek();
});

// Same sign-out as the home page. /auth/logout only accepts POST.
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch("/auth/logout", { method: "POST" });
  window.location.href = "/auth/login";
});

document.getElementById("sampleNotice").hidden = !USING_SAMPLE_DATA;
showWeek();
