"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import WeekCalendar, { taskColor } from "@/components/WeekCalendar";
import { DEMO, DEFAULT_STRATEGY } from "@/lib/demo";
import { DAY_NAMES, type Importance, type Instance, type Schedule, type Strategy } from "@/lib/engine/types";
import { fmtTime } from "@/lib/engine/scheduler";
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
  switch (a.type) {
    case "add_task":
      next.tasks.push({ id: `u${Date.now().toString(36)}`, title: a.title, minutes: a.minutes, dueDay: a.dueDay, dueMin: a.dueMin, importance: a.importance, categories: ["deadline"] });
      break;
    case "update_task":
      next.tasks = next.tasks.map((t) =>
        t.id === a.taskId
          ? { ...t, minutes: a.minutes ?? t.minutes, dueDay: a.dueDay ?? t.dueDay, dueMin: a.dueMin ?? t.dueMin, importance: a.importance ?? t.importance }
          : t,
      );
      break;
    case "remove_task":
      next.tasks = next.tasks.filter((t) => t.id !== a.taskId);
      break;
    case "add_event":
      next.fixed.push({ id: `e${Date.now().toString(36)}`, title: a.title, day: a.day, start: a.start, end: a.end, kind: "personal", locked: true });
      break;
  }
  return next;
}

