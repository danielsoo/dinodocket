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
  const base = inst.groups?.length ? inst.groups : DEFAULT_GROUPS;
  // Include any group an item uses, so nothing disappears from the stats.
  const used = [...inst.fixed.map(eventGroup), ...inst.tasks.map(taskGroup)];
  return [...new Set([...base, ...used])];
}

export function groupColor(name: string, inst: Instance) {
  if (inst.groupColors?.[name]) return inst.groupColors[name];
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

/** Rename a group everywhere: the list, its color, and every event or task that uses it (explicitly or by default). */
export function renameGroup(inst: Instance, from: string, to: string): Instance {
  const name = to.trim().slice(0, 24);
  if (!name || name === from) return inst;
  const groups = allGroups(inst).map((g) => (g === from ? name : g));
  const groupColors = { ...(inst.groupColors ?? {}) };
  groupColors[name] = groupColors[from] ?? groupColor(from, inst);
  delete groupColors[from];
  return {
    ...inst,
    groups: [...new Set(groups)],
    groupColors,
    fixed: inst.fixed.map((e) => (eventGroup(e) === from ? { ...e, group: name } : e)),
    tasks: inst.tasks.map((t) => (taskGroup(t) === from ? { ...t, group: name } : t)),
  };
}

/** Delete a group; its items move to "Other". */
export function deleteGroup(inst: Instance, name: string): Instance {
  const groupColors = { ...(inst.groupColors ?? {}) };
  delete groupColors[name];
  return {
    ...inst,
    groups: allGroups(inst).filter((g) => g !== name),
    groupColors,
    fixed: inst.fixed.map((e) => (eventGroup(e) === name ? { ...e, group: "Other" } : e)),
    tasks: inst.tasks.map((t) => (taskGroup(t) === name ? { ...t, group: "Other" } : t)),
  };
}

export function freeColor(inst: Instance) {
  const taken = new Set(allGroups(inst).map((g) => groupColor(g, inst)));
  return SWATCHES.find((c) => !taken.has(c)) ?? SWATCHES[allGroups(inst).length % SWATCHES.length];
}

/** Put the named items (matched by title) into a group, creating the group if needed. */
export function assignGroup(inst: Instance, group: string, titles: string[]): { inst: Instance; matched: number } {
  const g = group.trim().slice(0, 24);
  const keys = titles.map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (!g || !keys.length) return { inst, matched: 0 };
  const hit = (title: string) => {
    const t = title.toLowerCase();
    return keys.some((k) => t === k || t.includes(k) || k.includes(t));
  };
  let matched = 0;
  const fixed = inst.fixed.map((e) => (hit(e.title) ? (matched++, { ...e, group: g }) : e));
  const tasks = inst.tasks.map((t) => (hit(t.title) ? (matched++, { ...t, group: g }) : t));
  let next: Instance = { ...inst, fixed, tasks };
  if (!allGroups(inst).includes(g)) next = addGroup(next, g, freeColor(inst));
  return { inst: { ...next, groups: allGroups(next) }, matched };
}

export function addGroup(inst: Instance, name: string, color?: string): Instance {
  const n = name.trim().slice(0, 24);
  if (!n) return inst;
  return { ...inst, groups: [...new Set([...allGroups(inst), n])], groupColors: color ? { ...(inst.groupColors ?? {}), [n]: color } : inst.groupColors };
}

export function setGroupColor(inst: Instance, name: string, color: string): Instance {
  return { ...inst, groups: allGroups(inst), groupColors: { ...(inst.groupColors ?? {}), [name]: color } };
}

/** Awake minutes in the week, the denominator for "share of my week". */
export function awakeMinutes(inst: Instance) {
  return 7 * Math.max(0, inst.profile.sleep - inst.profile.wake);
}
