import { DAY_NAMES, type Instance, type Schedule } from "./engine/types";
import { fmtTime, dueLabel } from "./engine/scheduler";

export type NoticeAction =
  | { kind: "draft"; label: string; text: string }
  | { kind: "breakdown"; label: string; taskTitle: string }
  | { kind: "ask"; label: string; message: string };

export interface Notice {
  id: string;
  level: "warn" | "info";
  title: string;
  detail: string;
  action?: NoticeAction;
}

const hrs = (m: number) => `${(m / 60).toFixed(m % 60 ? 1 : 0)}h`;

/**
 * Things a good chief of staff would flag before they become problems.
 * Pure function of the week and its plan, so it is cheap to recompute on every change.
 */
export function computeNotices(inst: Instance, sch: Schedule | null): Notice[] {
  const out: Notice[] = [];

  // 1. Meetings that are missing the one detail you need to actually show up.
  for (const e of inst.fixed) {
    if (e.kind !== "meeting" || e.link || e.location) continue;
    const when = `${DAY_NAMES[e.day]} ${fmtTime(e.start)}`;
    out.push({
      id: `nolink-${e.id}`,
      level: "warn",
      title: `"${e.title}" has no meeting link or location`,
      detail: `It starts ${when}. Without a link you may spend the first minutes of the call hunting for it.`,
      action: {
        kind: "draft",
        label: "Draft a message asking for the link",
        text: `Hi${e.with && !e.with.includes("@") ? ` ${e.with}` : ""}, looking forward to our ${e.title.toLowerCase()} on ${when}. Could you send the meeting link (or the location) when you get a chance? Thanks!`,
      },
    });
  }

  if (!sch) {
    if (inst.tasks.length)
      out.push({
        id: "no-plan",
        level: "info",
        title: "No plan for this week yet",
        detail: `${inst.tasks.length} tasks are waiting. Generate a plan to see whether everything fits.`,
      });
    return out;
  }

  // 2. Work that does not fit at all.
  for (const u of sch.unscheduled) {
    const t = inst.tasks.find((x) => x.id === u.taskId);
    if (!t) continue;
    out.push({
      id: `short-${t.id}`,
      level: "warn",
      title: `${t.title} is ${hrs(u.missing)} short`,
      detail: u.reason,
      action: { kind: "ask", label: "Ask Dino for options", message: `${t.title} doesn't fit this week. What should I move or drop?` },
    });
  }

  // 3. Important work that only finishes right before the deadline.
  for (const t of inst.tasks) {
    if (t.importance !== "essential" && t.importance !== "high") continue;
    if (sch.unscheduled.some((u) => u.taskId === t.id)) continue;
    const ss = sch.sessions.filter((s) => s.taskId === t.id);
    if (!ss.length) continue;
    const lastEnd = Math.max(...ss.map((s) => s.day * 1440 + s.end));
    const slackH = (t.dueDay * 1440 + t.dueMin - lastEnd) / 60;
    if (slackH < 6)
      out.push({
        id: `tight-${t.id}`,
        level: "warn",
        title: `${t.title} finishes ${slackH.toFixed(1)}h before it's due`,
        detail: `Due ${dueLabel(t)}. If anything slips, you'll miss it.`,
        action: { kind: "ask", label: "Start it earlier", message: `Can you move ${t.title} earlier so it finishes at least a day before it's due?` },
      });
  }

  // 4. Big tasks with no plan for how to do them.
  for (const t of inst.tasks) {
    if (t.minutes >= 300 && !t.plan?.length)
      out.push({
        id: `noplan-${t.id}`,
        level: "info",
        title: `${t.title} is ${hrs(t.minutes)} with no steps`,
        detail: "Big tasks are easier to start when each session has a clear goal.",
        action: { kind: "breakdown", label: "Break it into steps", taskTitle: t.title },
      });
  }

  // 5. Days that blow past the student's own limit.
  const load = new Array(7).fill(0);
  sch.sessions.forEach((s) => (load[s.day] += s.end - s.start));
  const heavy = load.map((l, d) => ({ l, d })).filter((x) => x.l > inst.profile.maxFocusPerDay);
  if (heavy.length)
    out.push({
      id: "heavy-days",
      level: "info",
      title: `${heavy.length} day${heavy.length > 1 ? "s" : ""} over your ${hrs(inst.profile.maxFocusPerDay)} limit`,
      detail: heavy.map((x) => `${DAY_NAMES[x.d]} ${hrs(x.l)}`).join(", "),
    });

  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "warn" ? -1 : 1));
}
