"use client";

import { DAY_NAMES, type FixedEvent, type Instance, type Session } from "@/lib/engine/types";
import { fmtTime } from "@/lib/engine/scheduler";

const PX = 22; // pixels per 30 minutes

export const TASK_COLORS = ["#2350e6", "#e0531f", "#0ea5c6", "#7c3aed", "#c98a1a", "#db2777", "#15994a", "#0f766e"];

export function taskColor(inst: Instance, taskId: string) {
  const i = inst.tasks.findIndex((t) => t.id === taskId);
  return inst.tasks[i]?.color ?? TASK_COLORS[(i < 0 ? 0 : i) % TASK_COLORS.length];
}

export default function WeekCalendar({
  instance,
  sessions,
  proposed,
  onSelect,
  onSelectEvent,
  onCreate,
}: {
  instance: Instance;
  sessions: Session[];
  proposed: boolean;
  onSelect?: (s: Session) => void;
  onSelectEvent?: (e: FixedEvent) => void;
  onCreate?: (day: number, minute: number) => void;
}) {
  const startMin = Math.min(instance.profile.wake, ...instance.fixed.map((e) => e.start)) - 30;
  const from = Math.max(0, Math.floor(startMin / 60) * 60);
  const to = Math.min(1440, Math.max(instance.profile.sleep, ...instance.fixed.map((e) => e.end)));
  const height = ((to - from) / 30) * PX;
  const y = (m: number) => ((m - from) / 30) * PX;
  const hours: number[] = [];
  for (let m = from; m < to; m += 60) hours.push(m);
  const tasks = new Map(instance.tasks.map((t) => [t.id, t]));

  return (
    <div className="card overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="sticky top-0 z-20 grid grid-cols-[52px_repeat(7,1fr)] border-b border-line bg-panel font-display text-sm font-semibold text-ink">
          <div />
          {DAY_NAMES.map((d) => (
            <div key={d} className="px-2 py-2.5">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-[52px_repeat(7,1fr)]">
          <div className="relative" style={{ height }}>
            {hours.map((m) => (
              <div key={m} className="absolute right-2 -translate-y-1/2 text-[10px] text-muted" style={{ top: y(m) }}>
                {m > from ? fmtTime(m).replace(":00", "") : ""}
              </div>
            ))}
          </div>
          {DAY_NAMES.map((_, d) => (
            <div
              key={d}
              className="relative cursor-cell border-l border-line"
              style={{ height }}
              title="Click an empty spot to add an event"
              onClick={(ev) => {
                if (ev.target !== ev.currentTarget) return; // only empty space, not blocks
                const r = ev.currentTarget.getBoundingClientRect();
                const minute = from + Math.floor(((ev.clientY - r.top) / PX)) * 30;
                onCreate?.(d, Math.max(0, Math.min(1410, minute)));
              }}
            >
              {hours.map((m) => (
                <div key={m} className="pointer-events-none absolute inset-x-0 border-t border-line/50" style={{ top: y(m) }} />
              ))}
              {/* Hours outside the student's awake window */}
              <div className="pointer-events-none absolute inset-x-0 bg-ink/[0.03]" style={{ top: 0, height: Math.max(0, y(instance.profile.wake)) }} />

              {instance.fixed.filter((e) => e.day === d).map((e) => {
                const meeting = e.kind === "meeting";
                const missing = meeting && !e.link && !e.location;
                const tint = e.color
                  ? { background: `color-mix(in srgb, ${e.color} 18%, var(--panel))`, borderLeft: `3px solid ${e.color}` }
                  : {};
                return (
                  <button
                    type="button"
                    key={e.id}
                    onClick={() => onSelectEvent?.(e)}
                    className={`absolute inset-x-1 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[10px] leading-tight text-fixed-ink transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-accent ${e.color ? "" : meeting ? "border bg-panel" : "fixed-stripes bg-fixed"} ${missing ? "border border-warn" : e.color ? "" : "border-line"}`}
                    style={{ top: y(e.start), height: Math.max(PX - 1, y(e.end) - y(e.start) - 1), ...tint }}
                    title={`${e.title} (fixed) ${fmtTime(e.start)}-${fmtTime(e.end)}${e.location ? ` · ${e.location}` : ""}${missing ? " · no link or location" : ""} · click to edit`}
                  >
                    <span aria-hidden>{meeting ? (missing ? "⚠ " : "📹 ") : "🔒 "}</span>
                    <span className="font-semibold">{e.title}</span>
                    {missing && <span className="text-warn"> · no link</span>}
                  </button>
                );
              })}

              {sessions.filter((s) => s.day === d).map((s, i) => {
                const t = tasks.get(s.taskId);
                const c = taskColor(instance, s.taskId);
                return (
                  <button
                    type="button"
                    onClick={() => onSelect?.(s)}
                    key={`${s.taskId}-${s.start}-${i}`}
                    className={`absolute inset-x-1 overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[10px] leading-tight shadow-[0_1px_0_rgba(0,0,0,0.03)] transition hover:-translate-y-px hover:shadow-md focus-visible:outline-2 focus-visible:outline-accent ${proposed ? "outline-1 outline-dashed -outline-offset-1" : ""}`}
                    style={{
                      top: y(s.start),
                      height: y(s.end) - y(s.start) - 1,
                      borderLeftColor: c,
                      outlineColor: c,
                      background: `color-mix(in srgb, ${c} ${proposed ? 10 : 16}%, var(--panel))`,
                    }}
                    title={`${t?.title ?? s.taskId} ${fmtTime(s.start)}-${fmtTime(s.end)}${proposed ? " (proposed)" : ""}`}
                  >
                    <span className="font-bold" style={{ color: `color-mix(in srgb, ${c} 72%, var(--ink))` }}>
                      {t?.plan?.length ? <span aria-label="has steps">☰ </span> : null}
                      {t?.title ?? s.taskId}
                    </span>
                    <div className="text-muted">{fmtTime(s.start)}-{fmtTime(s.end)}</div>
                  </button>
                );
              })}

              {instance.tasks.filter((t) => t.dueDay === d && t.dueMin > from && t.dueMin <= to).map((t) => (
                <div key={`due-${t.id}`} className="pointer-events-none absolute inset-x-0 z-10" style={{ top: y(t.dueMin) }}>
                  <div className="border-t-2 border-dashed border-claw" />
                  <span className="absolute right-1 -top-2 max-w-[90%] truncate rounded-full border border-black/60 bg-[#f2c25c] px-1.5 text-[9px] font-extrabold leading-4 text-[#1b1400]" title={`${t.title} due ${fmtTime(t.dueMin)}`}>
                    Due · {t.title}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
