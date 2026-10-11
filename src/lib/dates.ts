// Real-date helpers. The engine plans one Mon..Sun template week (day 0 = Monday);
// the calendar pins that template to an actual week on the user's clock.

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Monday of the week containing d. */
export function mondayOf(d: Date) {
  const day = (d.getDay() + 6) % 7; // Mon = 0 ... Sun = 6
  return addDays(startOfDay(d), -day);
}

/** Engine day index (0 = Mon) for a date. */
export const dayIndex = (d: Date) => (d.getDay() + 6) % 7;

export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fromIso(s: string | null | undefined): Date | null {
  const m = typeof s === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Students plan the coming week on Sunday, so on Sundays default to next week. */
export function defaultPlanWeek(now: Date) {
  return dayIndex(now) === 6 ? addDays(mondayOf(now), 7) : mondayOf(now);
}

/** "Oct 12 – 18, 2026" or "Sep 28 – Oct 4, 2026" */
export function weekRange(monday: Date, withYear = true) {
  const sun = addDays(monday, 6);
  const a = `${MONTHS_SHORT[monday.getMonth()]} ${monday.getDate()}`;
  const b = sun.getMonth() === monday.getMonth() ? `${sun.getDate()}` : `${MONTHS_SHORT[sun.getMonth()]} ${sun.getDate()}`;
  if (!withYear) return `${a} – ${b}`;
  if (sun.getFullYear() !== monday.getFullYear()) return `${a}, ${monday.getFullYear()} – ${b}, ${sun.getFullYear()}`;
  return `${a} – ${b}, ${sun.getFullYear()}`;
}

/** Month title for a week: "October 2026" or "Sep – Oct 2026". */
export function weekMonthTitle(monday: Date) {
  const sun = addDays(monday, 6);
  if (sun.getMonth() === monday.getMonth()) return `${MONTHS[monday.getMonth()]} ${monday.getFullYear()}`;
  if (sun.getFullYear() === monday.getFullYear()) return `${MONTHS_SHORT[monday.getMonth()]} – ${MONTHS_SHORT[sun.getMonth()]} ${sun.getFullYear()}`;
  return `${MONTHS_SHORT[monday.getMonth()]} ${monday.getFullYear()} – ${MONTHS_SHORT[sun.getMonth()]} ${sun.getFullYear()}`;
}

/** 6 rows of 7 days (Mon-first) covering the month that contains `month`. */
export function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = mondayOf(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
