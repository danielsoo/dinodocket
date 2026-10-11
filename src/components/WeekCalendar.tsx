"use client";

import { DAY_NAMES, type FixedEvent, type Instance, type Session } from "@/lib/engine/types";
import { fmtTime } from "@/lib/engine/scheduler";
import { addDays, sameDay } from "@/lib/dates";
import { pieceKey, taskKey } from "@/lib/progress";

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

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="9" height="9" fill="currentColor" aria-hidden="true">
      <path d="M8 1.5a3.5 3.5 0 0 0-3.5 3.5v2H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 15h8a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12 7h-.5V5A3.5 3.5 0 0 0 8 1.5Zm-2 5.5V5a2 2 0 1 1 4 0v2H6Z" />
    </svg>
  );
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
  weekStart = null,
  now = null,
  showPlan = true,
  done,
  onToggleDone,
}: {
  instance: Instance;
  sessions: Session[];
  proposed: boolean;
  weekStart?: Date | null; // Monday this template week is pinned to (null until the client clock is known)
  now?: Date | null;
  showPlan?: boolean; // false for weeks other than the planned one: only recurring fixed events are drawn
  done?: Set<string>; // piece keys the user checked off
  onToggleDone?: (pieces: Session[]) => void;
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
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="sticky top-0 z-20 grid grid-cols-[52px_repeat(7,1fr)] border-b border-line bg-panel text-ink">
          <div />
          {DAY_NAMES.map((d, i) => {
            const date = weekStart ? addDays(weekStart, i) : null;
            const today = !!(date && now && sameDay(date, now));
            return (
              <div key={d} className="flex items-baseline gap-1.5 px-2 py-2">
                <span className={`text-xs font-bold uppercase tracking-wide ${today ? "text-accent" : "text-muted"}`}>{d}</span>
                {date && (
                  <span
                    className={`font-display text-lg font-semibold leading-none ${today ? "flex h-7 w-7 items-center justify-center self-center rounded-full bg-accent text-sm text-white" : ""}`}
                  >
                    {date.getDate()}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-[52px_repeat(7,1fr)]">
          <div className="relative" style={{ height }}>
            {hours.map((m) => (
              <div key={m} className="absolute right-2 -translate-y-1/2 text-[11px] font-semibold text-muted" style={{ top: y(m) }}>
                {m > from ? fmtTime(m).replace(":00", "") : ""}
              </div>
            ))}
          </div>
          {DAY_NAMES.map((_, d) => {
            const date = weekStart ? addDays(weekStart, d) : null;
            const isToday = !!(date && now && sameDay(date, now));
            const nowMin = now ? now.getHours() * 60 + now.getMinutes() : -1;
            return (
            <div
              key={d}
              className={`relative cursor-cell border-l border-line ${isToday ? "bg-accent/[0.04]" : ""}`}
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
                const locked = e.locked !== false;
                const h = y(e.end) - y(e.start);
                const roomy = h >= 2 * PX;
                const accent = e.color ?? (meeting ? "var(--accent)" : "var(--fixed-ink)");
                return (
                  <button
                    type="button"
                    key={e.id}
                    onClick={() => onSelectEvent?.(e)}
                    className={`absolute inset-x-1 overflow-hidden rounded-lg pl-2.5 text-left leading-tight transition hover:brightness-[0.97] focus-visible:outline-2 focus-visible:outline-accent ${locked ? "pr-6 text-fixed-ink" : "pr-2 text-fixed-ink/80"} ${roomy ? "py-1" : "flex items-center gap-1"} ${missing ? "ring-1 ring-warn" : ""}`}
                    style={
                      locked
                        ? {
                            // Locked: solid, tinted, framed. Reads as "this does not move".
                            top: y(e.start) + 1,
                            height: Math.max(PX - 2, h - 2),
                            background: `color-mix(in srgb, ${accent} 24%, var(--panel))`,
                            border: `1.5px solid color-mix(in srgb, ${accent} 70%, transparent)`,
                            boxShadow: `inset 4px 0 0 ${accent}`,
                          }
                        : {
                            // Not locked: see-through and dashed. Reads as "flexible".
                            top: y(e.start) + 1,
                            height: Math.max(PX - 2, h - 2),
                            background: `repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, ${accent} 10%, transparent) 6px 8px), color-mix(in srgb, var(--panel) 70%, transparent)`,
                            border: `1.5px dashed color-mix(in srgb, ${accent} 55%, transparent)`,
                          }
                    }
                    title={`${e.title} · ${locked ? "Locked: nothing is ever planned over it" : "Not locked: essential work may use this time if the week is full"} · ${fmtTime(e.start)}-${fmtTime(e.end)}${e.location ? ` · ${e.location}` : ""}${missing ? " · no link or location" : ""} · click to edit`}
                  >
                    {locked && (
                      <span
                        aria-label="Locked"
                        className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full text-white shadow-sm"
                        style={{ background: accent === "var(--fixed-ink)" ? "var(--accent)" : accent }}
                      >
                        <LockIcon />
                      </span>
                    )}
                    <span className="block truncate text-[11px] font-bold">
                      {missing && <span className="text-warn">⚠ </span>}
                      {e.title}
                    </span>
                    {roomy && (
                      <span className="block truncate text-[10px] opacity-75">
                        {span(e.start, e.end)}
                        {!locked && " · flexible"}
                      </span>
                    )}
                  </button>
                );
              })}

              {isToday && nowMin >= from && nowMin <= to && (
                <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: y(nowMin) }} aria-label="Current time">
                  <div className="absolute -left-[5px] -top-[5px] h-2.5 w-2.5 rounded-full bg-warn" />
                  <div className="h-0.5 bg-warn" />
                </div>
              )}

              {showPlan && blocks.filter((b) => b.day === d).map((b) => {
                const t = tasks.get(b.taskId);
                const c = taskColor(instance, b.taskId);
                const h = y(b.end) - y(b.start);
                const roomy = h >= 2 * PX;
                const pieces = sessions.filter((x) => x.taskId === b.taskId && x.day === b.day && x.start >= b.start && x.end <= b.end);
                const checkable = !proposed && !!onToggleDone;
                const isDone = checkable && !!done && (done.has(taskKey(b.taskId)) || pieces.every((x) => done.has(pieceKey(x))));
                return (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect?.(b.first)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        onSelect?.(b.first);
                      }
                    }}
                    key={`${b.taskId}-${b.day}-${b.start}`}
                    className={`group absolute inset-x-1 cursor-pointer overflow-hidden rounded-lg px-2 text-left leading-tight shadow-sm transition hover:-translate-y-px hover:shadow-md focus-visible:outline-2 focus-visible:outline-accent ${roomy ? "py-1" : "flex items-center"} ${checkable ? "pr-6" : ""} ${isDone ? "opacity-60" : ""}`}
                    style={{
                      top: y(b.start) + 1,
                      height: h - 2,
                      background: `color-mix(in srgb, ${c} ${proposed || isDone ? 10 : 18}%, var(--panel))`,
                      boxShadow: `inset 3px 0 0 ${c}`,
                    }}
                    title={`${t?.title ?? b.taskId} ${fmtTime(b.start)}-${fmtTime(b.end)}${proposed ? " (proposed)" : isDone ? " (done)" : ""}`}
                  >
                    <span className={`block text-[11px] font-bold ${roomy ? "line-clamp-2" : "truncate"} ${isDone ? "line-through" : ""}`} style={{ color: `color-mix(in srgb, ${c} 70%, var(--ink))` }}>
                      {t?.title ?? b.taskId}
                    </span>
                    {roomy && <span className="block truncate text-[10px] text-muted">{span(b.start, b.end)}</span>}
                    {checkable && (
                      <button
                        type="button"
                        aria-label={isDone ? "Mark not done" : "Mark done"}
                        aria-pressed={isDone}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onToggleDone(pieces);
                        }}
                        className={`absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 transition ${
                          isDone ? "border-transparent text-white" : "border-current bg-panel opacity-60 hover:opacity-100 group-hover:opacity-100"
                        }`}
                        style={{ color: isDone ? undefined : c, background: isDone ? c : undefined }}
                      >
                        {isDone && (
                          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
                            <path d="M2 5.2l2 2L8 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}

              {showPlan && instance.tasks.filter((t) => t.dueDay === d && t.dueMin > from && t.dueMin <= to).map((t) => (
                <div key={`due-${t.id}`} className="pointer-events-none absolute inset-x-0 z-10" style={{ top: y(t.dueMin) - 1 }}>
                  <div className="border-t-2 border-dashed border-claw" />
                  <span className="absolute -top-2 left-0 max-w-[92%] truncate rounded-r-full bg-claw px-1.5 text-[9px] font-extrabold leading-4 text-[#1b1400]" title={`${t.title} due ${fmtTime(t.dueMin)}`}>
                    Due {t.title}
                  </span>
                </div>
              ))}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
