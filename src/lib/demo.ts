import type { Instance, Strategy } from "./engine/types";

const h = (x: number) => Math.round(x * 60);

let n = 0;
const ev = (title: string, days: number[], s: number, e: number, kind: Instance["fixed"][number]["kind"] = "class") =>
  days.map((day) => ({ id: `d${n++}`, title, day, start: h(s), end: h(e), kind, locked: true }));

export const DEMO: Instance = {
  id: "demo",
  name: "Demo student",
  profile: { wake: h(8), sleep: h(24), focusStart: h(9), focusEnd: h(18), sessionLen: 90, maxFocusPerDay: h(4.5), breakMin: 30 },
  fixed: [
    ...ev("CMPSC 465", [0, 2, 4], 9, 10),
    ...ev("MATH 230 (TA)", [1, 3], 10.5, 12),
    ...ev("STAT 318", [1, 3], 13.5, 15),
    ...ev("CMPEN 331", [0, 2, 4], 11, 12),
    ...ev("ENGL 202C", [0, 2], 14, 15),
    ...ev("Work shift", [2], 17, 21, "work"),
    ...ev("Work shift", [5], 11, 15, "work"),
    ...ev("THON committee", [1], 19, 20.5, "club"),
    ...ev("ACM Web meeting", [3], 19, 20.5, "club"),
    { id: "m1", title: "Internship recruiter call", day: 3, start: h(15.5), end: h(16), kind: "meeting", locked: true, with: "recruiter@company.com" },
    { id: "m2", title: "Research group sync", day: 0, start: h(16), end: h(16.5), kind: "meeting", locked: true, location: "Library study room 2B" },
  ],
  tasks: [
    { id: "t1", title: "CMPSC 465 problem set", minutes: h(6), dueDay: 3, dueMin: h(23.5), importance: "essential", categories: ["deadline"] },
    { id: "t2", title: "STAT 318 midterm prep", minutes: h(7), dueDay: 4, dueMin: h(13.5), importance: "essential", categories: ["deadline", "priority"] },
    { id: "t3", title: "ENGL 202C essay draft", minutes: h(5), dueDay: 2, dueMin: h(14), importance: "high", categories: ["deadline"] },
    { id: "t4", title: "Grade Calc II homework", minutes: h(3), dueDay: 3, dueMin: h(23.5), importance: "high", categories: ["ongoing", "deadline"] },
    { id: "t5", title: "Gym", minutes: h(3), dueDay: 6, dueMin: h(23.5), importance: "flexible", categories: ["ongoing", "aspiration"] },
    { id: "t6", title: "Portfolio site", minutes: h(4), dueDay: 6, dueMin: h(23.5), importance: "normal", categories: ["aspiration"] },
  ],
};

/** Default planner strategy: hand-set, sensible weights. The Agent Lab can replace it with an optimized one. */
export const DEFAULT_STRATEGY: Strategy = {
  name: "Balanced v0",
  order: { urgency: 1, importance: 1.5, size: 0.3, slack: 1 },
  slot: { preferred: 2, early: 0.5, spread: 0.6, lateNight: 1.5, deadlineBuffer: 2, adjacency: 1 },
  sessionLen: 90,
  minSession: 60,
  dailyCapFactor: 1,
  respectBreaks: true,
  passes: 3,
};
