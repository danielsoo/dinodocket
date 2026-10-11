import { IMPORTANCE_WEIGHT, SLOT, type Instance, type Schedule, type Strategy } from "./types";
import { schedule } from "./scheduler";

const abs = (day: number, min: number) => day * 1440 + min;

/** Hard-constraint validator. Independent of the scheduler: it trusts nothing. */
export function validate(inst: Instance, sch: Schedule): string[] {
  const v: string[] = [];
  const p = inst.profile;
  const tasks = new Map(inst.tasks.map((t) => [t.id, t]));
  const total = new Map<string, number>();
  // Fixed events may overlap each other (real double-bookings happen; we surface them as a notice).
  // What the engine must never do is put work on top of anything.
  const blocks = [
    ...inst.fixed.map((e) => ({ label: e.title, day: e.day, start: e.start, end: e.end, fixed: true })),
    ...sch.sessions.map((s) => ({ label: tasks.get(s.taskId)?.title ?? s.taskId, day: s.day, start: s.start, end: s.end, fixed: false })),
  ];
  for (const s of sch.sessions) {
    const t = tasks.get(s.taskId);
    if (!t) { v.push(`Session for unknown task ${s.taskId}`); continue; }
    if (s.end <= s.start) v.push(`${t.title}: empty or negative session`);
    if (s.start % SLOT || s.end % SLOT) v.push(`${t.title}: not on the 30-minute grid`);
    if (s.day < 0 || s.day > 6) v.push(`${t.title}: invalid day`);
    if (s.start < p.wake || s.end > p.sleep) v.push(`${t.title}: scheduled outside awake hours`);
    if (abs(s.day, s.end) > abs(t.dueDay, t.dueMin)) v.push(`${t.title}: session ends after the deadline`);
    total.set(t.id, (total.get(t.id) ?? 0) + (s.end - s.start));
  }
  for (const [id, m] of total) {
    const t = tasks.get(id)!;
    if (m > Math.ceil(t.minutes / SLOT) * SLOT) v.push(`${t.title}: more time scheduled than the task needs`);
  }
  for (let i = 0; i < blocks.length; i++)
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j];
      if (a.fixed && b.fixed) continue;
      if (a.day === b.day && a.start < b.end && b.start < a.end) v.push(`Overlap: ${a.label} and ${b.label}`);
    }
  return v;
}

export interface ScoreBreakdown {
  total: number; // 0..100, 0 if any hard violation
  feasible: boolean;
  completion: number; // 0..1 importance-weighted share of required work placed
  focusFit: number; // 0..1 share of work inside the preferred focus window
  livable: number; // 0..1 how well daily load stays under the student's limit
  breaks: number; // 0..1 share of sessions with breathing room on both sides
  buffer: number; // 0..1 share of essential/high work finished >= 24h early
  violations: string[];
}

export const WEIGHTS = { completion: 50, focusFit: 15, livable: 15, breaks: 10, buffer: 10 };

export function score(inst: Instance, sch: Schedule): ScoreBreakdown {
  const violations = validate(inst, sch);
  const p = inst.profile;
  const tasks = new Map(inst.tasks.map((t) => [t.id, t]));

  const placed = new Map<string, number>();
  for (const s of sch.sessions) placed.set(s.taskId, (placed.get(s.taskId) ?? 0) + (s.end - s.start));

  let wSum = 0, wDone = 0;
  for (const t of inst.tasks) {
    const w = IMPORTANCE_WEIGHT[t.importance];
    wSum += w;
    wDone += w * Math.min(1, (placed.get(t.id) ?? 0) / t.minutes);
  }
  const completion = wSum ? wDone / wSum : 1;

  let work = 0, inFocus = 0;
  const load = new Array(7).fill(0);
  for (const s of sch.sessions) {
    const len = s.end - s.start;
    work += len;
    inFocus += Math.max(0, Math.min(s.end, p.focusEnd) - Math.max(s.start, p.focusStart));
    load[s.day] += len;
  }
  const focusFit = work ? inFocus / work : 1;
  const excess = load.reduce((a, l) => a + Math.max(0, l - p.maxFocusPerDay), 0);
  const livable = work ? Math.max(0, 1 - excess / work) : 1;

  const blocks = [
    ...inst.fixed.map((e) => ({ day: e.day, start: e.start, end: e.end })),
    ...sch.sessions.map((s) => ({ day: s.day, start: s.start, end: s.end })),
  ];
  let withBreak = 0;
  for (const s of sch.sessions) {
    const tight = blocks.some(
      (b) => b.day === s.day && !(b.start === s.start && b.end === s.end) &&
        ((b.end <= s.start && s.start - b.end < p.breakMin) || (b.start >= s.end && b.start - s.end < p.breakMin)),
    );
    if (!tight) withBreak++;
  }
  const breaks = sch.sessions.length ? withBreak / sch.sessions.length : 1;

  let critical = 0, early = 0;
  for (const s of sch.sessions) {
    const t = tasks.get(s.taskId);
    if (!t || (t.importance !== "essential" && t.importance !== "high")) continue;
    const len = s.end - s.start;
    critical += len;
    if (abs(t.dueDay, t.dueMin) - abs(s.day, s.end) >= 1440) early += len;
  }
  const buffer = critical ? early / critical : 1;

  const feasible = violations.length === 0;
  // Quality points are scaled by completion, so a strategy cannot buy a "livable" week
  // by silently dropping required work (an early optimizer run exploited exactly that).
  const total = feasible
    ? WEIGHTS.completion * completion +
      completion * (WEIGHTS.focusFit * focusFit + WEIGHTS.livable * livable + WEIGHTS.breaks * breaks + WEIGHTS.buffer * buffer)
    : 0;
  return { total, feasible, completion, focusFit, livable, breaks, buffer, violations };
}

export interface EvalResult {
  mean: number;
  feasibleRate: number;
  components: Omit<ScoreBreakdown, "total" | "feasible" | "violations">;
  perInstance: { id: string; total: number }[];
  worst: { id: string; total: number; weakest: string }[];
}

export function evaluateStrategy(st: Strategy, instances: Instance[]): EvalResult {
  const per = instances.map((inst) => ({ inst, s: score(inst, schedule(inst, st)) }));
  const n = per.length || 1;
  const avg = (k: "completion" | "focusFit" | "livable" | "breaks" | "buffer") => per.reduce((a, x) => a + x.s[k], 0) / n;
  const components = { completion: avg("completion"), focusFit: avg("focusFit"), livable: avg("livable"), breaks: avg("breaks"), buffer: avg("buffer") };
  const worst = [...per]
    .sort((a, b) => a.s.total - b.s.total)
    .slice(0, 3)
    .map(({ inst, s }) => {
      const parts = (["completion", "focusFit", "livable", "breaks", "buffer"] as const)
        .map((k) => [k, (1 - s[k]) * WEIGHTS[k]] as const)
        .sort((a, b) => b[1] - a[1]);
      return { id: inst.id, total: +s.total.toFixed(2), weakest: s.feasible ? `${parts[0][0]} (lost ${parts[0][1].toFixed(1)} pts)` : `INVALID: ${s.violations[0]}` };
    });
  return {
    mean: per.reduce((a, x) => a + x.s.total, 0) / n,
    feasibleRate: per.filter((x) => x.s.feasible).length / n,
    components,
    perInstance: per.map(({ inst, s }) => ({ id: inst.id, total: +s.total.toFixed(2) })),
    worst,
  };
}
