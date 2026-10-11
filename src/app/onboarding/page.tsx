"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useDemoUser } from "@/lib/auth";
import { DEMO, DEFAULT_STRATEGY } from "@/lib/demo";
import {
  DAILY, DEFAULT_ANSWERS, NUDGES, PEAKS, ROLES, SESSIONS, SLEEP_OPTIONS, STYLES, WAKE_OPTIONS, YEARS,
  applyAnswers, copyFor, loadAnswers, summary, timeLabel, toProfile, type Answers,
} from "@/lib/onboarding";

const STEPS = [
  { title: "First, a bit about you", sub: "So Dino knows what a normal week looks like for you." },
  { title: "What does your day look like?", sub: "Dino won't schedule anything outside these hours." },
  { title: "How do you like to work?", sub: "This shapes how big tasks get split up." },
  { title: "What else is on your plate?", sub: "Pick any that apply. You can skip this one." },
  { title: "How much should Dino check in?", sub: "You can change this anytime." },
] as const;

function Choice({ on, onClick, label, hint, wide }: { on: boolean; onClick: () => void; label: string; hint?: string; wide?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-xl border-2 px-3.5 py-3 text-left transition ${wide ? "w-full" : ""} ${
        on ? "border-accent bg-accent/10 shadow-[2px_2px_0_var(--accent)]" : "border-line bg-panel hover:border-accent/50"
      }`}
    >
      <span className="block text-sm font-bold">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
    </button>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border-2 px-3.5 py-1.5 text-sm font-semibold transition ${
        on ? "border-accent bg-accent text-white" : "border-line bg-panel text-ink hover:border-accent/50"
      }`}
    >
      {children}
    </button>
  );
}

function Q({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted">{label}</h3>
      {children}
    </div>
  );
}

