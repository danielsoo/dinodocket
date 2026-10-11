// Time model: a week is 7 days (0 = Mon ... 6 = Sun). Times are minutes from
// the start of that day. The engine works on a 30-minute slot grid.

export const SLOT = 30;
export const SLOTS_PER_DAY = (24 * 60) / SLOT; // 48
export const DAYS = 7;
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type Importance = "essential" | "high" | "normal" | "flexible";
export type Category = "deadline" | "ongoing" | "aspiration" | "priority";

export const IMPORTANCE_WEIGHT: Record<Importance, number> = {
  essential: 4,
  high: 3,
  normal: 2,
  flexible: 1,
};

export interface FixedEvent {
  id: string;
  title: string;
  day: number;
  start: number; // minutes from day start
  end: number;
  kind: "class" | "work" | "club" | "event" | "personal";
  locked: boolean; // locked events can never be moved by the engine
}

export interface Resource {
  kind: "youtube" | "web";
  label: string; // what the link is for, e.g. "Lamination technique"
  query: string; // search query; we link to search results, never to model-invented URLs
}

export interface PlanStep {
  title: string;
  detail: string;
  minutes: number;
  resources: Resource[];
}

export interface Task {
  id: string;
  title: string;
  minutes: number; // total estimated work
  dueDay: number; // day index of the deadline
  dueMin: number; // minute of that day the deadline falls on
  importance: Importance;
  categories: Category[];
  plan?: PlanStep[]; // optional step-by-step breakdown shown in the session detail view
}

export interface Profile {
  wake: number; // minute of day the student is available from
  sleep: number; // minute of day the student stops (<= 24*60)
  focusStart: number; // preferred focus window
  focusEnd: number;
  sessionLen: number; // preferred session length in minutes
  maxFocusPerDay: number; // minutes of task work per day that still feels livable
  breakMin: number; // preferred gap between blocks
}

export interface Instance {
  id: string;
  name: string;
  profile: Profile;
  fixed: FixedEvent[];
  tasks: Task[];
}

export interface Session {
  taskId: string;
  day: number;
  start: number;
  end: number;
}

export interface Unscheduled {
  taskId: string;
  missing: number; // minutes that could not be placed
  reason: string;
}

export interface Schedule {
  sessions: Session[];
  unscheduled: Unscheduled[];
}

// The strategy is the "genome" the agent team tunes.
export interface Strategy {
  name: string;
  order: {
    urgency: number; // earlier deadlines first
    importance: number; // essential/high first
    size: number; // bigger tasks first (positive) or last (negative)
    slack: number; // tasks with little free time before the deadline first
  };
  slot: {
    preferred: number; // bonus for slots inside the focus window
    early: number; // bonus for earlier placement (fights procrastination)
    spread: number; // penalty for days that already carry work
    lateNight: number; // penalty for slots after 22:00
    deadlineBuffer: number; // bonus for finishing >= 24h before the deadline
    adjacency: number; // penalty for touching another block with no break
  };
  sessionLen: number; // target chunk length (30..180)
  minSession: number; // smallest chunk worth scheduling (30..90)
  dailyCapFactor: number; // multiplier on profile.maxFocusPerDay (first pass)
  respectBreaks: boolean; // forbid zero-gap placement in the first pass
  passes: number; // 1..3 placement passes; later passes relax the daily cap
}
