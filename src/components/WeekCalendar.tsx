"use client";

import { DAY_NAMES, type Instance, type Session } from "@/lib/engine/types";
import { fmtTime } from "@/lib/engine/scheduler";

const PX = 20; // pixels per 30 minutes

export const TASK_COLORS = ["#2f5bd3", "#c2410c", "#0f766e", "#7c3aed", "#b45309", "#be185d", "#15803d", "#0369a1"];

export function taskColor(inst: Instance, taskId: string) {
  const i = inst.tasks.findIndex((t) => t.id === taskId);
  return TASK_COLORS[(i < 0 ? 0 : i) % TASK_COLORS.length];
}

export default function WeekCalendar({
  instance,
  sessions,
  proposed,
  onSelect,
}: {
  instance: Instance;
  sessions: Session[];
  proposed: boolean;
  onSelect?: (s: Session) => void;
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
    <div className="overflow-x-auto rounded-xl border border-line bg-panel">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-line text-xs font-medium text-muted">
          <div />
          {DAY_NAMES.map((d) => (
            <div key={d} className="px-2 py-2">{d}</div>
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
            <div key={d} className="relative border-l border-line" style={{ height }}>
              {hours.map((m) => (
                <div key={m} className="absolute inset-x-0 border-t border-line/60" style={{ top: y(m) }} />
              ))}
              {/* Hours outside the student's awake window */}
              <div className="absolute inset-x-0 bg-ink/[0.03]" style={{ top: 0, height: Math.max(0, y(instance.profile.wake)) }} />

              {instance.fixed.filter((e) => e.day === d).map((e) => (
                <div
                  key={e.id}
                  className="fixed-stripes absolute inset-x-1 overflow-hidden rounded-md border border-line bg-fixed px-1.5 py-0.5 text-[10px] leading-tight text-fixed-ink"
                  style={{ top: y(e.start), height: y(e.end) - y(e.start) - 1 }}
                  title={`${e.title} (fixed, locked) ${fmtTime(e.start)}-${fmtTime(e.end)}`}
                >
                  <span aria-hidden>🔒 </span>
                  <span className="font-medium">{e.title}</span>
                </div>
              ))}

              {sessions.filter((s) => s.day === d).map((s, i) => {
                const t = tasks.get(s.taskId);
                const c = taskColor(instance, s.taskId);
                return (
                  <button
                    type="button"
                    onClick={() => onSelect?.(s)}
                    key={`${s.taskId}-${s.start}-${i}`}
                    className={`absolute inset-x-1 overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[10px] leading-tight transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-accent ${proposed ? "border-2 border-dashed" : "border"}`}
                    style={{
                      top: y(s.start),
                      height: y(s.end) - y(s.start) - 1,
                      borderColor: c,
                      background: `color-mix(in srgb, ${c} ${proposed ? 12 : 20}%, var(--panel))`,
                    }}
                    title={`${t?.title ?? s.taskId} ${fmtTime(s.start)}-${fmtTime(s.end)}${proposed ? " (proposed)" : ""}`}
                  >
                    <span className="font-semibold" style={{ color: c }}>
                      {t?.plan?.length ? <span aria-label="has steps">☰ </span> : null}
                      {t?.title ?? s.taskId}
                    </span>
                    <div className="text-muted">{fmtTime(s.start)}-{fmtTime(s.end)}</div>
                  </button>
                );
              })}

              {instance.tasks.filter((t) => t.dueDay === d && t.dueMin > from && t.dueMin <= to).map((t) => (
                <div key={`due-${t.id}`} className="pointer-events-none absolute inset-x-0 z-10" style={{ top: y(t.dueMin) }}>
                  <div className="border-t-2 border-warn" />
                  <span className="absolute right-1 -top-3.5 rounded bg-warn px-1 text-[9px] font-semibold text-white">
                    DUE {t.title.length > 16 ? `${t.title.slice(0, 15)}…` : t.title}
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
