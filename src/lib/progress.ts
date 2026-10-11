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
