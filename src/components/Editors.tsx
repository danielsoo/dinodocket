"use client";

import { useEffect, useState } from "react";
import { DAY_NAMES, type FixedEvent, type Importance, type Instance, type Task } from "@/lib/engine/types";
import { SWATCHES, allGroups, eventGroup, groupColor, taskGroup } from "@/lib/groups";

const toHM = (m: number) => `${String(Math.floor(Math.min(m, 1439) / 60)).padStart(2, "0")}:${String(Math.min(m, 1439) % 60).padStart(2, "0")}`;
const fromHM = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return Math.round(((h || 0) * 60 + (m || 0)) / 30) * 30;
};
const input = "w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";
const labelCls = "mb-1 block text-xs font-bold text-muted";

export function Drawer({ title, accent, onClose, children }: { title: string; accent?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-deep/40 backdrop-blur-[2px]" onClick={onClose} role="presentation">
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-panel shadow-xl"
        style={accent ? { borderTop: `4px solid ${accent}` } : undefined}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <h2 className="text-xl font-semibold leading-snug">{title}</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-muted hover:bg-fixed hover:text-ink" aria-label="Close">✕</button>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function ColorPicker({ value, onChange, fallback }: { value?: string; onChange: (c?: string) => void; fallback: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Color">
      {SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={`h-7 w-7 rounded-full border-2 transition ${value === c ? "scale-110 border-ink" : "border-transparent hover:scale-105"}`}
          style={{ background: c }}
        />
      ))}
      <button
        type="button"
        onClick={() => onChange(undefined)}
        className={`ml-1 rounded-full border px-2 py-0.5 text-xs ${value ? "border-line text-muted" : "border-ink font-bold"}`}
        title="Use the default color"
      >
        <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: fallback }} />
        Auto
      </button>
    </div>
  );
}

