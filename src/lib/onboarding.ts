// Onboarding questions asked right after sign-up.
// Every answer either changes the engine's Profile / Strategy directly,
// or is kept as context for Dino. Nothing leaves the browser.

import type { Instance, Profile, Strategy } from "./engine/types";

export type Role = "undergrad" | "grad" | "working-student" | "professional";
export type Year = "freshman" | "sophomore" | "junior" | "senior" | "masters" | "phd" | "na";
export type Peak = "morning" | "afternoon" | "evening" | "night";
export type WorkStyle = "last-minute" | "mix" | "early";
export type Nudge = "minimal" | "balanced" | "high";

export interface Answers {
  role: Role;
  year: Year;
  wake: number; // minutes from midnight
  sleep: number; // minutes from midnight, 1440 = midnight or later
  peak: Peak;
  sessionLen: 30 | 60 | 90 | 120;
  dailyHours: 2 | 3 | 4.5 | 6;
  workStyle: WorkStyle;
  commitments: string[];
  goals: string[];
  nudge: Nudge;
}

export const DEFAULT_ANSWERS: Answers = {
  role: "undergrad",
  year: "junior",
  wake: 8 * 60,
  sleep: 24 * 60,
  peak: "afternoon",
  sessionLen: 90,
  dailyHours: 4.5,
  workStyle: "mix",
  commitments: [],
  goals: [],
  nudge: "balanced",
};

export const ROLES: { v: Role; label: string; hint: string }[] = [
  { v: "undergrad", label: "Undergrad", hint: "Classes, homework, exams" },
  { v: "grad", label: "Grad student", hint: "Research, TA, coursework" },
  { v: "working-student", label: "Working + studying", hint: "Shifts around classes" },
  { v: "professional", label: "Working full time", hint: "Meetings and side goals" },
];

export const YEARS: { v: Year; label: string; roles: Role[] }[] = [
  { v: "freshman", label: "1st year", roles: ["undergrad", "working-student"] },
  { v: "sophomore", label: "2nd year", roles: ["undergrad", "working-student"] },
  { v: "junior", label: "3rd year", roles: ["undergrad", "working-student"] },
  { v: "senior", label: "4th year+", roles: ["undergrad", "working-student"] },
  { v: "masters", label: "Master's", roles: ["grad", "working-student"] },
  { v: "phd", label: "PhD", roles: ["grad"] },
];

export const PEAKS: { v: Peak; label: string; range: string; start: number; end: number }[] = [
  { v: "morning", label: "Morning", range: "8 AM – 12 PM", start: 8 * 60, end: 12 * 60 },
  { v: "afternoon", label: "Afternoon", range: "12 – 5 PM", start: 12 * 60, end: 17 * 60 },
  { v: "evening", label: "Evening", range: "5 – 9 PM", start: 17 * 60, end: 21 * 60 },
  { v: "night", label: "Night owl", range: "8 PM – midnight", start: 20 * 60, end: 24 * 60 },
];

export const SESSIONS: { v: Answers["sessionLen"]; label: string; hint: string }[] = [
  { v: 30, label: "30 min", hint: "Short sprints" },
  { v: 60, label: "1 hour", hint: "Steady blocks" },
  { v: 90, label: "90 min", hint: "Deep work" },
  { v: 120, label: "2 hours+", hint: "Long hauls" },
];

export const DAILY: { v: Answers["dailyHours"]; label: string; hint: string }[] = [
  { v: 2, label: "~2 hours", hint: "Light" },
  { v: 3, label: "~3 hours", hint: "Moderate" },
  { v: 4.5, label: "~4–5 hours", hint: "Solid" },
  { v: 6, label: "6+ hours", hint: "Heavy" },
];

export const STYLES: { v: WorkStyle; label: string; hint: string }[] = [
  { v: "last-minute", label: "Right before the deadline", hint: "Dino will start you earlier" },
  { v: "mix", label: "Depends on the task", hint: "Balanced" },
  { v: "early", label: "Way ahead of time", hint: "Dino keeps big buffers" },
];

export const COMMITMENTS = ["Part-time job", "Club / org", "Athletics", "Research", "TA / tutoring", "Caregiving"];
export const GOALS = ["Keep my GPA up", "Land an internship", "Exercise regularly", "Sleep more", "Side project", "Less stress"];