const key = (s: Schedule["sessions"][number]) => `${s.taskId}|${s.day}|${s.start}|${s.end}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function Planner() {
  const [instance, setInstance] = useState<Instance>(DEMO);
  const [approved, setApproved] = useState<Schedule | null>(null);
  const [strategy, setStrategy] = useState<Strategy>(DEFAULT_STRATEGY);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi! I'm Dino, your DinoDocket planner. Generate this week's plan, or tell me what changed, like \"I have a CMPSC lab report due Wednesday, about 4 hours\"." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Restore saved state after mount (localStorage is browser-only).
    /* eslint-disable react-hooks/set-state-in-effect */
    setInstance(load("dinodocket.instance", DEMO));
    setApproved(load<Schedule | null>("dinodocket.approved", null));
    setStrategy(load("dinodocket.strategy", DEFAULT_STRATEGY));
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  useEffect(() => {
    if (ready) save("dinodocket.instance", instance);
  }, [instance, ready]);
  useEffect(() => {
    if (ready) save("dinodocket.approved", approved);
  }, [approved, ready]);
  useEffect(() => chatEnd.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  async function propose(next: Instance, label: string) {
    const res = await fetch("/api/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instance: next, strategy }) });
    const data = await res.json();
    if (!data.ok) {
      setMessages((m) => [...m, { role: "assistant", content: `The engine rejected that plan: ${data.violations?.[0] ?? "unknown error"}. Nothing was changed.` }]);
      return;
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

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
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

  function approve() {
    if (!proposal) return;
    setInstance(proposal.instance);
    setApproved(proposal.schedule);
    setProposal(null);
    setMessages((m) => [...m, { role: "assistant", content: "Approved. This is now your plan for the week." }]);
  }
  function reject() {
    setProposal(null);
    setMessages((m) => [...m, { role: "assistant", content: "Discarded. Your current plan is unchanged. Want me to try a different trade-off?" }]);
  }
  function reset() {
    setInstance(DEMO);
    setApproved(null);
    setProposal(null);
  }

  const shownInst = proposal?.instance ?? instance;
  const shownSessions = proposal?.schedule.sessions ?? approved?.sessions ?? [];
  const diff = useMemo(() => {
    if (!proposal) return null;
    const before = new Set((approved?.sessions ?? []).map(key));
    const after = new Set(proposal.schedule.sessions.map(key));
    return { added: [...after].filter((k) => !before.has(k)).length, removed: [...before].filter((k) => !after.has(k)).length };
  }, [proposal, approved]);

  const placed = (sch: Schedule | null | undefined, id: string) => (sch?.sessions ?? []).filter((s) => s.taskId === id).reduce((a, s) => a + s.end - s.start, 0);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">This week</h1>
            <p className="text-sm text-muted">
              {proposal ? "Reviewing a proposal. Nothing changes until you approve." : approved ? "Approved plan." : "No plan yet."}{" "}
              <span className="whitespace-nowrap">Strategy: {strategy.name}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={reset} className="rounded-lg border border-line px-3 py-2 text-sm text-muted hover:text-ink">Reset demo</button>
            <button onClick={generate} disabled={busy} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-ink disabled:opacity-50">
              {approved ? "Re-plan week" : "Generate plan"}
            </button>
          </div>
        </div>

        {proposal && (
          <div className="rounded-xl border-2 border-dashed border-accent bg-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-accent">Proposed change</div>
                <div className="mt-0.5 text-sm">
                  {diff?.added ?? 0} blocks added, {diff?.removed ?? 0} removed or moved. Dashed blocks below are the proposal.
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={reject} className="rounded-lg border border-line px-3 py-1.5 text-sm">Reject</button>
                <button onClick={approve} className="rounded-lg bg-ok px-3 py-1.5 text-sm font-medium text-white">Approve</button>
              </div>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {proposal.explanation.map((l, i) => (
                <li key={i} className={l.startsWith("⚠") ? "text-warn" : ""}>{l}</li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
              {(["completion", "livable", "breaks", "focusFit", "buffer"] as const).map((k) => (
                <span key={k} className="rounded-full border border-line px-2 py-0.5">
                  {k === "focusFit" ? "focus-hours fit" : k === "buffer" ? "done ≥24h early" : k} {pct(proposal.score[k])}
                </span>
              ))}
            </div>
          </div>
        )}

        <WeekCalendar instance={shownInst} sessions={shownSessions} proposed={!!proposal} />
      </section>

      <aside className="flex min-w-0 flex-col gap-4">
        <div className="flex h-[440px] flex-col rounded-xl border border-line bg-panel">
          <div className="border-b border-line px-4 py-2.5 text-sm font-semibold">🦕 Dino</div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "ml-8 rounded-lg bg-accent px-3 py-2 text-accent-ink" : "mr-6 rounded-lg bg-fixed px-3 py-2"}>
                {m.content}
              </div>
            ))}
            {busy && <div className="mr-6 rounded-lg bg-fixed px-3 py-2 text-muted">Thinking…</div>}
            <div ref={chatEnd} />
          </div>
          <form onSubmit={send} className="flex gap-2 border-t border-line p-2">
            <label htmlFor="chat" className="sr-only">Message</label>
            <input
              id="chat"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. Busy Tue 6pm-9pm"
              className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button disabled={busy || !input.trim()} className="rounded-lg bg-accent px-3 text-sm font-medium text-accent-ink disabled:opacity-50">Send</button>
          </form>
        </div>

        <TaskList instance={shownInst} placedFn={(id) => placed(proposal?.schedule ?? approved, id)} onRemove={(id) => propose(applyAction(shownInst, { type: "remove_task", taskId: id }), "Remove task")} onAdd={(a) => propose(applyAction(shownInst, a), "Add task")} />
      </aside>
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
    <div className="rounded-xl border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="text-sm font-semibold">Tasks &amp; goals</span>
        <button onClick={() => setOpen(!open)} className="text-sm text-accent">{open ? "Cancel" : "+ Add"}</button>
      </div>
      {open && (
        <form onSubmit={submit} className="grid grid-cols-2 gap-2 border-b border-line p-3 text-sm">
          <input aria-label="Title" placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="col-span-2 rounded-md border border-line bg-bg px-2 py-1.5" />
          <label className="flex items-center gap-2 text-muted">Hours<input type="number" min={0.5} max={40} step={0.5} value={f.hours} onChange={(e) => setF({ ...f, hours: Number(e.target.value) })} className="w-full rounded-md border border-line bg-bg px-2 py-1.5 text-ink" /></label>
          <select aria-label="Importance" value={f.importance} onChange={(e) => setF({ ...f, importance: e.target.value as Importance })} className="rounded-md border border-line bg-bg px-2 py-1.5">
            {["essential", "high", "normal", "flexible"].map((i) => <option key={i}>{i}</option>)}
          </select>
          <select aria-label="Due day" value={f.day} onChange={(e) => setF({ ...f, day: Number(e.target.value) })} className="rounded-md border border-line bg-bg px-2 py-1.5">
            {DAY_NAMES.map((d, i) => <option key={d} value={i}>Due {d}</option>)}
          </select>
          <input aria-label="Due time" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} className="rounded-md border border-line bg-bg px-2 py-1.5" />
          <button className="col-span-2 rounded-md bg-accent py-1.5 font-medium text-accent-ink">Propose with this task</button>
        </form>
      )}
      <ul className="divide-y divide-line">
        {instance.tasks.map((t) => {
          const p = placedFn(t.id);
          const short = p < t.minutes;
          return (
            <li key={t.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: taskColor(instance, t.id) }} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{t.title}</div>
                <div className="text-xs text-muted">
                  {t.importance} · due {DAY_NAMES[t.dueDay]} {fmtTime(t.dueMin)} ·{" "}
                  <span className={short && p > 0 ? "text-warn" : ""}>{(p / 60).toFixed(1)}/{(t.minutes / 60).toFixed(1)}h planned</span>
                </div>
              </div>
              <button onClick={() => onRemove(t.id)} className="text-xs text-muted hover:text-warn" aria-label={`Remove ${t.title}`}>Remove</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
