"use client";

import { DAY_NAMES, type FixedEvent, type Instance, type Session } from "@/lib/engine/types";
import { fmtTime } from "@/lib/engine/scheduler";

const PX = 28; // pixels per 30 minutes (a 30-min block must fit one readable line)

/** Compact range for small blocks: "9–10 AM", "11:30 AM–1 PM". */
function span(a: number, b: number) {
  const part = (m: number) => {
    const h = Math.floor(m / 60) % 24, mm = m % 60;
    return { t: `${h % 12 === 0 ? 12 : h % 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""}`, ap: h < 12 ? "AM" : "PM" };
  };
  const x = part(a), y = part(b);
  return x.ap === y.ap ? `${x.t}–${y.t} ${y.ap}` : `${x.t} ${x.ap}–${y.t} ${y.ap}`;
}

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

  // The engine works in 30-minute pieces; back-to-back pieces of the same task
  // are one block to a person, so draw them as one. Clicks open the first piece.
  const blocks: { first: Session; day: number; start: number; end: number; taskId: string }[] = [];
  for (const s0 of [...sessions].sort((a, b) => a.day - b.day || a.start - b.start)) {
    const last = blocks[blocks.length - 1];
    if (last && last.day === s0.day && last.taskId === s0.taskId && last.end === s0.start) last.end = s0.end;
    else blocks.push({ first: s0, day: s0.day, start: s0.start, end: s0.end, taskId: s0.taskId });
  }

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
              <div key={m} className="absolute right-2 -translate-y-1/2 text-[11px] font-semibold text-muted" style={{ top: y(m) }}>
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
                const h = y(e.end) - y(e.start);
                const accent = e.color ?? (meeting ? "var(--accent)" : "var(--fixed-ink)");
                return (
                  <button
                    type="button"
                    key={e.id}
                    onClick={() => onSelectEvent?.(e)}
                    className={`absolute inset-x-1 overflow-hidden rounded-lg px-2 text-left leading-tight text-fixed-ink transition hover:brightness-[0.97] focus-visible:outline-2 focus-visible:outline-accent ${h < 2 * PX ? "flex items-center gap-1" : "py-1"} ${missing ? "ring-1 ring-warn" : ""}`}
                    style={{
                      top: y(e.start) + 1,
                      height: Math.max(PX - 2, h - 2),
                      background: e.color ? `color-mix(in srgb, ${e.color} 14%, var(--panel))` : "var(--fixed-bg)",
                      boxShadow: `inset 3px 0 0 color-mix(in srgb, ${accent} 55%, transparent)`,
                    }}
                    title={`${e.title} (fixed) ${fmtTime(e.start)}-${fmtTime(e.end)}${e.location ? ` · ${e.location}` : ""}${missing ? " · no link or location" : ""} · click to edit`}
                  >
                    <span className="block truncate text-[11px] font-bold">
                      {missing && <span className="text-warn">⚠ </span>}
                      {e.title}
                    </span>
                    {h >= 2 * PX && <span className="block truncate text-[10px] opacity-75">{span(e.start, e.end)}</span>}
                  </button>
                );
              })}

              {blocks.filter((b) => b.day === d).map((b) => {
                const t = tasks.get(b.taskId);
                const c = taskColor(instance, b.taskId);
                const h = y(b.end) - y(b.start);
                const roomy = h >= 2 * PX;
                return (
                  <button
                    type="button"
                    onClick={() => onSelect?.(b.first)}
                    key={`${b.taskId}-${b.day}-${b.start}`}
                    className={`absolute inset-x-1 overflow-hidden rounded-lg px-2 text-left leading-tight shadow-sm transition hover:-translate-y-px hover:shadow-md focus-visible:outline-2 focus-visible:outline-accent ${roomy ? "py-1" : "flex items-center"}`}
                    style={{
                      top: y(b.start) + 1,
                      height: h - 2,
                      background: `color-mix(in srgb, ${c} ${proposed ? 12 : 18}%, var(--panel))`,
                      boxShadow: `inset 3px 0 0 ${c}`,
                    }}
                    title={`${t?.title ?? b.taskId} ${fmtTime(b.start)}-${fmtTime(b.end)}${proposed ? " (proposed)" : ""}`}
                  >
                    <span className={`block text-[11px] font-bold ${roomy ? "line-clamp-2" : "truncate"}`} style={{ color: `color-mix(in srgb, ${c} 70%, var(--ink))` }}>
                      {t?.title ?? b.taskId}
                    </span>
                    {roomy && <span className="block truncate text-[10px] text-muted">{span(b.start, b.end)}</span>}
                  </button>
                );
              })}

              {instance.tasks.filter((t) => t.dueDay === d && t.dueMin > from && t.dueMin <= to).map((t) => (
                <div key={`due-${t.id}`} className="pointer-events-none absolute inset-x-0 z-10" style={{ top: y(t.dueMin) - 1 }}>
                  <div className="h-0.5 bg-warn/70" />
                  <span className="absolute -top-2 left-0 max-w-[92%] truncate rounded-r-full bg-warn px-1.5 text-[9px] font-extrabold leading-4 text-white" title={`${t.title} due ${fmtTime(t.dueMin)}`}>
                    Due {t.title}
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
