"use client";

import { useEffect } from "react";
import { DAY_NAMES, type Instance, type Session } from "@/lib/engine/types";
import { fmtTime } from "@/lib/engine/scheduler";
import { resourceUrl, stepsForSession } from "@/lib/steps";
import { taskColor } from "./WeekCalendar";

export default function SessionDetail({
  instance,
  sessions,
  session,
  onClose,
  onBreakDown,
}: {
  instance: Instance;
  sessions: Session[];
  session: Session;
  onClose: () => void;
  onBreakDown: (title: string) => void;
}) {
  const task = instance.tasks.find((t) => t.id === session.taskId);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!task) return null;
  const color = taskColor(instance, task.id);
  const { index, total, steps } = stepsForSession(task, sessions, session);
  const now = new Set(steps.map((s) => s.n));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose} role="presentation">
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${task.title} details`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-panel shadow-xl"
      >
        <div className="border-b border-line p-5" style={{ borderTop: `4px solid ${color}` }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold leading-snug">{task.title}</h2>
              <p className="mt-1 text-sm text-muted">
                {DAY_NAMES[session.day]} {fmtTime(session.start)} to {fmtTime(session.end)}
                {total > 1 ? ` · session ${index + 1} of ${total}` : ""}
              </p>
              <p className="text-xs text-muted">
                {task.importance} · due {DAY_NAMES[task.dueDay]} {fmtTime(task.dueMin)} · {(task.minutes / 60).toFixed(1)}h total
              </p>
            </div>
            <button onClick={onClose} className="rounded-md px-2 py-1 text-muted hover:bg-fixed hover:text-ink" aria-label="Close">✕</button>
          </div>
        </div>

        {task.plan?.length ? (
          <div className="space-y-5 p-5">
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">This session</h3>
              <ol className="space-y-3">
                {steps.map(({ step, n }) => (
                  <li key={n} className="rounded-lg border border-accent/40 bg-accent/5 p-3">
                    <div className="text-sm font-semibold">
                      Step {n + 1}. {step.title} <span className="font-normal text-muted">· ~{step.minutes} min</span>
                    </div>
                    {step.detail && <p className="mt-1 text-sm text-muted">{step.detail}</p>}
                    {step.resources.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {step.resources.map((r, i) => (
                          <li key={i}>
                            <a
                              href={resourceUrl(r)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 text-xs hover:border-accent"
                            >
                              <span aria-hidden>{r.kind === "youtube" ? "▶" : "🔎"}</span>
                              {r.label}
                              <span className="text-muted">({r.kind === "youtube" ? "YouTube" : "web"} search)</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Full plan</h3>
              <ol className="space-y-1.5 text-sm">
                {task.plan.map((st, n) => (
                  <li key={n} className={`flex gap-2 ${now.has(n) ? "font-medium" : "text-muted"}`}>
                    <span className="w-5 shrink-0 text-right">{n + 1}.</span>
                    <span>{st.title}</span>
                    {now.has(n) && <span className="ml-auto shrink-0 text-xs text-accent">this session</span>}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        ) : (
          <div className="space-y-3 p-5 text-sm">
            <p className="text-muted">No step-by-step plan for this task yet.</p>
            <button
              onClick={() => onBreakDown(task.title)}
              className="rounded-lg bg-accent px-3 py-2 font-medium text-accent-ink"
            >
              Ask Dino to break it into steps
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
