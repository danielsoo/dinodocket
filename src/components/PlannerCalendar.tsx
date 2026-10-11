"use client";

import { useEffect, useState } from "react";
import WeekCalendar, { taskColor } from "./WeekCalendar";
import { DAY_NAMES, type FixedEvent, type Instance, type Session } from "@/lib/engine/types";
import { MONTHS, addDays, dayIndex, mondayOf, monthGrid, sameDay, weekMonthTitle, weekRange } from "@/lib/dates";

type View = "week" | "month";

const shortTime = (m: number) => {
  const h = Math.floor(m / 60) % 24, mm = m % 60;
  return `${h % 12 === 0 ? 12 : h % 12}${mm ? `:${String(mm).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`;
};

function Arrow({ dir, onClick, label }: { dir: "left" | "right"; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d={dir === "left" ? "M10 3L5 8l5 5" : "M6 3l5 5-5 5"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export default function PlannerCalendar({
  instance,
  sessions,
  proposed,
  planWeek,
  onPlanWeekChange,
  onSelect,
  onSelectEvent,
  onCreate,
}: {
  instance: Instance;
  sessions: Session[];
  proposed: boolean;
  planWeek: Date | null; // Monday the plan is pinned to
  onPlanWeekChange: (monday: Date) => void;
  onSelect?: (s: Session) => void;
  onSelectEvent?: (e: FixedEvent) => void;
  onCreate?: (day: number, minute: number) => void;
}) {
  const [view, setView] = useState<View>("week");
  const [viewWeek, setViewWeek] = useState<Date | null>(null);
  const [viewMonth, setViewMonth] = useState<Date | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // The user's clock is only known in the browser; tick once a minute for the "now" line.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const week = viewWeek ?? planWeek;
  const month = viewMonth ?? week;
  const onPlanWeek = !!(week && planWeek && sameDay(week, planWeek));

  function step(dir: 1 | -1) {
    if (view === "week" && week) setViewWeek(addDays(week, 7 * dir));
    if (view === "month" && month) setViewMonth(new Date(month.getFullYear(), month.getMonth() + dir, 1));
  }
  function today() {
    if (!now) return;
    setViewWeek(mondayOf(now));
    setViewMonth(now);
  }
  function openWeek(d: Date) {
    setViewWeek(mondayOf(d));
    setView("week");
  }

  const title = view === "week" ? (week ? weekMonthTitle(week) : "") : month ? `${MONTHS[month.getMonth()]} ${month.getFullYear()}` : "";

  return (
    <div className="card overflow-hidden">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4">
        <button type="button" onClick={today} className="rounded-full border border-line px-3.5 py-1.5 text-sm font-semibold hover:bg-bg">
          Today
        </button>
        <div className="flex items-center">
          <Arrow dir="left" label={view === "week" ? "Previous week" : "Previous month"} onClick={() => step(-1)} />
          <Arrow dir="right" label={view === "week" ? "Next week" : "Next month"} onClick={() => step(1)} />
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-lg font-semibold leading-tight">{title}</div>
          {view === "week" && week && <div className="text-xs text-muted">{weekRange(week)}</div>}
        </div>
        {view === "week" && onPlanWeek && (
          <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-bold text-accent">Planned week</span>
        )}
        <div className="ml-auto flex rounded-full border border-line p-0.5 text-sm font-semibold" role="tablist" aria-label="Calendar view">
          {(["week", "month"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => {
                if (v === "month" && week) setViewMonth(week);
                setView(v);
              }}
              className={`rounded-full px-3.5 py-1 capitalize ${view === v ? "bg-ink text-panel" : "text-muted hover:text-ink"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "week" && week && planWeek && !onPlanWeek && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-bg/70 px-4 py-2.5 text-sm">
          <span className="text-muted">
            Your plan is for <b className="text-ink">{weekRange(planWeek, false)}</b>. This week shows your weekly classes and commitments.
          </span>
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={() => setViewWeek(planWeek)} className="rounded-full px-3 py-1 text-xs font-bold text-muted hover:bg-panel hover:text-ink">
              Go to plan
            </button>
            <button type="button" onClick={() => onPlanWeekChange(week)} className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-white hover:brightness-110">
              Plan this week instead
            </button>
          </span>
        </div>
      )}

      {view === "week" ? (
        <WeekCalendar
          instance={instance}
          sessions={sessions}
          proposed={proposed}
          weekStart={week}
          now={now}
          showPlan={!planWeek || onPlanWeek}
          onSelect={onSelect}
          onSelectEvent={onSelectEvent}
          onCreate={onCreate}
        />
      ) : (
        month && <MonthView instance={instance} sessions={sessions} month={month} planWeek={planWeek} now={now} onOpenDay={openWeek} />
      )}
    </div>
  );
}

