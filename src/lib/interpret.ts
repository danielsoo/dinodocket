import { chat, extractJson, llmEnabled } from "./llm";
import { DAY_NAMES, type Importance, type Instance, type PlanStep } from "./engine/types";
import { fmtTime } from "./engine/scheduler";
import { genericPlan, sanitizePlan } from "./steps";
import { allGroups, eventGroup, taskGroup } from "./groups";

// The AI never edits the calendar. It only returns one of these structured actions,
// which the server validates and the client turns into a proposal the user must approve.
export type Action =
  | { type: "add_task"; title: string; minutes: number; dueDay: number; dueMin: number; importance: Importance }
  | { type: "add_goal"; title: string; minutes: number; dueDay: number; dueMin: number; importance: Importance; plan: PlanStep[] }
  | { type: "update_task"; taskId: string; minutes?: number; dueDay?: number; dueMin?: number; importance?: Importance; plan?: PlanStep[] }
  | { type: "remove_task"; taskId: string }
  | { type: "set_group"; group: string; titles: string[]; more?: { group: string; titles: string[] }[] }
  | { type: "add_event"; title: string; day: number; start: number; end: number; meeting?: boolean; link?: string; location?: string }
  | { type: "none" };

export interface Interpretation {
  reply: string;
  action: Action;
  source: "llm" | "rules";
}

const IMPS: Importance[] = ["essential", "high", "normal", "flexible"];
const snap = (m: number) => Math.round(m / 30) * 30;
const parseHM = (x: unknown): number | undefined => {
  if (typeof x === "number" && Number.isFinite(x)) return snap(Math.min(1440, Math.max(0, x)));
  if (typeof x !== "string") return undefined;
  const m = x.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return undefined;
  let hh = Number(m[1]) % 24;
  const mm = Number(m[2] ?? 0);
  if (m[3]?.toLowerCase() === "pm" && hh < 12) hh += 12;
  if (m[3]?.toLowerCase() === "am" && hh === 12) hh = 0;
  return snap(Math.min(1440, hh * 60 + mm));
};
const day = (x: unknown): number | undefined => {
  if (typeof x === "number" && x >= 0 && x <= 6) return Math.round(x);
  if (typeof x === "string") {
    const i = DAY_NAMES.findIndex((d) => x.toLowerCase().startsWith(d.toLowerCase()));
    return i >= 0 ? i : undefined;
  }
  return undefined;
};

/** Validate an untrusted action against the current instance. Returns null if unusable. */
export function validateAction(raw: unknown, inst: Instance): Action | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const imp = IMPS.includes(a.importance as Importance) ? (a.importance as Importance) : undefined;
  const hoursToMin = (x: unknown) => (typeof x === "number" && x > 0 && x <= 40 ? Math.max(30, snap(x * 60)) : undefined);
  switch (a.type) {
    case "add_task": {
      const minutes = hoursToMin(a.hours);
      const d = day(a.dueDay);
      const t = parseHM(a.dueTime) ?? 1410;
      if (typeof a.title !== "string" || !a.title.trim() || minutes === undefined || d === undefined) return null;
      return { type: "add_task", title: a.title.trim().slice(0, 80), minutes, dueDay: d, dueMin: t || 30, importance: imp ?? "normal" };
    }
    case "add_goal": {
      const plan = sanitizePlan(a.steps ?? a.plan);
      if (typeof a.title !== "string" || !a.title.trim() || !plan) return null;
      const planMin = plan.reduce((x, st) => x + st.minutes, 0);
      return {
        type: "add_goal",
        title: a.title.trim().slice(0, 80),
        minutes: hoursToMin(a.hours) ?? planMin,
        dueDay: day(a.dueDay) ?? 6,
        dueMin: parseHM(a.dueTime) || 1410,
        importance: imp ?? "normal",
        plan,
      };
    }
    case "update_task": {
      if (!inst.tasks.some((t) => t.id === a.taskId)) return null;
      return { type: "update_task", taskId: String(a.taskId), minutes: hoursToMin(a.hours), dueDay: day(a.dueDay), dueMin: parseHM(a.dueTime), importance: imp, plan: sanitizePlan(a.steps ?? a.plan) };
    }
    case "remove_task":
      return inst.tasks.some((t) => t.id === a.taskId) ? { type: "remove_task", taskId: String(a.taskId) } : null;
    case "add_event": {
      const d = day(a.day), s = parseHM(a.start), e = parseHM(a.end);
      if (typeof a.title !== "string" || d === undefined || s === undefined || e === undefined || e <= s) return null;
      const link = typeof a.link === "string" && /^https?:\/\/\S+$/i.test(a.link.trim()) ? a.link.trim().slice(0, 300) : undefined;
      const location = typeof a.location === "string" && a.location.trim() ? a.location.trim().slice(0, 80) : undefined;
      return { type: "add_event", title: a.title.trim().slice(0, 80), day: d, start: s, end: e, meeting: a.meeting === true || undefined, link, location };
    }
    case "set_group": {
      const one = (x: Record<string, unknown>) => {
        const group = typeof x?.group === "string" ? x.group.trim().slice(0, 24) : "";
        const titles = (Array.isArray(x?.titles) ? x.titles : []).filter((t): t is string => typeof t === "string" && !!t.trim()).slice(0, 20);
        return group && titles.length ? { group, titles } : null;
      };
      const list = [one(a), ...(Array.isArray(a.assignments) ? a.assignments : []).map((x: Record<string, unknown>) => one(x))].filter(
        (x): x is { group: string; titles: string[] } => x !== null,
      );
      if (!list.length) return null;
      return { type: "set_group", group: list[0].group, titles: list[0].titles, more: list.slice(1, 8) };
    }
    case "none":
      return { type: "none" };
    default:
      return null;
  }
}

