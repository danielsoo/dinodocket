import {
  DAYS, DAY_NAMES, IMPORTANCE_WEIGHT, SLOT, SLOTS_PER_DAY,
  type Instance, type Schedule, type Session, type Strategy, type Task, type Unscheduled,
} from "./types";

const FREE = 0, FIXED = 1, WORK = 2, FLEX = 3; // FLEX = time held by an unlocked event
const LATE = 22 * 60;

export function fmtTime(min: number) {
  if (min >= 1440) return "11:59 PM"; // end of day, not the start of the next one
  const hh = Math.floor(min / 60) % 24;
  const mm = min % 60;
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${mm.toString().padStart(2, "0")} ${ampm}`;
}
export const dueLabel = (t: Task) => `${DAY_NAMES[t.dueDay]} ${fmtTime(t.dueMin)}`;
const abs = (day: number, min: number) => day * 1440 + min;

export function buildGrid(inst: Instance): number[][] {
  const grid = Array.from({ length: DAYS }, () => new Array(SLOTS_PER_DAY).fill(FREE));
  for (const e of inst.fixed) {
    const soft = e.locked === false;
    for (let s = Math.floor(e.start / SLOT); s < Math.ceil(e.end / SLOT); s++)
      if (!soft) grid[e.day][s] = FIXED;
      else if (grid[e.day][s] === FREE) grid[e.day][s] = FLEX;
  }
  return grid;
}

/** Free awake minutes before a task's deadline, given a grid. */
export function freeBefore(inst: Instance, grid: number[][], t: Task): number {
  const due = abs(t.dueDay, t.dueMin);
  const w = inst.profile.wake / SLOT, sl = inst.profile.sleep / SLOT;
  let free = 0;
  for (let d = 0; d < DAYS; d++)
    for (let s = w; s < sl; s++)
      if (grid[d][s] === FREE && abs(d, (s + 1) * SLOT) <= due) free += SLOT;
  return free;
}

function priority(inst: Instance, grid: number[][], t: Task, st: Strategy) {
  const hoursLeft = abs(t.dueDay, t.dueMin) / 60; // planning starts Monday 00:00
  const free = Math.max(30, freeBefore(inst, grid, t));
  const slackRatio = free / t.minutes; // < 1 means it cannot fully fit even alone
  return (
    st.order.urgency * (100 / (hoursLeft + 1)) +
    st.order.importance * IMPORTANCE_WEIGHT[t.importance] +
    st.order.size * (t.minutes / 60) -
    st.order.slack * Math.min(slackRatio, 10)
  );
}

export function schedule(inst: Instance, st: Strategy): Schedule {
  const p = inst.profile;
  const grid = buildGrid(inst);
  const initialGrid = grid.map((r) => [...r]);
  const load = new Array(DAYS).fill(0);
  const remaining = new Map(inst.tasks.map((t) => [t.id, t.minutes]));
  const sessions: Session[] = [];
  const wakeS = p.wake / SLOT, sleepS = p.sleep / SLOT;
  const passes = Math.max(1, Math.min(3, Math.round(st.passes)));
  const baseCap = p.maxFocusPerDay * st.dailyCapFactor;

  const order = [...inst.tasks].sort((a, b) => priority(inst, grid, b, st) - priority(inst, grid, a, st));

  // Last resort pass: if essential/high work still doesn't fit, it may use time held by UNLOCKED events.
  // Locked events are never touched. Notices tell the student which unlocked event gave up its time.
  const hasFlex = grid.some((r) => r.includes(FLEX));
  for (let pass = 1; pass <= passes + (hasFlex ? 1 : 0); pass++) {
    const flex = pass > passes;
    const cap = flex || pass >= 3 ? Infinity : pass === 1 ? baseCap : baseCap * 1.35;
    const breaks = st.respectBreaks && pass === 1;
    const minChunk = pass >= passes ? SLOT : Math.max(SLOT, st.minSession);
    for (const t of order) {
      if (flex && t.importance !== "essential" && t.importance !== "high") continue;
      const due = abs(t.dueDay, t.dueMin);
      let guard = 0;
      while ((remaining.get(t.id) ?? 0) > 0 && guard++ < 50) {
        const rem = remaining.get(t.id)!;
        let placed = false;
        let len = Math.min(Math.ceil(st.sessionLen / SLOT) * SLOT, Math.ceil(rem / SLOT) * SLOT);
        while (len >= Math.min(minChunk, Math.ceil(rem / SLOT) * SLOT) && !placed) {
          const n = len / SLOT;
          let best: { d: number; s: number; score: number } | null = null;
          for (let d = 0; d < DAYS; d++) {
            if (load[d] + len > cap) continue;
            for (let s = wakeS; s + n <= sleepS; s++) {
              const endAbs = abs(d, (s + n) * SLOT);
              if (endAbs > due) break;
              let ok = true;
              for (let k = 0; k < n; k++) { const c = grid[d][s + k]; if (c !== FREE && !(flex && c === FLEX)) { ok = false; break; } }
              if (!ok) continue;
              const before = s > 0 && grid[d][s - 1] !== FREE ? 1 : 0;
              const after = s + n < SLOTS_PER_DAY && grid[d][s + n] !== FREE ? 1 : 0;
              if (breaks && before + after > 0) continue;
              const start = s * SLOT, end = (s + n) * SLOT;
              const inFocus = Math.max(0, Math.min(end, p.focusEnd) - Math.max(start, p.focusStart)) / len;
              const late = Math.max(0, end - Math.max(start, LATE)) / 60;
              const score =
                st.slot.preferred * inFocus +
                st.slot.early * (1 - abs(d, start) / (DAYS * 1440)) -
                st.slot.spread * (load[d] / 60) -
                st.slot.lateNight * late +
                st.slot.deadlineBuffer * (due - endAbs >= 1440 ? 1 : 0) -
                st.slot.adjacency * (before + after);
              if (!best || score > best.score + 1e-9) best = { d, s, score };
            }
          }
          if (best) {
            for (let k = 0; k < n; k++) grid[best.d][best.s + k] = WORK;
            const used = Math.min(len, rem);
            sessions.push({ taskId: t.id, day: best.d, start: best.s * SLOT, end: best.s * SLOT + len });
            load[best.d] += len;
            remaining.set(t.id, rem - used);
            placed = true;
          } else len -= SLOT;
        }
        if (!placed) break;
      }
    }
  }

  // Merge back-to-back sessions of the same task for a cleaner calendar.
  sessions.sort((a, b) => a.day - b.day || a.start - b.start);
  const merged: Session[] = [];
  for (const s of sessions) {
    const last = merged[merged.length - 1];
    if (last && last.taskId === s.taskId && last.day === s.day && last.end === s.start) last.end = s.end;
    else merged.push({ ...s });
  }

  const unscheduled: Unscheduled[] = [];
  for (const t of inst.tasks) {
    const missing = remaining.get(t.id) ?? 0;
    if (missing <= 0) continue;
    const alone = freeBefore(inst, initialGrid, t);
    const reason =
      alone < t.minutes
        ? `Needs ${(t.minutes / 60).toFixed(1)}h, but only ${(alone / 60).toFixed(1)}h of awake time is free before ${dueLabel(t)} once fixed commitments are counted. This deadline cannot be met as stated.`
        : `Other higher-priority work and your daily limit use up the free time before ${dueLabel(t)}. ${(missing / 60).toFixed(1)}h is left unplaced.`;
    unscheduled.push({ taskId: t.id, missing, reason });
  }
  return { sessions: merged, unscheduled };
}
