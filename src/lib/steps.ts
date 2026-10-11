import type { PlanStep, Resource, Session, Task } from "./engine/types";

const snap = (m: number) => Math.round(m / 30) * 30;
const str = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");

/** Search links always resolve to real results; model-written URLs are often invented, so we never use them. */
export function resourceUrl(r: Resource) {
  const q = encodeURIComponent(r.query);
  return r.kind === "youtube" ? `https://www.youtube.com/results?search_query=${q}` : `https://www.google.com/search?q=${q}`;
}

/** Untrusted plan (LLM or client) -> safe plan. */
export function sanitizePlan(raw: unknown): PlanStep[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const steps = raw.slice(0, 8).map((s: Record<string, unknown>) => {
    const res = (Array.isArray(s?.resources) ? s.resources : Array.isArray(s?.searches) ? s.searches : [])
      .slice(0, 4)
      .map((r: Record<string, unknown>): Resource | null => {
        const kind = r?.kind === "youtube" || r?.type === "youtube" ? "youtube" : "web";
        const query = str(r?.query, 100);
        return query ? { kind, query, label: str(r?.label, 60) || query } : null;
      })
      .filter((r): r is Resource => r !== null);
    const minutes = typeof s?.minutes === "number" && Number.isFinite(s.minutes) ? s.minutes : 60;
    return {
      title: str(s?.title, 80) || "Step",
      detail: str(s?.detail, 400),
      minutes: Math.min(240, Math.max(30, snap(minutes))),
      resources: res,
    };
  });
  return steps.length ? steps : undefined;
}

/**
 * Which plan steps does this session cover? Sessions are walked in time order and mapped onto the
 * cumulative minutes of the plan, so the 1st session covers step 1, the next continues where it left off.
 */
export function stepsForSession(task: Task, sessions: Session[], session: Session) {
  const plan = task.plan ?? [];
  if (!plan.length) return { index: 0, total: 0, steps: [] as { step: PlanStep; n: number }[] };
  const mine = sessions
    .filter((s) => s.taskId === task.id)
    .sort((a, b) => a.day - b.day || a.start - b.start);
  let offset = 0;
  let index = 0;
  for (let i = 0; i < mine.length; i++) {
    if (mine[i].day === session.day && mine[i].start === session.start) { index = i; break; }
    offset += mine[i].end - mine[i].start;
  }
  const from = offset, to = offset + (session.end - session.start);
  const planTotal = plan.reduce((a, s) => a + s.minutes, 0);
  // Stretch the plan over the task's scheduled minutes so every session maps to something.
  const scale = task.minutes / Math.max(1, planTotal);
  const out: { step: PlanStep; n: number }[] = [];
  let acc = 0;
  plan.forEach((step, n) => {
    const a = acc, b = acc + step.minutes * scale;
    acc = b;
    if (a < to && b > from) out.push({ step, n });
  });
  return { index, total: mine.length, steps: out };
}

/** Generic plan when no LLM is available. */
export function genericPlan(topic: string): PlanStep[] {
  const t = topic.trim();
  return [
    { title: "Watch how it's done", detail: `Watch one or two beginner walkthroughs of ${t} and note the key steps.`, minutes: 60, resources: [{ kind: "youtube", label: "Beginner tutorial", query: `${t} tutorial for beginners` }] },
    { title: "Gather what you need", detail: `List the tools, materials, or setup ${t} needs and get them ready.`, minutes: 30, resources: [{ kind: "web", label: "Beginner guide", query: `${t} beginner guide what you need` }] },
    { title: "First attempt", detail: `Try ${t} end to end, following a guide. Don't aim for perfect.`, minutes: 90, resources: [{ kind: "youtube", label: "Step-by-step", query: `${t} step by step` }] },
    { title: "Review and try again", detail: "Compare your result with the guide, fix the biggest mistake, and repeat.", minutes: 90, resources: [{ kind: "web", label: "Common mistakes", query: `${t} common mistakes` }] },
  ];
}