export const NUDGES: { v: Nudge; label: string; hint: string }[] = [
  { v: "minimal", label: "Only when it matters", hint: "Conflicts and missed deadlines" },
  { v: "balanced", label: "A daily check-in", hint: "What's next today" },
  { v: "high", label: "Keep me on track", hint: "Reminders before each block" },
];

export const timeLabel = (m: number) => {
  if (m >= 1440) return "Midnight";
  const h = Math.floor(m / 60), mm = m % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};

export const WAKE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 11].map((h) => h * 60);
// The engine's day ends at midnight, so "after midnight" maps to 1440.
export const SLEEP_OPTIONS = [21, 22, 22.5, 23, 23.5, 24].map((h) => h * 60);

/** Answers → the engine's Profile. */
export function toProfile(a: Answers): Profile {
  const peak = PEAKS.find((p) => p.v === a.peak) ?? PEAKS[1];
  const wake = a.wake;
  const sleep = Math.max(wake + 120, Math.min(1440, a.sleep));
  return {
    wake,
    sleep,
    focusStart: Math.max(wake, peak.start),
    focusEnd: Math.min(sleep, peak.end),
    sessionLen: a.sessionLen,
    maxFocusPerDay: Math.round(a.dailyHours * 60),
    breakMin: a.sessionLen >= 90 ? 30 : 0,
  };
}

/** Answers → small nudges on top of whatever strategy the user already has. */
export function tuneStrategy(base: Strategy, a: Answers): Strategy {
  const s: Strategy = JSON.parse(JSON.stringify(base));
  s.sessionLen = a.sessionLen;
  s.minSession = Math.min(60, a.sessionLen);
  if (a.workStyle === "last-minute") {
    s.slot.early = Math.max(s.slot.early, 1.2);
    s.slot.deadlineBuffer = Math.max(s.slot.deadlineBuffer, 3);
  } else if (a.workStyle === "early") {
    s.slot.early = Math.max(s.slot.early, 1);
    s.slot.deadlineBuffer = Math.max(s.slot.deadlineBuffer, 2.5);
  }
  // Night owls shouldn't be pushed out of their best hours.
  if (a.peak === "night") s.slot.lateNight = Math.min(s.slot.lateNight, 0.3);
  return s;
}

const KEY = "dinodocket.onboarding";
const INSTANCE_KEY = "dinodocket.v3.instance";
const STRATEGY_KEY = "dinodocket.strategy";

export function loadAnswers(): Answers | null {
  try {
    const v = localStorage.getItem(KEY);
    return v ? { ...DEFAULT_ANSWERS, ...(JSON.parse(v) as Partial<Answers>) } : null;
  } catch {
    return null;
  }
}

/** Save answers and write them into the planner's saved instance and strategy. */
export function applyAnswers(a: Answers, name: string, demo: Instance, baseStrategy: Strategy) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
    const raw = localStorage.getItem(INSTANCE_KEY);
    const inst: Instance = raw ? (JSON.parse(raw) as Instance) : JSON.parse(JSON.stringify(demo));
    inst.profile = toProfile(a);
    inst.name = name || inst.name;
    localStorage.setItem(INSTANCE_KEY, JSON.stringify(inst));
    // The approved plan was made for the old profile; let the user regenerate.
    localStorage.removeItem("dinodocket.v3.approved");
    const rawS = localStorage.getItem(STRATEGY_KEY);
    const strat = rawS ? (JSON.parse(rawS) as Strategy) : baseStrategy;
    localStorage.setItem(STRATEGY_KEY, JSON.stringify(tuneStrategy(strat, a)));
  } catch {}
}

/** One-line summary Dino can say back so personalization is visible. */
export function summary(a: Answers) {
  const p = toProfile(a);
  const peak = PEAKS.find((x) => x.v === a.peak)!;
  const style =
    a.workStyle === "last-minute" ? "I'll start big tasks earlier than you would" : a.workStyle === "early" ? "I'll keep a buffer before every deadline" : "I'll balance early starts with breathing room";
  const end = p.sleep >= 1440 ? "midnight" : timeLabel(p.sleep);
  return `I'll plan between ${timeLabel(p.wake)} and ${end}, put hard work in your ${peak.label.toLowerCase()} focus window, use ${a.sessionLen}-minute blocks, keep each day under about ${a.dailyHours} hours, and ${style}.`;
}
