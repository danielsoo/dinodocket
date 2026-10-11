"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { taskColor } from "@/components/WeekCalendar";
import PlannerCalendar from "@/components/PlannerCalendar";
import { MONTHS_SHORT, defaultPlanWeek, fromIso, toIso } from "@/lib/dates";
import SessionDetail from "@/components/SessionDetail";
import { EventEditor } from "@/components/Editors";
import { SWATCHES, addGroup, allGroups, assignGroup, awakeMinutes, deleteGroup, freeColor, renameGroup, setGroupColor, weekStats } from "@/lib/groups";
import { DEMO, DEFAULT_STRATEGY } from "@/lib/demo";
import { loadAnswers, summary, toProfile } from "@/lib/onboarding";
import { DAY_NAMES, type FixedEvent, type Importance, type Instance, type Schedule, type Session, type Strategy, type Task } from "@/lib/engine/types";
import { fmtTime } from "@/lib/engine/scheduler";
import { computeNotices, type Notice } from "@/lib/notice";
import { selectEvents, type Action } from "@/lib/interpret";

type Score = { total: number; completion: number; focusFit: number; livable: number; breaks: number; buffer: number };
type Proposal = { instance: Instance; schedule: Schedule; explanation: string[]; score: Score; label: string };
type Msg = { role: "user" | "assistant"; content: string };

const load = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const save = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

function applyAction(inst: Instance, a: Action): Instance {
  const next: Instance = JSON.parse(JSON.stringify(inst));
  const id = Date.now().toString(36);
  switch (a.type) {
    case "add_task":
      next.tasks.push({ id: `u${id}`, title: a.title, minutes: a.minutes, dueDay: a.dueDay, dueMin: a.dueMin, importance: a.importance, categories: ["deadline"] });
      break;
    case "add_goal":
      next.tasks.push({ id: `g${id}`, title: a.title, minutes: a.minutes, dueDay: a.dueDay, dueMin: a.dueMin, importance: a.importance, categories: ["aspiration"], plan: a.plan });
      break;
    case "update_task":
      next.tasks = next.tasks.map((t) =>
        t.id === a.taskId
          ? { ...t, minutes: a.minutes ?? t.minutes, dueDay: a.dueDay ?? t.dueDay, dueMin: a.dueMin ?? t.dueMin, importance: a.importance ?? t.importance, plan: a.plan ?? t.plan }
          : t,
      );
      break;
    case "remove_task":
      next.tasks = next.tasks.filter((t) => t.id !== a.taskId);
      break;
    case "remove_event": {
      const ids = new Set(selectEvents(next, a.title, a.onlyDay, a.atStart).map((e) => e.id));
      next.fixed = next.fixed.filter((e) => !ids.has(e.id));
      break;
    }
    case "update_event": {
      const hits = selectEvents(next, a.title, a.onlyDay, a.atStart);
      if (!hits.length) break;
      const patch = (e: FixedEvent): FixedEvent => ({
        ...e,
        title: a.newTitle ?? e.title,
        start: a.start ?? e.start,
        end: a.end ?? (a.start !== undefined ? a.start + (e.end - e.start) : e.end),
        link: a.link ?? e.link,
        location: a.location ?? e.location,
      });
      if (a.days?.length) {
        // The meeting days changed: replace every occurrence with one per new day.
        const tmpl = patch(hits[0]);
        const ids = new Set(hits.map((e) => e.id));
        next.fixed = next.fixed.filter((e) => !ids.has(e.id));
        a.days.forEach((d, i) => next.fixed.push({ ...tmpl, id: `e${id}${i}`, day: d }));
      } else {
        const ids = new Set(hits.map((e) => e.id));
        next.fixed = next.fixed.map((e) => (ids.has(e.id) ? patch(e) : e));
      }
      break;
    }
    case "add_event":
      for (const [i, d] of (a.days?.length ? a.days : [a.day]).entries())
        next.fixed.push({ id: `e${id}${i}`, title: a.title, day: d, start: a.start, end: a.end, kind: a.meeting ? "meeting" : /\b[A-Z]{2,6}\s?\d{3}/.test(a.title) ? "class" : "personal", locked: true, link: a.link, location: a.location });
      break;
  }
  return next;
}

