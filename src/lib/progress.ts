import type { Session } from "./engine/types";

// Week progress for the egg: which planned pieces the user checked off.

export const pieceKey = (s: Session) => `${s.taskId}|${s.day}|${s.start}|${s.end}`;

/** The engine plans in small pieces; a calendar block is the run of back-to-back pieces of one task. */
export function blockPieces(sessions: Session[], s: Session): Session[] {
  const same = sessions.filter((x) => x.taskId === s.taskId && x.day === s.day).sort((a, b) => a.start - b.start);
  const i = same.findIndex((x) => x.start === s.start && x.end === s.end);
  if (i < 0) return [s];
  let lo = i, hi = i;
  while (lo > 0 && same[lo - 1].end === same[lo].start) lo--;
  while (hi < same.length - 1 && same[hi].end === same[hi + 1].start) hi++;
  return same.slice(lo, hi + 1);
}

export function weekProgress(sessions: Session[], done: Set<string>) {
  let total = 0, finished = 0;
  for (const s of sessions) {
    const m = s.end - s.start;
    total += m;
    if (done.has(pieceKey(s))) finished += m;
  }
  return { total, finished, ratio: total ? finished / total : 0 };
}

/** Marker for "this whole task/goal is finished", stored alongside piece keys. */
export const taskKey = (id: string) => `task:${id}`;

/**
 * Progress over every task & goal: a task counts its checked-off planned time
 * (capped at what it needs), or all of it once the task itself is marked complete.
 */
export function goalProgress(tasks: { id: string; minutes: number }[], sessions: Session[], done: Set<string>) {
  const per = new Map<string, { done: number; total: number; ratio: number; complete: boolean }>();
  let total = 0, finished = 0;
  for (const t of tasks) {
    const complete = done.has(taskKey(t.id));
    const checked = sessions.filter((s) => s.taskId === t.id && done.has(pieceKey(s))).reduce((a, s) => a + s.end - s.start, 0);
    const d = complete ? t.minutes : Math.min(t.minutes, checked);
    per.set(t.id, { done: d, total: t.minutes, ratio: t.minutes ? d / t.minutes : 0, complete });
    total += t.minutes;
    finished += d;
  }
  return { per, total, finished, ratio: total ? finished / total : 0 };
}