function MonthView({
  instance,
  sessions,
  month,
  planWeek,
  now,
  onOpenDay,
}: {
  instance: Instance;
  sessions: Session[];
  month: Date;
  planWeek: Date | null;
  now: Date | null;
  onOpenDay: (d: Date) => void;
}) {
  const days = monthGrid(month);
  const inPlan = (d: Date) => !!planWeek && d >= planWeek && d < addDays(planWeek, 7);
  const fixedByDay = DAY_NAMES.map((_, i) => instance.fixed.filter((e) => e.day === i).sort((a, b) => a.start - b.start));
  const workByDay = DAY_NAMES.map((_, i) => {
    const mine = sessions.filter((s) => s.day === i);
    const ids = [...new Set(mine.map((s) => s.taskId))];
    return { minutes: mine.reduce((a, s) => a + s.end - s.start, 0), ids };
  });

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-7 border-b border-line">
          {DAY_NAMES.map((d) => (
            <div key={d} className="px-2 py-2 text-xs font-bold uppercase tracking-wide text-muted">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const idx = dayIndex(d);
            const other = d.getMonth() !== month.getMonth();
            const isToday = !!now && sameDay(d, now);
            const plan = inPlan(d);
            const due = plan ? instance.tasks.filter((t) => t.dueDay === idx) : [];
            const work = plan ? workByDay[idx] : null;
            const fixed = fixedByDay[idx];
            const extra = Math.max(0, fixed.length - 2);
            return (
              <button
                type="button"
                key={i}
                onClick={() => onOpenDay(d)}
                className={`flex min-h-[112px] flex-col gap-1 border-b border-line p-1.5 text-left transition hover:bg-bg ${i % 7 ? "border-l" : ""} ${plan ? "bg-accent/[0.05]" : ""}`}
                aria-label={`${DAY_NAMES[idx]} ${MONTHS[d.getMonth()]} ${d.getDate()}`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center self-start rounded-full text-xs font-bold ${
                    isToday ? "bg-accent text-white" : other ? "text-muted/50" : "text-ink"
                  }`}
                >
                  {d.getDate()}
                </span>
                <span className={`flex flex-col gap-0.5 ${other ? "opacity-50" : ""}`}>
                  {due.map((t) => (
                    <span key={t.id} className="truncate rounded bg-claw px-1 text-[10px] font-extrabold text-[#1b1400]">
                      Due {t.title}
                    </span>
                  ))}
                  {work && work.minutes > 0 && (
                    <span className="flex items-center gap-1 truncate text-[10px] font-semibold text-ink">
                      <span className="flex -space-x-0.5">
                        {work.ids.slice(0, 4).map((id) => (
                          <span key={id} className="h-2 w-2 rounded-full ring-1 ring-panel" style={{ background: taskColor(instance, id) }} />
                        ))}
                      </span>
                      {Math.round((work.minutes / 60) * 10) / 10}h planned
                    </span>
                  )}
                  {fixed.slice(0, 2).map((e) => (
                    <span key={e.id} className="truncate text-[10px] text-fixed-ink">
                      <span className="text-muted">{shortTime(e.start)}</span> {e.title}
                    </span>
                  ))}
                  {extra > 0 && <span className="text-[10px] font-semibold text-muted">+{extra} more</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