const key = (s: Schedule["sessions"][number]) => `${s.taskId}|${s.day}|${s.start}|${s.end}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const METRICS: { k: keyof Omit<Score, "total">; label: string }[] = [
  { k: "completion", label: "Work placed" },
  { k: "livable", label: "Within daily limit" },
  { k: "breaks", label: "Has breaks" },
  { k: "focusFit", label: "In focus hours" },
  { k: "buffer", label: "Done a day early" },
];

export default function Planner() {
  const [instance, setInstance] = useState<Instance>(DEMO);
  const [approved, setApproved] = useState<Schedule | null>(null);
  const [strategy, setStrategy] = useState<Strategy>(DEFAULT_STRATEGY);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi, I'm Dino. Tell me what changed (\"lab report due Wednesday, about 4 hours\"), something you want to learn (\"I want to practice making croissants\"), or just hit Generate plan. Click any block to see its steps.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<Session | null>(null);
  const [editEvent, setEditEvent] = useState<{ event: FixedEvent; isNew: boolean } | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [planWeek, setPlanWeek] = useState<Date | null>(null); // Monday the template week is pinned to
  const [sync, setSync] = useState<"off" | "loading" | "saving" | "saved" | "error">("off");
  const [copied, setCopied] = useState(false);
  const [account, setAccount] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Restore saved state after mount (localStorage is browser-only).
    /* eslint-disable react-hooks/set-state-in-effect */
    setInstance(load("dinodocket.v3.instance", DEMO));
    setApproved(load<Schedule | null>("dinodocket.v3.approved", null));
    setStrategy(load("dinodocket.strategy", DEFAULT_STRATEGY));
    setPlanWeek(fromIso(load<string | null>("dinodocket.planWeek", null)) ?? defaultPlanWeek(new Date()));
    const answers = loadAnswers();
    if (answers) {
      // Show that the setup questions were actually used.
      setMessages((m) => [...m, { role: "assistant", content: `Set up from your answers: ${summary(answers)} Hit Generate plan to see it.` }]);
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */

    // MongoDB sync (only when the server has MONGODB_URI). A ?plan=<id> link opens that plan on this device.
    const shared = new URLSearchParams(window.location.search).get("plan");
    let id = shared || load<string | null>("dinodocket.planId", null);
    if (!id) id = crypto.randomUUID();
    save("dinodocket.planId", id);
    const planIdNow = id;
    (async () => {
      try {
        const r = await fetch(`/api/plan?id=${planIdNow}`);
        const data = await r.json();
        if (!data.enabled) return;
        setPlanId(planIdNow);
        setAccount(!!data.account);
        // Signed in: the account's plan wins if it is newer than this browser's copy (e.g. a new device).
        const localAt = load<number>("dinodocket.v3.savedAt", 0);
        const serverAt = data.plan?.updatedAt ? Date.parse(data.plan.updatedAt) : 0;
        if (!shared && data.account && data.plan?.instance && serverAt > localAt) {
          setInstance(data.plan.instance);
          setApproved(data.plan.approved?.sessions?.length ? data.plan.approved : null);
          setMessages((m) => [...m, { role: "assistant", content: "Loaded your plan from your account." }]);
        }
        if (shared && data.plan?.instance) {
          setInstance(data.plan.instance);
          setApproved(data.plan.approved?.sessions?.length ? data.plan.approved : null);
          setMessages((m) => [...m, { role: "assistant", content: "Opened your plan from MongoDB. Changes here stay in sync." }]);
          window.history.replaceState(null, "", window.location.pathname);
        }
        setSync("saved");
      } catch {
        setSync("error");
      }
    })();
  }, []);

  // Debounced save to MongoDB whenever the plan changes.
  useEffect(() => {
    if (!ready || !planId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSync("saving");
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/plan", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: planId, instance, approved }) });
        setSync(r.ok ? "saved" : "error");
      } catch {
        setSync("error");
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [instance, approved, planId, ready]);
  useEffect(() => {
    if (ready && planWeek) save("dinodocket.planWeek", toIso(planWeek));
  }, [planWeek, ready]);
  useEffect(() => {
    if (!ready) return;
    save("dinodocket.v3.instance", instance);
    save("dinodocket.v3.savedAt", Date.now());
  }, [instance, ready]);
  useEffect(() => {
    if (ready) save("dinodocket.v3.approved", approved);
  }, [approved, ready]);
  useEffect(() => {
    // Braces matter: newer Chromium returns a Promise from scrollIntoView, and React would call it as a cleanup.
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);

  async function propose(next: Instance, label: string, baseline?: Session[]) {
    const res = await fetch("/api/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instance: next, strategy }) });
    const data = await res.json();
    if (!data.ok) {
      setMessages((m) => [...m, { role: "assistant", content: `The engine rejected that plan: ${data.violations?.[0] ?? "unknown error"}. Nothing was changed.` }]);
      return;
    }
    if (baseline) {
      const a = new Set(baseline.map(key));
      const b = (data.schedule as Schedule).sessions.map(key);
      if (b.length === a.size && b.every((k) => a.has(k))) {
        // The user's edit didn't change the plan, so there is nothing to approve.
        setInstance(next);
        setApproved(data.schedule);
        return;
      }
    }
    setProposal({ instance: next, schedule: data.schedule, explanation: data.explanation, score: data.score, label });
  }

  async function generate() {
    setBusy(true);
    try {
      await propose(instance, "Weekly plan");
    } finally {
      setBusy(false);
    }
  }

  async function send(e?: React.FormEvent, override?: string) {
    e?.preventDefault();
    const text = (override ?? input).trim();
    if (!text || busy) return;
    if (!override) setInput("");
    const history = messages.slice(-6);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    try {
      const base = proposal?.instance ?? instance;
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          message: text,
          instance: base,
          history,
          persona: (() => {
            const a = loadAnswers();
            return a ? { profile: toProfile(a), role: a.role, year: a.year, peak: a.peak, workStyle: a.workStyle, commitments: a.commitments, goals: a.goals } : null;
          })(),
        }) });
      const data = (await res.json()) as { reply: string; action: Action; source: string };
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      if (data.action?.type === "set_group") {
        let next = base;
        let matched = 0;
        for (const g of [{ group: data.action.group, titles: data.action.titles }, ...(data.action.more ?? [])]) {
          const r = assignGroup(next, g.group, g.titles);
          next = r.inst;
          matched += r.matched;
        }
        if (matched) await applyEdit(next, false, "Updated groups");
        else setMessages((m) => [...m, { role: "assistant", content: "I couldn't find those items on your calendar. Try the exact title, like \"THON committee\"." }]);
      } else if (data.action && data.action.type !== "none") await propose(applyAction(base, data.action), data.reply);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Something went wrong reaching the planner. Your schedule was not changed." }]);
    } finally {
      setBusy(false);
    }
  }

  /** Direct edits by the user apply right away; if timing changed and a plan exists, Dino proposes a re-plan. */
  async function applyEdit(next: Instance, timingChanged: boolean, label: string) {
    const withGroups = (inst: Instance) => ({ ...inst, groups: allGroups(inst) });
    const inst = withGroups(next);
    if (proposal) {
      await propose(inst, label);
      return;
    }
    setInstance(inst);
    if (approved && timingChanged) {
      // Drop approved work that now collides with a commitment, then offer a fresh plan.
      const clash = (s: Session) => inst.fixed.some((e) => e.day === s.day && s.start < e.end && e.start < s.end);
      const kept = approved.sessions.filter((s) => !clash(s) && inst.tasks.some((t) => t.id === s.taskId));
      setApproved({ ...approved, sessions: kept });
      setBusy(true);
      try {
        await propose(inst, label, approved.sessions);
      } finally {
        setBusy(false);
      }
    }
  }

  const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  function saveEvent(e: FixedEvent, isNew: boolean, all = false) {
    const base = proposal?.instance ?? instance;
    const old = base.fixed.find((x) => x.id === e.id);
    const timing = isNew || !old || old.day !== e.day || old.start !== e.start || old.end !== e.end;
    let fixed: FixedEvent[];
    if (isNew) fixed = [...base.fixed, e];
    else if (all && old) {
      // Apply the edit to every occurrence of this repeating event; each keeps its own day.
      fixed = base.fixed.map((x) =>
        x.id === e.id ? e : sameTitle(x.title, old.title) ? { ...e, id: x.id, day: x.day } : x,
      );
    } else fixed = base.fixed.map((x) => (x.id === e.id ? e : x));
    const n = all && old ? base.fixed.filter((x) => sameTitle(x.title, old.title)).length : 1;
    setEditEvent(null);
    applyEdit({ ...base, fixed }, timing, isNew ? `Added ${e.title}` : n > 1 ? `Edited all ${n} ${e.title}` : `Edited ${e.title}`);
  }
  function deleteEvent(id: string, all = false) {
    const base = proposal?.instance ?? instance;
    const old = base.fixed.find((x) => x.id === id);
    const gone = (x: FixedEvent) => x.id === id || (all && !!old && sameTitle(x.title, old.title));
    const n = base.fixed.filter(gone).length;
    setEditEvent(null);
    applyEdit({ ...base, fixed: base.fixed.filter((x) => !gone(x)) }, true, n > 1 ? `Deleted all ${n} ${old?.title ?? "events"}` : "Deleted event");
  }
  function saveTask(t: Task) {
    const base = proposal?.instance ?? instance;
    const old = base.tasks.find((x) => x.id === t.id);
    const timing = !old || old.minutes !== t.minutes || old.dueDay !== t.dueDay || old.dueMin !== t.dueMin || old.importance !== t.importance;
    applyEdit({ ...base, tasks: base.tasks.map((x) => (x.id === t.id ? t : x)) }, timing, `Edited ${t.title}`);
  }
  function deleteTask(id: string) {
    const base = proposal?.instance ?? instance;
    setSelected(null);
    applyEdit({ ...base, tasks: base.tasks.filter((x) => x.id !== id) }, true, "Deleted task");
  }

  function approve() {
    if (!proposal) return;
    setInstance(proposal.instance);
    setApproved(proposal.schedule);
    setProposal(null);
    setMessages((m) => [...m, { role: "assistant", content: "Approved. This is now your plan for the week." }]);
  }
  function reject() {
    setProposal(null);
    setMessages((m) => [...m, { role: "assistant", content: "Discarded. Your plan is unchanged. Want me to try a different trade-off?" }]);
  }
  function reset() {
    // Keep the user's personalized hours and limits when resetting the demo week.
    const answers = loadAnswers();
    setInstance(answers ? { ...DEMO, profile: toProfile(answers) } : DEMO);
    setApproved(null);
    setProposal(null);
  }

  const shownInst = proposal?.instance ?? instance;
  const shownSched = proposal?.schedule ?? approved;
  const shownSessions = shownSched?.sessions ?? [];
  const diff = useMemo(() => {
    if (!proposal) return null;
    const before = new Set((approved?.sessions ?? []).map(key));
    const after = new Set(proposal.schedule.sessions.map(key));
    const mins = (k: string) => {
      const [, , a, b] = k.split("|").map(Number);
      return b - a;
    };
    return {
      added: [...after].filter((k) => !before.has(k)).reduce((m, k) => m + mins(k), 0),
      removed: [...before].filter((k) => !after.has(k)).reduce((m, k) => m + mins(k), 0),
    };
  }, [proposal, approved]);
  const notices = useMemo(() => computeNotices(shownInst, shownSched), [shownInst, shownSched]);
  const placed = (id: string) => shownSessions.filter((s) => s.taskId === id).reduce((a, s) => a + s.end - s.start, 0);
  const status = proposal ? "Proposal" : approved ? "Approved" : "Draft";
  const warnings = proposal?.explanation.filter((l) => l.startsWith("⚠")) ?? [];
  // "Placed Xh of Yh ..." is already the card's headline, so leave it out of the list.
  const notes = proposal?.explanation.filter((l) => !l.startsWith("⚠") && !l.startsWith("Placed ")) ?? [];
  const highlights = [...warnings.map((t) => ({ t: t.replace(/^⚠\s*/, ""), warn: true })), ...notes.map((t) => ({ t, warn: /over your|before it is due|little room|cannot|couldn/i.test(t) }))];
  const h1 = (m: number) => `${Math.round((m / 60) * 10) / 10}h`;
  const placedMin = proposal?.schedule.sessions.reduce((a, x) => a + x.end - x.start, 0) ?? 0;
  const neededMin = (proposal?.instance ?? instance).tasks.reduce((a, t) => a + t.minutes, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{planWeek ? `Week of ${MONTHS_SHORT[planWeek.getMonth()]} ${planWeek.getDate()}` : "This week"}</h1>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                status === "Proposal" ? "bg-claw/25 text-ink" : status === "Approved" ? "bg-ok/15 text-ok" : "bg-fixed text-muted"
              }`}
            >
              {status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {planId && (
              <span className="hidden items-center gap-2 text-xs text-muted md:flex">
                <span className={`h-2 w-2 rounded-full ${sync === "error" ? "bg-warn" : sync === "saving" ? "bg-claw" : "bg-ok"}`} aria-hidden />
                {sync === "error" ? "MongoDB sync failed" : sync === "saving" ? "Saving…" : account ? "Saved to your account" : "Saved to MongoDB"}
                {!account && <button
                  className="font-semibold text-accent hover:underline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(`${window.location.origin}/?plan=${planId}`);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {}
                  }}
                  title="Copy a link that opens this plan on your phone or laptop"
                >
                  {copied ? "Link copied" : "Open on another device"}
                </button>}
              </span>
            )}
            <span className="hidden text-xs text-muted sm:inline">Strategy: {strategy.name}</span>
            <button onClick={reset} className="rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-panel hover:text-ink">Sample week</button>
            <button onClick={generate} disabled={busy} className="btn-sticker rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {approved ? "Re-plan week" : "Generate plan"}
            </button>
          </div>
        </div>

        {proposal && (
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-claw" aria-hidden />
                  <span className="font-display text-base font-semibold">{approved ? "Dino suggests some changes" : "Here's a plan for your week"}</span>
                </div>
                <p className="mt-0.5 text-sm text-muted">
                  {placedMin >= neededMin ? `All ${h1(neededMin)} of work fits.` : `${h1(placedMin)} of ${h1(neededMin)} fits.`}{" "}
                  {approved && diff ? `${h1(diff.added)} added, ${h1(diff.removed)} moved or removed.` : "Nothing is saved until you approve."}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={reject} className="rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-fixed hover:text-ink">Discard</button>
                <button onClick={approve} className="btn-sticker rounded-xl bg-ok px-4 py-2 text-sm font-bold text-white">Approve</button>
              </div>
            </div>
            {highlights.length > 0 && (
              <div className="border-t border-line px-5 py-3">
                <ul className="space-y-1.5 text-sm">
                  {highlights.slice(0, 2).map((l, i) => (
                    <li key={i} className="flex gap-2">
                      <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${l.warn ? "bg-warn" : "bg-ok"}`} aria-hidden />
                      <span className={l.warn ? "text-ink" : "text-muted"}>{l.t}</span>
                    </li>
                  ))}
                </ul>
                <details className="group mt-2">
                  <summary className="cursor-pointer list-none text-xs font-semibold text-accent hover:underline">
                    <span className="group-open:hidden">Show details</span>
                    <span className="hidden group-open:inline">Hide details</span>
                  </summary>
                  {highlights.length > 2 && (
                    <ul className="mt-2 space-y-1.5 text-sm text-muted">
                      {highlights.slice(2).map((l, i) => (
                        <li key={i} className="flex gap-2">
                          <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${l.warn ? "bg-warn" : "bg-line"}`} aria-hidden />
                          {l.t}
                        </li>
                      ))}
                    </ul>
                  )}
                  <dl className="mt-3 flex flex-wrap gap-1.5">
                    {METRICS.map(({ k, label }) => (
                      <div key={k} className="flex items-center gap-1.5 rounded-full bg-bg px-2.5 py-1 text-xs">
                        <dt className="text-muted">{label}</dt>
                        <dd className="font-bold">{pct(proposal.score[k])}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </div>
            )}
          </div>
        )}

        {shownInst.fixed.length === 0 && shownInst.tasks.length === 0 && !proposal && (
          <div className="card flex flex-wrap items-center justify-between gap-3 border-2! border-dashed! border-claw! p-5">
            <div className="max-w-xl text-sm">
              <div className="font-display text-lg font-semibold">Your week is empty</div>
              <p className="mt-1 text-muted">
                Tell Dino your schedule, for example <b className="text-ink">&quot;CMPSC 465 Mon Wed Fri 9 to 10am&quot;</b>, then your deadlines:{" "}
                <b className="text-ink">&quot;essay due Thursday, about 5 hours&quot;</b>. Or click any empty spot on the calendar.
              </p>
            </div>
            <button onClick={reset} className="rounded-xl border border-line px-3 py-2 text-sm font-semibold hover:bg-fixed">Load a sample week</button>
          </div>
        )}
        <PlannerCalendar
          instance={shownInst}
          sessions={shownSessions}
          proposed={!!proposal}
          planWeek={planWeek}
          onPlanWeekChange={setPlanWeek}
          onSelect={setSelected}
          onSelectEvent={(e) => setEditEvent({ event: e, isNew: false })}
          onCreate={(day, minute) =>
            setEditEvent({ event: { id: `e${Date.now().toString(36)}`, title: "", day, start: minute, end: Math.min(1440, minute + 60), kind: "personal", locked: true }, isNew: true })
          }
        />
        <p className="-mt-2 text-xs text-muted">Tip: click an empty spot to add an event, or any block to edit it.</p>
        <StatsCard instance={shownInst} schedule={shownSched} onChange={(next) => applyEdit(next, false, "Updated groups")} />
        {editEvent && (
          <EventEditor
            key={editEvent.event.id}
            instance={shownInst}
            event={editEvent.event}
            isNew={editEvent.isNew}
            onSave={(e, all) => saveEvent(e, editEvent.isNew, all)}
            onDelete={deleteEvent}
            onClose={() => setEditEvent(null)}
          />
        )}
        {selected && (
          <SessionDetail
            instance={shownInst}
            sessions={shownSessions}
            session={selected}
            onClose={() => setSelected(null)}
            onBreakDown={(title) => {
              setSelected(null);
              send(undefined, `Break "${title}" into step-by-step sessions with helpful resources.`);
            }}
            onSaveTask={saveTask}
            onDeleteTask={deleteTask}
          />
        )}
      </section>

      <aside className="flex min-w-0 flex-col gap-4">
        <div className="card flex h-[460px] flex-col overflow-hidden">
          <div className="flex items-center gap-2.5 border-b border-line bg-deep/[0.04] px-4 py-3">
            <Image src="/logo-160.png" alt="" width={32} height={32} />
            <div>
              <div className="font-display text-base font-semibold leading-tight">Dino</div>
              <div className="text-[11px] text-muted">{busy ? "Thinking…" : "Proposes changes. You approve."}</div>
            </div>
          </div>
          <div className="flex-1 space-y-2.5 overflow-y-auto p-4 text-sm">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex"}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-white"
                      : "max-w-[90%] rounded-2xl rounded-bl-md bg-fixed px-3.5 py-2"
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex">
                <div className="rounded-2xl rounded-bl-md bg-fixed px-3.5 py-2 text-muted">
                  <span className="inline-flex gap-1" aria-label="Dino is thinking">
                    <span className="animate-pulse">●</span>
                    <span className="animate-pulse [animation-delay:150ms]">●</span>
                    <span className="animate-pulse [animation-delay:300ms]">●</span>
                  </span>
                </div>
              </div>
            )}
            <div ref={chatEnd} />
          </div>
          <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
            <label htmlFor="chat" className="sr-only">Message</label>
            <input
              id="chat"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. I want to practice making croissants"
              className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <button disabled={busy || !input.trim()} className="btn-sticker rounded-xl bg-accent px-4 text-sm font-bold text-white disabled:opacity-40">Send</button>
          </form>
        </div>

        <NoticePanel
          notices={notices}
          onAsk={(msg) => send(undefined, msg)}
          onBreakDown={(title) => send(undefined, `Break "${title}" into step-by-step sessions with helpful resources.`)}
        />

        <TaskList
          instance={shownInst}
          placedFn={placed}
          onRemove={(id) => propose(applyAction(shownInst, { type: "remove_task", taskId: id }), "Remove task")}
          onAdd={(a) => propose(applyAction(shownInst, a), "Add task")}
        />
      </aside>
    </div>
  );
}

