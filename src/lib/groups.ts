import type { FixedEvent, Instance, Schedule, Task } from "./engine/types";

export const DEFAULT_GROUPS = ["School", "Work", "Clubs", "Health", "Personal", "Meetings"];

// Palette tuned to the logo (royal blue, claw cyan, talon gold) plus distinct companions.
export const SWATCHES = ["#2350e6", "#0ea5c6", "#c98a1a", "#e0531f", "#7c3aed", "#db2777", "#15994a", "#0f766e", "#64748b"];

const GROUP_DEFAULT_COLOR: Record<string, string> = {
  School: "#2350e6",
  Work: "#c98a1a",
  Clubs: "#7c3aed",
  Health: "#15994a",
  Personal: "#db2777",
  Meetings: "#0ea5c6",
  Other: "#64748b",
};

export function allGroups(inst: Instance) {
  return [...DEFAULT_GROUPS, ...(inst.groups ?? []).filter((g) => !DEFAULT_GROUPS.includes(g))];
}

export function groupColor(name: string, inst: Instance) {
  if (GROUP_DEFAULT_COLOR[name]) return GROUP_DEFAULT_COLOR[name];
  const i = allGroups(inst).indexOf(name);
  return SWATCHES[(i < 0 ? 0 : i) % SWATCHES.length];
}

export function eventGroup(e: FixedEvent) {
  if (e.group) return e.group;
  return { class: "School", work: "Work", club: "Clubs", meeting: "Meetings", personal: "Personal", event: "Other" }[e.kind] ?? "Other";
}

export function taskGroup(t: Task) {
  if (t.group) return t.group;
  if (t.categories.includes("aspiration")) return "Personal";
  return "School";
}

export interface GroupStat {
  group: string;
  color: string;
  fixed: number; // minutes in commitments
  work: number; // minutes in planned work sessions
}

/** Minutes per group this week: fixed commitments plus planned work sessions. */
export function weekStats(inst: Instance, sch: Schedule | null): GroupStat[] {
  const map = new Map<string, GroupStat>();
  const get = (g: string) => {
    if (!map.has(g)) map.set(g, { group: g, color: groupColor(g, inst), fixed: 0, work: 0 });
    return map.get(g)!;
  };
  for (const e of inst.fixed) get(eventGroup(e)).fixed += e.end - e.start;
  const tasks = new Map(inst.tasks.map((t) => [t.id, t]));
  for (const s of sch?.sessions ?? []) {
    const t = tasks.get(s.taskId);
    if (t) get(taskGroup(t)).work += s.end - s.start;
  }
  return [...map.values()].sort((a, b) => b.fixed + b.work - (a.fixed + a.work));
}
