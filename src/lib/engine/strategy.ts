import type { Strategy } from "./types";
import { rng } from "./generator";

/** Naive baseline: earliest deadline first, first free slot, 1h chunks, no notion of a livable day. */
export const BASELINE: Strategy = {
  name: "Baseline (EDF greedy)",
  order: { urgency: 1, importance: 0, size: 0, slack: 0 },
  slot: { preferred: 0, early: 1, spread: 0, lateNight: 0, deadlineBuffer: 0, adjacency: 0 },
  sessionLen: 60,
  minSession: 30,
  dailyCapFactor: 10,
  respectBreaks: false,
  passes: 1,
};

const clamp = (x: unknown, lo: number, hi: number, d: number) => {
  const n = typeof x === "number" && Number.isFinite(x) ? x : d;
  return Math.min(hi, Math.max(lo, n));
};
const snap30 = (x: number) => Math.round(x / 30) * 30;

/** Untrusted input (LLM output) -> a valid Strategy. Never throws. */
export function sanitize(raw: unknown, fallback: Strategy = BASELINE): Strategy {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const o = (r.order && typeof r.order === "object" ? r.order : {}) as Record<string, unknown>;
  const s = (r.slot && typeof r.slot === "object" ? r.slot : {}) as Record<string, unknown>;
  const f = fallback;
  return {
    name: typeof r.name === "string" ? r.name.slice(0, 60) : f.name,
    order: {
      urgency: clamp(o.urgency, -5, 5, f.order.urgency),
      importance: clamp(o.importance, -5, 5, f.order.importance),
      size: clamp(o.size, -5, 5, f.order.size),
      slack: clamp(o.slack, -5, 5, f.order.slack),
    },
    slot: {
      preferred: clamp(s.preferred, -5, 5, f.slot.preferred),
      early: clamp(s.early, -5, 5, f.slot.early),
      spread: clamp(s.spread, -5, 5, f.slot.spread),
      lateNight: clamp(s.lateNight, -5, 5, f.slot.lateNight),
      deadlineBuffer: clamp(s.deadlineBuffer, -5, 5, f.slot.deadlineBuffer),
      adjacency: clamp(s.adjacency, -5, 5, f.slot.adjacency),
    },
    sessionLen: snap30(clamp(r.sessionLen, 30, 180, f.sessionLen)),
    minSession: snap30(clamp(r.minSession, 30, 90, f.minSession)),
    dailyCapFactor: clamp(r.dailyCapFactor, 0.5, 10, f.dailyCapFactor),
    respectBreaks: typeof r.respectBreaks === "boolean" ? r.respectBreaks : f.respectBreaks,
    passes: Math.round(clamp(r.passes, 1, 3, f.passes)),
  };
}

/** Mock agent used when no LLM key is configured: biased random mutation. */
export function mutate(st: Strategy, seed: number, boldness: number, bias: Partial<Record<string, number>> = {}): Strategy {
  const r = rng(seed);
  const j = (x: number, key: string) => x + (r() - 0.5) * 2 * boldness + (bias[key] ?? 0) * r();
  return sanitize({
    name: `mut-${seed}`,
    order: {
      urgency: j(st.order.urgency, "urgency"), importance: j(st.order.importance, "importance"),
      size: j(st.order.size, "size"), slack: j(st.order.slack, "slack"),
    },
    slot: {
      preferred: j(st.slot.preferred, "preferred"), early: j(st.slot.early, "early"),
      spread: j(st.slot.spread, "spread"), lateNight: j(st.slot.lateNight, "lateNight"),
      deadlineBuffer: j(st.slot.deadlineBuffer, "deadlineBuffer"), adjacency: j(st.slot.adjacency, "adjacency"),
    },
    sessionLen: st.sessionLen + (r() < boldness / 3 ? (r() < 0.5 ? -30 : 30) : 0),
    minSession: st.minSession + (r() < boldness / 4 ? (r() < 0.5 ? -30 : 30) : 0),
    dailyCapFactor: r() < boldness / 3 ? Math.max(0.6, Math.min(10, (st.dailyCapFactor > 3 ? 1.2 : st.dailyCapFactor) + (r() - 0.5) * boldness)) : st.dailyCapFactor,
    respectBreaks: r() < boldness / 5 ? !st.respectBreaks : st.respectBreaks,
    passes: r() < boldness / 4 ? 1 + Math.floor(r() * 3) : st.passes,
  }, st);
}
