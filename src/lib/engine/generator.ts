import type { Category, FixedEvent, Importance, Instance, Profile, Task } from "./types";

// Mulberry32: tiny deterministic PRNG so every instance is reproducible by seed.
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const h = (x: number) => Math.round(x * 60);
const snap = (m: number) => Math.round(m / 30) * 30;

const COURSES = [
  "CMPSC 465", "MATH 230", "STAT 318", "PHYS 212", "ECON 302", "ENGL 202C",
  "CMPEN 331", "PSYCH 100", "CHEM 110", "MATH 220", "CMPSC 311", "HIST 20",
];
const NAMES = ["Alex", "Jordan", "Sam", "Taylor", "Riley", "Casey", "Morgan", "Jamie", "Avery", "Quinn"];

export function generateInstance(seed: number): Instance {
  const r = rng(seed);
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  const between = (a: number, b: number) => a + r() * (b - a);
  const int = (a: number, b: number) => Math.floor(between(a, b + 1));

  // Chronotype shapes the profile.
  const nightOwl = r() < 0.4;
  const profile: Profile = nightOwl
    ? { wake: h(9.5), sleep: h(24), focusStart: h(14), focusEnd: h(23), sessionLen: pick([60, 90, 120]), maxFocusPerDay: h(between(3.5, 5.5)), breakMin: 30 }
    : { wake: h(7), sleep: h(23), focusStart: h(8), focusEnd: h(17), sessionLen: pick([60, 90, 120]), maxFocusPerDay: h(between(3.5, 5.5)), breakMin: 30 };
  profile.maxFocusPerDay = snap(profile.maxFocusPerDay);

  const fixed: FixedEvent[] = [];
  let fid = 0;
  const add = (title: string, day: number, start: number, end: number, kind: FixedEvent["kind"]) =>
    fixed.push({ id: `f${fid++}`, title, day, start: snap(start), end: snap(end), kind, locked: true });

  // Classes: alternate MWF and TR patterns, avoid overlaps by using distinct start hours.
  const nCourses = int(4, 6);
  const courses = [...COURSES].sort(() => r() - 0.5).slice(0, nCourses);
  const usedStarts = new Set<string>();
  courses.forEach((c) => {
    const mwf = r() < 0.5;
    let start = 0;
    for (let tries = 0; tries < 20; tries++) {
      start = h(int(8, 16));
      const key = `${mwf}-${start}`;
      if (!usedStarts.has(key)) { usedStarts.add(key); break; }
    }
    const days = mwf ? [0, 2, 4] : [1, 3];
    const len = mwf ? 60 : 90;
    days.forEach((d) => add(c, d, start, start + len, "class"));
  });

  // Part-time job shifts.
  const shifts = int(0, 3);
  const shiftDays = [0, 1, 2, 3, 4, 5, 6].sort(() => r() - 0.5).slice(0, shifts);
  shiftDays.forEach((d) => {
    const start = d >= 5 ? h(int(10, 14)) : h(int(17, 18));
    add("Work shift", d, start, start + h(int(3, 5)), "work");
  });

  // Clubs / THON / meetings.
  const clubs = int(1, 3);
  for (let i = 0; i < clubs; i++) {
    const d = int(0, 4);
    const start = h(int(19, 20));
    add(pick(["Club meeting", "THON committee", "ACM meeting", "Intramurals"]), d, start, start + h(1.5), "club");
  }

  // Remove fixed events that collide with an earlier one (keeps the generator simple).
  const clean: FixedEvent[] = [];
  for (const e of fixed) {
    if (!clean.some((o) => o.day === e.day && e.start < o.end && o.start < e.end)) clean.push(e);
  }

  // Tasks. Load intensity varies so some weeks are comfortable and some are overloaded.
  const intensity = between(1.2, 2.6);
  const tasks: Task[] = [];
  let tid = 0;
  const addTask = (title: string, hours: number, dueDay: number, dueMin: number, importance: Importance, categories: Category[]) =>
    tasks.push({ id: `t${tid++}`, title, minutes: Math.max(30, snap(h(hours * intensity))), dueDay, dueMin, importance, categories });

  const nAssign = int(3, 6);
  for (let i = 0; i < nAssign; i++) {
    const c = courses[i % courses.length];
    const kind = pick(["Problem set", "Lab report", "Reading response", "Programming project", "Essay draft"]);
    const hours = kind === "Programming project" ? between(5, 9) : kind === "Essay draft" ? between(4, 7) : between(2, 5);
    addTask(`${c} ${kind}`, hours, int(1, 6), pick([h(9), h(14), h(23.5)]), pick<Importance>(["essential", "high", "high", "normal"]), ["deadline"]);
  }
  if (r() < 0.7) {
    const c = pick(courses);
    addTask(`${c} exam prep`, between(5, 9), int(2, 5), h(int(8, 18)), "essential", ["deadline", "priority"]);
  }
  addTask("Gym / exercise", between(2, 4), 6, h(23.5), "flexible", ["ongoing", "aspiration"]);
  if (r() < 0.6) addTask(pick(["Side project", "Portfolio site", "Learn Rust", "Internship applications"]), between(3, 6), 6, h(23.5), pick<Importance>(["normal", "flexible", "high"]), ["aspiration"]);
  if (r() < 0.5) addTask("Grade Calc II homework", between(2, 4), int(2, 4), h(23.5), "high", ["ongoing", "deadline"]);

  return { id: `seed-${seed}`, name: `${pick(NAMES)} (#${seed})`, profile, fixed: clean, tasks };
}

export const TRAIN_SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);
export const TEST_SEEDS = Array.from({ length: 15 }, (_, i) => 1001 + i);