export function GroupPicker({ instance, value, onChange }: { instance: Instance; value: string; onChange: (g: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const groups = allGroups(instance);
  if (value && !groups.includes(value)) groups.push(value);
  return (
    <div className="flex flex-wrap gap-1.5">
      {groups.map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => onChange(g)}
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${value === g ? "border-ink text-ink" : "border-line text-muted hover:text-ink"}`}
          style={value === g ? { background: `color-mix(in srgb, ${groupColor(g, instance)} 22%, var(--panel))` } : undefined}
        >
          <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: groupColor(g, instance) }} />
          {g}
        </button>
      ))}
      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim().slice(0, 24);
            if (n) onChange(n);
            setAdding(false);
            setName("");
          }}
          className="flex gap-1"
        >
          <input autoFocus aria-label="New group name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" className="w-28 rounded-full border border-line bg-bg px-2.5 py-1 text-xs outline-none focus:border-accent" />
          <button className="rounded-full bg-accent px-2.5 text-xs font-bold text-white">Add</button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-muted hover:text-ink">
          + New group
        </button>
      )}
    </div>
  );
}

export function EventEditor({
  instance,
  event,
  isNew,
  onSave,
  onDelete,
  onClose,
}: {
  instance: Instance;
  event: FixedEvent;
  isNew: boolean;
  onSave: (e: FixedEvent, all: boolean) => void;
  onDelete: (id: string, all: boolean) => void;
  onClose: () => void;
}) {
  const [e, setE] = useState<FixedEvent>({ ...event, group: eventGroup(event) });
  // Repeating events share a title (e.g. a class on Mon/Wed/Fri). Let the user change one day or every occurrence.
  const siblings = isNew ? 0 : instance.fixed.filter((x) => x.id !== event.id && x.title.trim().toLowerCase() === event.title.trim().toLowerCase()).length;
  const [all, setAll] = useState(false);
  const meeting = e.kind === "meeting";
  const valid = e.title.trim() && e.end > e.start;
  return (
    <Drawer title={isNew ? "New event" : "Edit event"} accent={e.color ?? groupColor(e.group ?? "Other", instance)} onClose={onClose}>
      <form
        className="space-y-4 p-5"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (valid) onSave({ ...e, title: e.title.trim() }, siblings > 0 && all);
        }}
      >
        <div>
          <label className={labelCls} htmlFor="ev-title">Title</label>
          <input id="ev-title" autoFocus={isNew} className={input} value={e.title} onChange={(x) => setE({ ...e, title: x.target.value })} placeholder="e.g. Team meeting" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls} htmlFor="ev-day">Day</label>
            <select id="ev-day" className={input} value={e.day} onChange={(x) => setE({ ...e, day: Number(x.target.value) })}>
              {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="ev-start">Start</label>
            <input id="ev-start" type="time" step={1800} className={input} value={toHM(e.start)} onChange={(x) => setE({ ...e, start: fromHM(x.target.value) })} />
          </div>
          <div>
            <label className={labelCls} htmlFor="ev-end">End</label>
            <input id="ev-end" type="time" step={1800} className={input} value={toHM(e.end)} onChange={(x) => setE({ ...e, end: Math.max(30, fromHM(x.target.value)) })} />
          </div>
        </div>
        {e.end <= e.start && <p className="text-xs text-warn">End time must be after the start.</p>}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={meeting} onChange={(x) => setE({ ...e, kind: x.target.checked ? "meeting" : e.kind === "meeting" ? "personal" : e.kind })} />
          This is a meeting or call
        </label>
        {meeting && (
          <div className="grid gap-2">
            <div>
              <label className={labelCls} htmlFor="ev-link">Meeting link</label>
              <input id="ev-link" className={input} value={e.link ?? ""} onChange={(x) => setE({ ...e, link: x.target.value || undefined })} placeholder="https://zoom.us/j/..." />
            </div>
            <div>
              <label className={labelCls} htmlFor="ev-loc">Location</label>
              <input id="ev-loc" className={input} value={e.location ?? ""} onChange={(x) => setE({ ...e, location: x.target.value || undefined })} placeholder="e.g. Library room 2B" />
            </div>
          </div>
        )}
        <div>
          <span className={labelCls}>Group</span>
          <GroupPicker instance={instance} value={e.group ?? "Other"} onChange={(g) => setE({ ...e, group: g })} />
        </div>
        <div>
          <span className={labelCls}>Color</span>
          <ColorPicker value={e.color} onChange={(c) => setE({ ...e, color: c })} fallback={groupColor(e.group ?? "Other", instance)} />
        </div>
        {siblings > 0 && (
          <fieldset className="rounded-xl border border-line p-3">
            <legend className="px-1 text-xs font-bold uppercase tracking-wide text-muted">This repeats</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="ev-scope" checked={!all} onChange={() => setAll(false)} />
              Only this {DAY_NAMES[event.day]}
            </label>
            <label className="mt-1 flex items-center gap-2 text-sm">
              <input type="radio" name="ev-scope" checked={all} onChange={() => setAll(true)} />
              All {siblings + 1} &ldquo;{event.title}&rdquo; events (each keeps its own day)
            </label>
          </fieldset>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
          {!isNew ? (
            <button type="button" onClick={() => onDelete(e.id, siblings > 0 && all)} className="rounded-xl px-3 py-2 text-sm font-semibold text-warn hover:bg-warn/10">{siblings > 0 && all ? `Delete all ${siblings + 1}` : "Delete"}</button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-line px-3 py-2 text-sm font-semibold hover:bg-fixed">Cancel</button>
            <button disabled={!valid} className="btn-sticker rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{isNew ? "Add event" : "Save"}</button>
          </div>
        </div>
        {meeting && e.link && /^https?:\/\//.test(e.link) && (
          <a href={e.link} target="_blank" rel="noopener noreferrer" className="block text-sm font-semibold text-accent hover:underline">Join meeting →</a>
        )}
      </form>
    </Drawer>
  );
}

export function TaskEditor({ instance, task, onSave, onDelete }: { instance: Instance; task: Task; onSave: (t: Task) => void; onDelete: (id: string) => void }) {
  const [t, setT] = useState<Task>({ ...task, group: taskGroup(task) });
  return (
    <form
      className="space-y-4"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (t.title.trim()) onSave({ ...t, title: t.title.trim() });
      }}
    >
      <div>
        <label className={labelCls} htmlFor="t-title">Title</label>
        <input id="t-title" className={input} value={t.title} onChange={(x) => setT({ ...t, title: x.target.value })} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={labelCls} htmlFor="t-hours">Hours</label>
          <input id="t-hours" type="number" min={0.5} max={40} step={0.5} className={input} value={t.minutes / 60} onChange={(x) => setT({ ...t, minutes: Math.max(30, Math.round((Number(x.target.value) * 60) / 30) * 30) })} />
        </div>
        <div>
          <label className={labelCls} htmlFor="t-day">Due</label>
          <select id="t-day" className={input} value={t.dueDay} onChange={(x) => setT({ ...t, dueDay: Number(x.target.value) })}>
            {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="t-time">Time</label>
          <input id="t-time" type="time" step={1800} className={input} value={toHM(t.dueMin)} onChange={(x) => setT({ ...t, dueMin: Math.max(30, fromHM(x.target.value)) })} />
        </div>
      </div>
      <div>
        <label className={labelCls} htmlFor="t-imp">Importance</label>
        <select id="t-imp" className={input} value={t.importance} onChange={(x) => setT({ ...t, importance: x.target.value as Importance })}>
          {["essential", "high", "normal", "flexible"].map((i) => <option key={i}>{i}</option>)}
        </select>
      </div>
      <div>
        <span className={labelCls}>Group</span>
        <GroupPicker instance={instance} value={t.group ?? "School"} onChange={(g) => setT({ ...t, group: g })} />
      </div>
      <div>
        <span className={labelCls}>Color</span>
        <ColorPicker value={t.color} onChange={(c) => setT({ ...t, color: c })} fallback="#2350e6" />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
        <button type="button" onClick={() => onDelete(t.id)} className="rounded-xl px-3 py-2 text-sm font-semibold text-warn hover:bg-warn/10">Delete task</button>
        <button className="btn-sticker rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white">Save</button>
      </div>
    </form>
  );
}