export default function Onboarding() {
  const router = useRouter();
  const user = useDemoUser();
  const [a, setA] = useState<Answers>(DEFAULT_ANSWERS);
  useEffect(() => {
    // Retaking the questions starts from the previous answers (localStorage is browser-only).
    const saved = loadAnswers();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setA(saved);
  }, []);
  const [step, setStep] = useState(0);
  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((x) => ({ ...x, [k]: v }));
  const toggle = (k: "commitments" | "goals", v: string) =>
    setA((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));

  const done = step >= STEPS.length;
  const name = user?.name ?? "";
  const years = a.role ? YEARS.filter((y) => y.roles.includes(a.role!)) : [];
  const copy = copyFor(a.role);
  const p = toProfile(a);

  const go = (d: number) => {
    setStep((s) => Math.max(0, s + d));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  function finish() {
    applyAnswers(a, name, DEMO, DEFAULT_STRATEGY);
    router.push("/");
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-11rem)] w-full max-w-2xl flex-col justify-center py-4">
      <div className="overflow-hidden rounded-[1.5rem] border-2 border-[var(--stroke)] bg-panel shadow-[6px_6px_0_var(--stroke)]">
        {/* progress */}
        <div className="flex items-center gap-3 border-b border-line px-6 py-4 sm:px-8">
          <Image src="/logo-160.png" alt="" width={32} height={32} />
          <div className="flex-1">
            <div className="flex justify-between text-xs font-bold text-muted">
              <span>{done ? "All set" : `Step ${step + 1} of ${STEPS.length}`}</span>
              {!done && (
                <button type="button" onClick={() => router.push("/")} className="hover:text-ink hover:underline">
                  Skip for now
                </button>
              )}
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${(Math.min(step, STEPS.length) / STEPS.length) * 100}%` }} />
            </div>
          </div>
        </div>

        <div className="px-6 py-7 sm:px-8">
          {!done ? (
            <>
              <h1 className="font-display text-2xl font-bold sm:text-3xl">
                {step === 0 && name ? `Hi ${name}! ` : ""}
                {STEPS[step].title}
              </h1>
              <p className="mt-1 text-sm text-muted">{STEPS[step].sub}</p>

              <div className="mt-6 space-y-6">
                {step === 0 && (
                  <>
                    <Q label="Which sounds most like you?">
                      <div className="grid grid-cols-2 gap-2.5">
                        {ROLES.map((r) => (
                          <Choice
                            key={r.v}
                            on={a.role === r.v}
                            label={r.label}
                            hint={r.hint}
                            onClick={() => {
                              const ys = YEARS.filter((y) => y.roles.includes(r.v));
                              const c = copyFor(r.v);
                              setA((x) => ({
                                ...x,
                                role: r.v,
                                year: ys.some((y) => y.v === x.year) ? x.year : "na",
                                // drop picks that don't exist for the new role
                                commitments: x.commitments.filter((v) => c.commitments.includes(v)),
                                goals: x.goals.filter((v) => c.goals.includes(v)),
                              }));
                            }}
                          />
                        ))}
                      </div>
                    </Q>
                    {years.length > 0 && (
                      <Q label="What year are you in? (optional)">
                        <div className="flex flex-wrap gap-2">
                          {years.map((y) => (
                            <Pill key={y.v} on={a.year === y.v} onClick={() => set("year", y.v)}>
                              {y.label}
                            </Pill>
                          ))}
                        </div>
                      </Q>
                    )}
                  </>
                )}

                {step === 1 && (
                  <>
                    <Q label="Usually up by">
                      <div className="flex flex-wrap gap-2">
                        {WAKE_OPTIONS.map((m) => (
                          <Pill key={m} on={a.wake === m} onClick={() => set("wake", m)}>
                            {timeLabel(m)}
                          </Pill>
                        ))}
                      </div>
                    </Q>
                    <Q label="Done for the day by">
                      <div className="flex flex-wrap gap-2">
                        {SLEEP_OPTIONS.map((m) => (
                          <Pill key={m} on={a.sleep === m} onClick={() => set("sleep", m)}>
                            {m >= 1440 ? "Midnight or later" : timeLabel(m)}
                          </Pill>
                        ))}
                      </div>
                    </Q>
                    <Q label="When do you focus best?">
                      <div className="grid grid-cols-2 gap-2.5">
                        {PEAKS.map((pk) => (
                          <Choice key={pk.v} on={a.peak === pk.v} onClick={() => set("peak", pk.v)} label={pk.label} hint={pk.range} />
                        ))}
                      </div>
                    </Q>
                  </>
                )}

                {step === 2 && (
                  <>
                    <Q label="How long can you focus in one sitting?">
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        {SESSIONS.map((s) => (
                          <Choice key={s.v} on={a.sessionLen === s.v} onClick={() => set("sessionLen", s.v)} label={s.label} hint={s.hint} />
                        ))}
                      </div>
                    </Q>
                    <Q label={copy.daily}>
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        {DAILY.map((d) => (
                          <Choice key={d.v} on={a.dailyHours === d.v} onClick={() => set("dailyHours", d.v)} label={d.label} hint={d.hint} />
                        ))}
                      </div>
                    </Q>
                    <Q label={copy.start}>
                      <div className="grid gap-2.5 sm:grid-cols-3">
                        {STYLES.map((s) => (
                          <Choice key={s.v} on={a.workStyle === s.v} onClick={() => set("workStyle", s.v)} label={s.label} hint={s.hint} />
                        ))}
                      </div>
                    </Q>
                  </>
                )}

                {step === 3 && (
                  <>
                    <Q label="Regular commitments">
                      <div className="flex flex-wrap gap-2">
                        {copy.commitments.map((c) => (
                          <Pill key={c} on={a.commitments.includes(c)} onClick={() => toggle("commitments", c)}>
                            {c}
                          </Pill>
                        ))}
                      </div>
                    </Q>
                    <Q label={copy.goalsLabel}>
                      <div className="flex flex-wrap gap-2">
                        {copy.goals.map((g) => (
                          <Pill key={g} on={a.goals.includes(g)} onClick={() => toggle("goals", g)}>
                            {g}
                          </Pill>
                        ))}
                      </div>
                    </Q>
                  </>
                )}

                {step === 4 && (
                  <div className="grid gap-2.5">
                    {NUDGES.map((n) => (
                      <Choice key={n.v} wide on={a.nudge === n.v} onClick={() => set("nudge", n.v)} label={n.label} hint={n.hint} />
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl font-bold sm:text-3xl">Here&apos;s how Dino will plan for you</h1>
              <p className="mt-2 text-sm text-muted">{summary(a)}</p>
              <dl className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {[
                  ["Planning hours", `${timeLabel(p.wake)} – ${timeLabel(p.sleep)}`],
                  ["Focus window", `${timeLabel(p.focusStart)} – ${timeLabel(p.focusEnd)}`],
                  ["Block length", `${a.sessionLen} min`],
                  ["Daily limit", `${(p.maxFocusPerDay / 60).toFixed(p.maxFocusPerDay % 60 ? 1 : 0)} h`],
                  ["Breaks", p.breakMin ? `${p.breakMin} min between blocks` : "Back to back is fine"],
                  ["Check-ins", NUDGES.find((n) => n.v === a.nudge)!.label],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-bg px-3.5 py-3">
                    <dt className="text-[11px] font-bold uppercase tracking-wide text-muted">{k}</dt>
                    <dd className="mt-0.5 text-sm font-bold">{v}</dd>
                  </div>
                ))}
              </dl>
              {(a.commitments.length > 0 || a.goals.length > 0) && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {[...a.commitments, ...a.goals].map((t) => (
                    <span key={t} className="rounded-full bg-claw/20 px-2.5 py-1 text-xs font-semibold">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line bg-bg/60 px-6 py-4 sm:px-8">
          <button
            type="button"
            onClick={() => go(-1)}
            className={`rounded-xl px-3 py-2 text-sm font-bold text-muted hover:text-ink ${step === 0 ? "invisible" : ""}`}
          >
            Back
          </button>
          {done ? (
            <button type="button" onClick={finish} className="btn-sticker rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white">
              Open my planner
            </button>
          ) : (
            <button
              type="button"
              onClick={() => go(1)}
              disabled={step === 0 && !a.role}
              title={step === 0 && !a.role ? "Pick the one that sounds most like you" : undefined}
              className="btn-sticker rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {step === STEPS.length - 1 ? "See my setup" : "Continue"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
