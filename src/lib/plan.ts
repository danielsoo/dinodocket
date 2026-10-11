import { score } from "./engine/evaluate";
import { schedule, dueLabel } from "./engine/scheduler";
import { sanitize } from "./engine/strategy";
import { DAY_NAMES, type Category, type FixedEvent, type Importance, type Instance, type Schedule, type Strategy, type Task } from "./engine/types";
import { DEFAULT_STRATEGY } from "./demo";
import { sanitizePlan } from "./steps";

const IMPS: Importance[] = ["essential", "high", "normal", "flexible"];
const CATS: Category[] = ["deadline", "ongoing", "aspiration", "priority"];
const KINDS: FixedEvent["kind"][] = ["class", "work", "club", "event", "personal", "meeting"];
const safeLink = (x: unknown) => (typeof x === "string" && /^https?:\/\/\S+$/i.test(x.trim()) ? x.trim().slice(0, 300) : undefined);
const snap = (m: number) => Math.round(m / 30) * 30;
const num = (x: unknown, lo: number, hi: number, d: number) => {
  const n = typeof x === "number" && Number.isFinite(x) ? x : d;
  return Math.min(hi, Math.max(lo, n));
};
const str = (x: unknown, d: string) => (typeof x === "string" && x.trim() ? x.trim().slice(0, 80) : d);

/** Never trust the client: rebuild the instance from known fields only. */
export function sanitizeInstance(raw: unknown): Instance {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const p = (r.profile && typeof r.profile === "object" ? r.profile : {}) as Record<string, unknown>;
  const wake = snap(num(p.wake, 0, 1380, 480));
  const sleep = snap(num(p.sleep, wake + 60, 1440, 1440));
  const fixed: FixedEvent[] = (Array.isArray(r.fixed) ? r.fixed : []).slice(0, 80).map((e: Record<string, unknown>, i) => {
    const start = snap(num(e.start, 0, 1410, 540));
    return {
      id: str(e.id, `f${i}`),
      title: str(e.title, "Event"),
      day: Math.round(num(e.day, 0, 6, 0)),
      start,
      end: Math.max(start + 30, snap(num(e.end, 30, 1440, start + 60))),
      kind: KINDS.includes(e.kind as FixedEvent["kind"]) ? (e.kind as FixedEvent["kind"]) : "event",
      locked: true, // the engine never moves fixed events, whatever the client says
      link: safeLink(e.link),
      location: typeof e.location === "string" && e.location.trim() ? e.location.trim().slice(0, 80) : undefined,
      with: typeof e.with === "string" && e.with.trim() ? e.with.trim().slice(0, 80) : undefined,
    };
  });
  const tasks: Task[] = (Array.isArray(r.tasks) ? r.tasks : []).slice(0, 40).map((t: Record<string, unknown>, i) => ({
    id: str(t.id, `t${i}`),
    title: str(t.title, "Task"),
    minutes: Math.max(30, snap(num(t.minutes, 30, 40 * 60, 60))),
    dueDay: Math.round(num(t.dueDay, 0, 6, 6)),
    dueMin: snap(num(t.dueMin, 30, 1440, 1410)),
    importance: IMPS.includes(t.importance as Importance) ? (t.importance as Importance) : "normal",
    categories: (Array.isArray(t.categories) ? t.categories : []).filter((c): c is Category => CATS.includes(c as Category)),
    plan: sanitizePlan(t.plan),
  }));
  return {
    id: str(r.id, "user"),
    name: str(r.name, "Student"),
    profile: {
      wake, sleep,
      focusStart: snap(num(p.focusStart, 0, 1440, 540)),
      focusEnd: snap(num(p.focusEnd, 0, 1440, 1080)),
      sessionLen: snap(num(p.sessionLen, 30, 180, 90)),
      maxFocusPerDay: snap(num(p.maxFocusPerDay, 60, 960, 270)),
      breakMin: snap(num(p.breakMin, 0, 120, 30)),
    },
    fixed,
    tasks,
  };
}

const hrs = (m: number) => `${(m / 60).toFixed(m % 60 ? 1 : 0)}h`;

export function explain(inst: Instance, sch: Schedule): string[] {
  const lines: string[] = [];
  const need = inst.tasks.reduce((a, t) => a + t.minutes, 0);
  const placed = sch.sessions.reduce((a, s) => a + (s.end - s.start), 0);
  lines.push(`Placed ${hrs(placed)} of ${hrs(need)} requested work in ${sch.sessions.length} sessions. Fixed commitments were not moved.`);

  const load = new Array(7).fill(0);
  sch.sessions.forEach((s) => (load[s.day] += s.end - s.start));
  const over = load.map((l, d) => ({ d, l })).filter((x) => x.l > inst.profile.maxFocusPerDay);
  if (over.length)
    lines.push(`Over your ${hrs(inst.profile.maxFocusPerDay)}/day limit on ${over.map((x) => `${DAY_NAMES[x.d]} (${hrs(x.l)})`).join(", ")} to fit deadlines.`);
  else if (placed) lines.push(`Every day stays within your ${hrs(inst.profile.maxFocusPerDay)} daily work limit.`);

  const tasks = new Map(inst.tasks.map((t) => [t.id, t]));
  const short = new Set(sch.unscheduled.map((u) => u.taskId));
  const tight: { t: (typeof inst.tasks)[number]; slackH: number }[] = [];
  for (const t of inst.tasks) {
    const ss = sch.sessions.filter((s) => s.taskId === t.id);
    if (!ss.length || short.has(t.id)) continue;
    const last = ss.reduce((a, s) => (s.day * 1440 + s.end > a.day * 1440 + a.end ? s : a));
    const slackH = (t.dueDay * 1440 + t.dueMin - (last.day * 1440 + last.end)) / 60;
    if ((t.importance === "essential" || t.importance === "high") && slackH < 24) tight.push({ t, slackH });
  }
  tight
    .sort((a, b) => a.slackH - b.slackH)
    .slice(0, 3)
    .forEach(({ t, slackH }) => lines.push(`${t.title} finishes ${slackH.toFixed(1)}h before it is due (${dueLabel(t)}). Little room if something slips.`));
  for (const u of sch.unscheduled) {
    const t = tasks.get(u.taskId);
    if (t) lines.push(`⚠ ${t.title} (${t.importance}): ${u.reason}`);
  }
  if (sch.unscheduled.length)
    lines.push("Options: lower the hours on a flexible goal, move a deadline if possible, or allow a longer day. Tell me which and I'll redo the plan.");
  return lines;
}

export function plan(rawInstance: unknown, rawStrategy?: unknown) {
  const instance = sanitizeInstance(rawInstance);
  const strategy: Strategy = rawStrategy ? sanitize(rawStrategy, DEFAULT_STRATEGY) : DEFAULT_STRATEGY;
  const sch = schedule(instance, strategy);
  const sc = score(instance, sch);
  // Defense in depth: a schedule that fails validation is never returned as a proposal.
  if (!sc.feasible) return { ok: false as const, violations: sc.violations };
  return { ok: true as const, schedule: sch, score: sc, explanation: explain(instance, sch), strategy: strategy.name };
}