function summarize(inst: Instance) {
  const tasks = inst.tasks.map((t) => `- ${t.id}: "${t.title}" ${(t.minutes / 60).toFixed(1)}h, due ${DAY_NAMES[t.dueDay]} ${fmtTime(t.dueMin)}, ${t.importance}, group ${taskGroup(t)}${t.plan?.length ? `, has ${t.plan.length} steps` : ""}`).join("\n");
  const ev = inst.fixed.map((e) => `- "${e.title}" ${DAY_NAMES[e.day]} ${fmtTime(e.start)}-${fmtTime(e.end)} (locked, group ${eventGroup(e)})`).join("\n");
  return `Groups: ${allGroups(inst).join(", ")}\nTasks:\n${tasks || "- none"}\nFixed events:\n${ev || "- none"}`;
}

const SYSTEM = `You are the planning assistant inside a student scheduler called DinoDocket.
You do NOT edit the calendar. You translate the student's message into exactly ONE structured action; the scheduling engine builds the plan and the student approves it.
The planning week is Mon-Sun (days: Mon, Tue, Wed, Thu, Fri, Sat, Sun). Times are "HH:MM" 24h.
Allowed actions (JSON):
{"type":"add_task","title":str,"hours":number,"dueDay":"Wed","dueTime":"23:30","importance":"essential|high|normal|flexible"}
{"type":"add_goal","title":str,"hours"?:number,"dueDay"?:"Sun","dueTime"?:"23:59","importance"?:str,"steps":[{"title":str,"detail":str,"minutes":number,"resources":[{"kind":"youtube"|"web","label":str,"query":str}]}]}
   // for something the student wants to learn, practice, make, or build (a skill, hobby, or project).
   // 3-6 concrete, ordered steps sized to fit the week; each step gets 1-2 resources as SEARCH QUERIES (never URLs).
   // If no deadline is given, default dueDay to "Sun" and say so.
{"type":"update_task","taskId":str,"hours"?:number,"dueDay"?:str,"dueTime"?:str,"importance"?:str,"steps"?:[...same as add_goal]}
   // use "steps" here when the student asks to break an existing task into steps
{"type":"remove_task","taskId":str}
{"type":"add_event","title":str,"day":"Tue","start":"18:00","end":"20:00","meeting"?:true,"link"?:"https://...","location"?:str}   // fixed, locked commitment or blocked time; set meeting:true for calls/meetings and include a link or location ONLY if the student gave one (never invent links)
{"type":"set_group","group":str,"titles":[str],"assignments"?:[{"group":str,"titles":[str]}]}   // use "assignments" to apply several groups in one go   // put events/tasks into a group for weekly stats; use exact titles from the calendar; a new group name is created automatically; keep the group name in the language the student used
{"type":"none"}
Rules: if a detail that changes the plan is missing (how many hours a new task needs, or which day it is due), use {"type":"none"} and ask ONE short question. Never invent a due day. If a due day is given without a time, use "23:59" and mention that assumption in your reply. Never move or delete locked events.
Example: "I want to practice making croissants" -> {"reply":"...","action":{"type":"add_goal","title":"Practice making croissants","steps":[{"title":"Learn lamination","detail":"Watch how butter is folded into the dough and note the fold count.","minutes":45,"resources":[{"kind":"youtube","label":"Lamination technique","query":"croissant lamination technique"}]},{"title":"Make the dough","detail":"Mix and chill the dough overnight.","minutes":60,"resources":[{"kind":"web","label":"Croissant dough recipe","query":"croissant dough recipe beginner"}]}]}}
Reply with ONE JSON object: {"reply": "<short friendly message to the student>", "action": <action>}.`;

