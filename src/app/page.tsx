"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import WeekCalendar, { taskColor } from "@/components/WeekCalendar";
import SessionDetail from "@/components/SessionDetail";
import { EventEditor } from "@/components/Editors";
import { DEFAULT_GROUPS, weekStats } from "@/lib/groups";
import { DEMO, DEFAULT_STRATEGY } from "@/lib/demo";
import { DAY_NAMES, type FixedEvent, type Importance, type Instance, type Schedule, type Session, type Strategy, type Task } from "@/lib/engine/types";
import { fmtTime } from "@/lib/engine/scheduler";
import { computeNotices, type Notice } from "@/lib/notice";
import type { Action } from "@/lib/interpret";

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
    case "add_event":
      next.fixed.push({ id: `e${id}`, title: a.title, day: a.day, start: a.start, end: a.end, kind: a.meeting ? "meeting" : "personal", locked: true, link: a.link, location: a.location });
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
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Restore saved state after mount (localStorage is browser-only).
    /* eslint-disable react-hooks/set-state-in-effect */
    setInstance(load("dinodocket.v3.instance", DEMO));
    setApproved(load<Schedule | null>("dinodocket.v3.approved", null));
    setStrategy(load("dinodocket.strategy", DEFAULT_STRATEGY));
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  useEffect(() => {
    if (ready) save("dinodocket.v3.instance", instance);
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
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, instance: base, history }) });
      const data = (await res.json()) as { reply: string; action: Action; source: string };
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      if (data.action && data.action.type !== "none") await propose(applyAction(base, data.action), data.reply);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Something went wrong reaching the planner. Your schedule was not changed." }]);
    } finally {
      setBusy(false);
    }
  }

  /** Direct edits by the user apply right away; if timing changed and a plan exists, Dino proposes a re-plan. */
  async function applyEdit(next: Instance, timingChanged: boolean, label: string) {
    const withGroups = (inst: Instance) => {
      const custom = new Set(inst.groups ?? []);
      [...inst.fixed.map((e) => e.group), ...inst.tasks.map((t) => t.group)].forEach((g) => g && !DEFAULT_GROUPS.includes(g) && custom.add(g));
      return { ...inst, groups: [...custom] };
    };
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

  function saveEvent(e: FixedEvent, isNew: boolean) {
    const base = proposal?.instance ?? instance;
    const old = base.fixed.find((x) => x.id === e.id);
    const timing = isNew || !old || old.day !== e.day || old.start !== e.start || old.end !== e.end;
    const next = { ...base, fixed: isNew ? [...base.fixed, e] : base.fixed.map((x) => (x.id === e.id ? e : x)) };
    setEditEvent(null);
    applyEdit(next, timing, isNew ? `Added ${e.title}` : `Edited ${e.title}`);
  }
  function deleteEvent(id: string) {
    const base = proposal?.instance ?? instance;
    setEditEvent(null);
    applyEdit({ ...base, fixed: base.fixed.filter((x) => x.id !== id) }, true, "Deleted event");
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
    setInstance(DEMO);
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
    return { added: [...after].filter((k) => !before.has(k)).length, removed: [...before].filter((k) => !after.has(k)).length };
  }, [proposal, approved]);
  const notices = useMemo(() => computeNotices(shownInst, shownSched), [shownInst, shownSched]);
  const placed = (id: string) => shownSessions.filter((s) => s.taskId === id).reduce((a, s) => a + s.end - s.start, 0);
  const status = proposal ? "Proposal" : approved ? "Approved" : "Draft";
  const warnings = proposal?.explanation.filter((l) => l.startsWith("⚠")) ?? [];
  const notes = proposal?.explanation.filter((l) => !l.startsWith("⚠")) ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">This week</h1>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                status === "Proposal" ? "bg-claw/25 text-ink" : status === "Approved" ? "bg-ok/15 text-ok" : "bg-fixed text-muted"
              }`}
            >
              {status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted sm:inline">Strategy: {strategy.name}</span>
            <button onClick={reset} className="rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-panel hover:text-ink">Reset</button>
            <button onClick={generate} disabled={busy} className="btn-sticker rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {approved ? "Re-plan week" : "Generate plan"}
            </button>
          </div>
        </div>

        {proposal && (
          <div className="card overflow-hidden border-2! border-claw!">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
              <div className="min-w-0">
                <div className="font-display text-base font-semibold">Review proposed changes</div>
                <div className="text-xs text-muted">
                  {diff?.added ?? 0} added · {diff?.removed ?? 0} moved or removed · dashed blocks are new. Nothing changes until you approve.
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={reject} className="rounded-xl border border-line px-3 py-1.5 text-sm font-semibold hover:bg-fixed">Reject</button>
                <button onClick={approve} className="btn-sticker rounded-xl bg-ok px-4 py-1.5 text-sm font-bold text-white">Approve</button>
              </div>
            </div>
            <div className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto]">
              <div className="space-y-1.5 text-sm">
                {warnings.map((l, i) => (
                  <p key={`w${i}`} className="text-warn">{l.replace(/^⚠\s*/, "⚠ ")}</p>
                ))}
                {notes.slice(0, 3).map((l, i) => (
                  <p key={`n${i}`} className="text-muted">{l}</p>
                ))}
                {notes.length > 3 && (
                  <details className="text-muted">
                    <summary className="cursor-pointer text-xs">More details</summary>
                    {notes.slice(3).map((l, i) => <p key={i} className="mt-1">{l}</p>)}
                  </details>
                )}
              </div>
              <dl className="grid grid-cols-5 gap-2 md:grid-cols-1 md:gap-1.5">
                {METRICS.map(({ k, label }) => (
                  <div key={k} className="flex flex-col items-start md:flex-row md:items-center md:gap-2">
                    <dd className="w-10 font-mono text-sm font-semibold">{pct(proposal.score[k])}</dd>
                    <dt className="text-[11px] leading-tight text-muted">{label}</dt>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}

        <WeekCalendar
          instance={shownInst}
          sessions={shownSessions}
          proposed={!!proposal}
          onSelect={setSelected}
          onSelectEvent={(e) => setEditEvent({ event: e, isNew: false })}
          onCreate={(day, minute) =>
            setEditEvent({ event: { id: `e${Date.now().toString(36)}`, title: "", day, start: minute, end: Math.min(1440, minute + 60), kind: "personal", locked: true }, isNew: true })
          }
        />
        <p className="-mt-2 text-xs text-muted">Tip: click an empty spot to add an event, or any block to edit it.</p>
        <StatsCard instance={shownInst} schedule={shownSched} />
        {editEvent && (
          <EventEditor
            key={editEvent.event.id}
            instance={shownInst}
            event={editEvent.event}
            isNew={editEvent.isNew}
            onSave={(e) => saveEvent(e, editEvent.isNew)}
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

function StatsCard({ instance, schedule }: { instance: Instance; schedule: Schedule | null }) {
  const stats = weekStats(instance, schedule);
  const total = stats.reduce((a, s) => a + s.fixed + s.work, 0);
  const max = Math.max(1, ...stats.map((s) => s.fixed + s.work));
  const h = (m: number) => `${(m / 60).toFixed(m % 60 ? 1 : 0)}h`;
  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Where your week goes</h2>
        <span className="text-xs text-muted">
          {h(total)} scheduled · solid = commitments, striped = planned work{schedule ? "" : " (generate a plan to include work)"}
        </span>
      </div>
      <ul className="space-y-2.5">
        {stats.map((s) => (
          <li key={s.group} className="grid grid-cols-[96px_1fr_64px] items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5 truncate font-semibold">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
              {s.group}
            </span>
            <div className="flex h-3.5 overflow-hidden rounded-full bg-fixed" role="img" aria-label={`${s.group}: ${h(s.fixed)} commitments, ${h(s.work)} planned work`}>
              <div style={{ width: `${(s.fixed / max) * 100}%`, background: s.color }} />
              <div
                style={{
                  width: `${(s.work / max) * 100}%`,
                  background: `repeating-linear-gradient(135deg, ${s.color} 0 4px, color-mix(in srgb, ${s.color} 45%, var(--panel)) 4px 8px)`,
                }}
              />
            </div>
            <span className="text-right font-mono text-xs tabular-nums">
              {h(s.fixed + s.work)} <span className="text-muted">({Math.round(((s.fixed + s.work) / Math.max(1, total)) * 100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
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