function StatsCard({ instance, schedule, onChange }: { instance: Instance; schedule: Schedule | null; onChange: (next: Instance) => void }) {
  const [manage, setManage] = useState(false);
  const [newName, setNewName] = useState("");
  const [colorFor, setColorFor] = useState<string | null>(null);
  const stats = weekStats(instance, schedule);
  const used = new Map(stats.map((s) => [s.group, s]));
  const awake = Math.max(1, awakeMinutes(instance));
  const scheduled = stats.reduce((a, s) => a + s.fixed + s.work, 0);
  const free = Math.max(0, awake - scheduled);
  const h = (m: number) => `${(m / 60).toFixed(m % 60 ? 1 : 0)}h`;
  const pctOf = (m: number) => `${Math.round((m / awake) * 100)}%`;
  const groups = manage ? allGroups(instance) : stats.map((s) => s.group);
  const maxG = Math.max(1, ...stats.map((s) => s.fixed + s.work));

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Where your week goes</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">of {h(awake)} awake time this week</span>
          <button onClick={() => setManage(!manage)} className="rounded-lg border border-line px-2.5 py-1 text-xs font-bold hover:bg-fixed">
            {manage ? "Done" : "Manage groups"}
          </button>
        </div>
      </div>

      {/* The whole awake week as one bar: each group's share, plus what's left free. */}
      <div className="mb-1 flex h-6 overflow-hidden rounded-full border border-line bg-fixed" role="img" aria-label="Share of the awake week by group">
        {stats.map((s) => (
          <div key={s.group} title={`${s.group}: ${h(s.fixed + s.work)} (${pctOf(s.fixed + s.work)})`} style={{ width: `${((s.fixed + s.work) / awake) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div className="mb-4 flex justify-between text-[11px] text-muted">
        <span>{h(scheduled)} scheduled ({pctOf(scheduled)})</span>
        <span>{h(free)} free ({pctOf(free)}){schedule ? "" : " · generate a plan to count study time"}</span>
      </div>

      <ul className="space-y-2">
        {groups.map((g) => {
          const st = used.get(g);
          const color = st?.color ?? (instance.groupColors?.[g] ?? SWATCHES[0]);
          const total = (st?.fixed ?? 0) + (st?.work ?? 0);
          return (
            <li key={g} className="text-sm">
              <div className="grid grid-cols-[minmax(90px,140px)_1fr_auto] items-center gap-3">
                {manage ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setColorFor(colorFor === g ? null : g)}
                      className="h-4 w-4 shrink-0 rounded-full border-2 border-ink/40"
                      style={{ background: color }}
                      aria-label={`Change ${g} color`}
                    />
                    <input
                      defaultValue={g}
                      aria-label={`Rename ${g}`}
                      onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== g && onChange(renameGroup(instance, g, e.target.value))}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      className="w-full min-w-0 rounded-md border border-line bg-bg px-1.5 py-0.5 text-sm font-semibold outline-none focus:border-accent"
                    />
                  </div>
                ) : (
                  <span className="flex items-center gap-1.5 truncate font-semibold">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                    {g}
                  </span>
                )}
                <div className="flex h-3 overflow-hidden rounded-full bg-fixed" role="img" aria-label={`${g}: ${h(st?.fixed ?? 0)} commitments, ${h(st?.work ?? 0)} planned work`}>
                  <div style={{ width: `${((st?.fixed ?? 0) / maxG) * 100}%`, background: color }} />
                  <div
                    style={{
                      width: `${((st?.work ?? 0) / maxG) * 100}%`,
                      background: `repeating-linear-gradient(135deg, ${color} 0 4px, color-mix(in srgb, ${color} 45%, var(--panel)) 4px 8px)`,
                    }}
                  />
                </div>
                <span className="flex items-center gap-2 text-right font-mono text-xs tabular-nums">
                  {h(total)} <span className="w-9 text-muted">{pctOf(total)}</span>
                  {manage && (
                    <button onClick={() => onChange(deleteGroup(instance, g))} className="font-sans text-xs font-semibold text-warn hover:underline" aria-label={`Delete ${g}`}>
                      Delete
                    </button>
                  )}
                </span>
              </div>
              {manage && colorFor === g && (
                <div className="mt-1.5 flex flex-wrap gap-1.5 pl-6">
                  {SWATCHES.map((c) => (
                    <button key={c} onClick={() => { onChange(setGroupColor(instance, g, c)); setColorFor(null); }} className="h-6 w-6 rounded-full border-2 border-transparent hover:border-ink" style={{ background: c }} aria-label={c} />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {manage && (
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            onChange(addGroup(instance, newName, freeColor(instance)));
            setNewName("");
          }}
        >
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New group, e.g. THON" aria-label="New group name" className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent" />
          <button className="btn-sticker rounded-xl bg-accent px-3 text-sm font-bold text-white">Add group</button>
        </form>
      )}
      <p className="mt-3 text-[11px] text-muted">
        Solid = commitments, striped = planned study. {manage ? "Rename a group to rename it everywhere. Deleting moves its items to Other." : "Assign groups by clicking any block."}
      </p>
    </div>
  );
}

function NoticePanel({ notices, onAsk, onBreakDown }: { notices: Notice[]; onAsk: (m: string) => void; onBreakDown: (t: string) => void }) {
  const [openDraft, setOpenDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? notices : notices.slice(0, 4);
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="font-display text-base font-semibold">Dino noticed</span>
        <span className="rounded-full bg-claw/25 px-2 py-0.5 text-xs font-bold">{notices.length}</span>
      </div>
      {notices.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted">Nothing needs your attention right now.</p>
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((n) => (
            <li key={n.id} className="px-4 py-3 text-sm">
              <div className="flex gap-2.5">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.level === "warn" ? "bg-warn" : "bg-accent"}`} aria-label={n.level === "warn" ? "warning" : "info"} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium leading-snug">{n.title}</div>
                  <div className="mt-0.5 text-xs text-muted">{n.detail}</div>
                  {n.action && (
                    <button
                      className="mt-2 text-xs font-medium text-accent hover:underline"
                      onClick={() => {
                        const a = n.action!;
                        if (a.kind === "draft") setOpenDraft(openDraft === n.id ? null : n.id);
                        else if (a.kind === "ask") onAsk(a.message);
                        else onBreakDown(a.taskTitle);
                      }}
                    >
                      {n.action.label} →
                    </button>
                  )}
                  {n.action?.kind === "draft" && openDraft === n.id && (
                    <div className="mt-2 rounded-lg border border-line bg-bg p-2.5 text-xs">
                      <p className="whitespace-pre-wrap">{n.action.text}</p>
                      <button
                        className="mt-2 rounded-lg bg-accent px-2.5 py-1 font-bold text-white"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText((n.action as { text: string }).text);
                            setCopied(n.id);
                          } catch {}
                        }}
                      >
                        {copied === n.id ? "Copied" : "Copy message"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
          {notices.length > 4 && (
            <li>
              <button onClick={() => setShowAll(!showAll)} className="w-full px-4 py-2.5 text-left text-xs font-medium text-muted hover:text-ink">
                {showAll ? "Show less" : `Show ${notices.length - 4} more`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function TaskList({ instance, placedFn, onRemove, onAdd }: { instance: Instance; placedFn: (id: string) => number; onRemove: (id: string) => void; onAdd: (a: Action) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", hours: 3, day: 3, time: "23:30", importance: "high" as Importance });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) return;
    const [hh, mm] = f.time.split(":").map(Number);
    onAdd({ type: "add_task", title: f.title.trim(), minutes: Math.max(30, Math.round((f.hours * 60) / 30) * 30), dueDay: f.day, dueMin: Math.max(30, Math.round((hh * 60 + mm) / 30) * 30), importance: f.importance });
    setF({ ...f, title: "" });
    setOpen(false);
  };
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="font-display text-base font-semibold">Tasks &amp; goals</span>
        <button onClick={() => setOpen(!open)} className="text-sm font-medium text-accent">{open ? "Cancel" : "+ Add"}</button>
      </div>
      {open && (
        <form onSubmit={submit} className="grid grid-cols-2 gap-2 border-b border-line p-3 text-sm">
          <input aria-label="Title" placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="col-span-2 rounded-lg border border-line bg-bg px-2.5 py-1.5" />
          <label className="flex items-center gap-2 text-muted">Hours<input type="number" min={0.5} max={40} step={0.5} value={f.hours} onChange={(e) => setF({ ...f, hours: Number(e.target.value) })} className="w-full rounded-lg border border-line bg-bg px-2 py-1.5 text-ink" /></label>
          <select aria-label="Importance" value={f.importance} onChange={(e) => setF({ ...f, importance: e.target.value as Importance })} className="rounded-lg border border-line bg-bg px-2 py-1.5">
            {["essential", "high", "normal", "flexible"].map((i) => <option key={i}>{i}</option>)}
          </select>
          <select aria-label="Due day" value={f.day} onChange={(e) => setF({ ...f, day: Number(e.target.value) })} className="rounded-lg border border-line bg-bg px-2 py-1.5">
            {DAY_NAMES.map((d, i) => <option key={d} value={i}>Due {d}</option>)}
          </select>
          <input aria-label="Due time" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} className="rounded-lg border border-line bg-bg px-2 py-1.5" />
          <button className="btn-sticker col-span-2 rounded-xl bg-accent py-1.5 font-bold text-white">Propose with this task</button>
        </form>
      )}
      <ul className="divide-y divide-line">
        {instance.tasks.map((t) => {
          const p = placedFn(t.id);
          const ratio = Math.min(1, p / t.minutes);
          const c = taskColor(instance, t.id);
          return (
            <li key={t.id} className="group px-4 py-2.5 text-sm">
              <div className="flex items-start gap-2.5">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{t.title}</span>
                    {t.plan?.length ? <span className="shrink-0 rounded bg-fixed px-1 text-[10px] text-muted">{t.plan.length} steps</span> : null}
                  </div>
                  <div className="text-xs text-muted">
                    {t.importance} · due {DAY_NAMES[t.dueDay]} {fmtTime(t.dueMin)}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-fixed">
                      <div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, background: ratio < 1 && p > 0 ? "var(--warn)" : c }} />
                    </div>
                    <span className={`text-[11px] tabular-nums ${ratio < 1 && p > 0 ? "text-warn" : "text-muted"}`}>
                      {(p / 60).toFixed(1)}/{(t.minutes / 60).toFixed(1)}h
                    </span>
                  </div>
                </div>
                <button onClick={() => onRemove(t.id)} className="text-xs text-muted opacity-60 hover:text-warn group-hover:opacity-100" aria-label={`Remove ${t.title}`}>Remove</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