/** Rule-based fallback so the demo works without an API key. */
function rules(msg: string, inst: Instance): Interpretation {
  const m = msg.toLowerCase();
  const hours = m.match(/(\d+(?:\.\d+)?)\s*(?:hours|hour|hrs|hr|h)\b/);
  const dayIdx = DAY_NAMES.findIndex((d) => new RegExp(`\\b${d.toLowerCase()}`).test(m));
  const time = m.match(/\b(?:at|by)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/);
  const blocked = m.match(/(?:can't|cannot|busy|block)/);
  if (blocked && dayIdx >= 0) {
    const range = m.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/);
    if (range) {
      const a = validateAction({ type: "add_event", title: "Blocked", day: dayIdx, start: range[1], end: range[2] }, inst);
      if (a) return { reply: `Blocking ${DAY_NAMES[dayIdx]} ${range[1]}-${range[2]}. I'll replan around it.`, action: a, source: "rules" };
    }
    return { reply: "What time range should I block? For example: \"I'm busy Tue 6pm-9pm\".", action: { type: "none" }, source: "rules" };
  }
  if (hours && dayIdx >= 0) {
    const title = msg.replace(/^(i have|i've got|add|new|there's|got)\s+(an?\s+)?/i, "").split(/\s+(?:due|by|that|which|for|,)\s+/i)[0].replace(/(\d+(?:\.\d+)?)\s*(hours|hour|hrs|hr|h)\b.*/i, "").trim() || "New task";
    const importance: Importance = /exam|midterm|final|essential|urgent/.test(m) ? "essential" : /important|high/.test(m) ? "high" : /optional|flexible|maybe/.test(m) ? "flexible" : "high";
    const a = validateAction({ type: "add_task", title: title.slice(0, 60), hours: Number(hours[1]), dueDay: dayIdx, dueTime: time?.[1] ?? "23:30", importance }, inst);
    if (a) return { reply: `Adding "${(a as { title: string }).title}" (${hours[1]}h, due ${DAY_NAMES[dayIdx]}). Here's how the week changes:`, action: a, source: "rules" };
  }
  const grp = msg.match(/^(?:put|move|add|set|group|make)\s+(.+?)\s+(?:in|into|to|as|under)\s+(?:the\s+|my\s+)?(?:group\s+)?["']?(.+?)["']?(?:\s+group)?[.!]*$/i);
  if (grp) {
    const titles = grp[1].split(/\s*(?:,|\band\b|&)\s*/i).filter(Boolean);
    const a = validateAction({ type: "set_group", group: grp[2], titles }, inst);
    if (a) return { reply: `Putting ${titles.join(", ")} in "${grp[2]}". The weekly stats will update.`, action: a, source: "rules" };
  }
  const goal = msg.match(/\b(?:practice|learn|learning|get better at|try making|want to (?:make|learn|practice|try|start|build))\s+(?:how to\s+)?(.+?)[.!?]*$/i);
  if (goal) {
    const topic = goal[1].replace(/\s+(?:this|next)\s+week.*$/i, "").trim();
    const a = validateAction({ type: "add_goal", title: `Practice: ${topic}`.slice(0, 60), steps: genericPlan(topic) }, inst);
    if (a) return { reply: `Here's a 4-step plan for ${topic}, spread over your free time this week (due Sunday unless you say otherwise). Click any block to see the steps and links.`, action: a, source: "rules" };
  }
  if (dayIdx >= 0 && !hours)
    return { reply: "Got it. About how many hours will it take? (e.g. \"about 4 hours\")", action: { type: "none" }, source: "rules" };
  return {
    reply: 'Tell me about a new task with its hours and due day, like "I have a CMPSC lab report due Wednesday, about 4 hours", or block time like "I\'m busy Tue 6pm-9pm".',
    action: { type: "none" },
    source: "rules",
  };
}

export async function interpret(message: string, inst: Instance, history: { role: "user" | "assistant"; content: string }[] = []): Promise<Interpretation> {
  if (!llmEnabled()) return rules(message, inst);
  try {
    const { text, diag } = await chat(
      [
        { role: "system", content: `${SYSTEM}\n\nCurrent week:\n${summarize(inst)}` },
        ...history.slice(-6),
        { role: "user", content: message },
      ],
      { temperature: 0.2, budgetMs: 45000 },
    );
    const json = extractJson(text, ["action", "reply"], diag) as { reply?: string; action?: unknown };
    const action = validateAction(json.action, inst);
    if (!action) return { reply: String(json.reply ?? "I couldn't turn that into a change. Could you rephrase?"), action: { type: "none" }, source: "llm" };
    return { reply: String(json.reply ?? "Here's the proposed change."), action, source: "llm" };
  } catch {
    return rules(message, inst);
  }
}
