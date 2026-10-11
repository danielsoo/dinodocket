"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearLocalPlan, demoLogout, useDemoUser } from "@/lib/auth";
import { DEMO, DEFAULT_STRATEGY } from "@/lib/demo";
import {
  DAILY, DEFAULT_ANSWERS, NUDGES, PEAKS, ROLES, SESSIONS, SLEEP_OPTIONS, STYLES, WAKE_OPTIONS, YEARS,
  applyAnswers, copyFor, loadAnswers, summary, timeLabel, type Answers,
} from "@/lib/onboarding";

// Personal settings: account info plus every sign-up answer, editable in place.

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border-2 px-3 py-1 text-sm font-semibold transition ${on ? "border-accent bg-accent text-white" : "border-line bg-panel hover:border-accent/50"}`}
    >
      {children}
    </button>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 border-t border-line py-4 first:border-t-0 sm:grid-cols-[200px_1fr] sm:gap-6">
      <div>
        <div className="text-sm font-bold">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function Settings() {
  const router = useRouter();
  const user = useDemoUser();
  const [a, setA] = useState<Answers>(DEFAULT_ANSWERS);
  const [saved, setSaved] = useState<Answers | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [onAccount, setOnAccount] = useState(false); // signed in with a real (database) account

  useEffect(() => {
    // Local answers first (instant), then the account's copy if signed in.
    const local = loadAnswers();
    /* eslint-disable react-hooks/set-state-in-effect */
    if (local) {
      setA(local);
      setSaved(local);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setOnAccount(!!(d?.enabled && d?.user));
        if (d?.answers && typeof d.answers === "object") {
          const remote = { ...DEFAULT_ANSWERS, ...d.answers } as Answers;
          setA(remote);
          setSaved(remote);
        }
      })
      .catch(() => {});
  }, []);

  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => {
    setA((x) => ({ ...x, [k]: v }));
    setStatus("idle");
  };
  const toggle = (k: "commitments" | "goals", v: string) => {
    setA((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));
    setStatus("idle");
  };
  const copy = copyFor(a.role);
  const years = a.role ? YEARS.filter((y) => y.roles.includes(a.role!)) : [];
  const dirty = JSON.stringify(a) !== JSON.stringify(saved);

  async function save() {
    setStatus("saving");
    applyAnswers(a, user?.name ?? "", DEMO, DEFAULT_STRATEGY, { keepPlan: true });
    if (onAccount) {
      try {
        await fetch("/api/auth/me", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: a }) });
      } catch {}
    }
    setSaved(a);
    setStatus("saved");
  }

  async function logOut() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    clearLocalPlan();
    demoLogout();
    router.push("/login");
  }

  if (user === null) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="font-display text-2xl font-bold">Log in to see your settings</h1>
        <p className="mt-2 text-sm text-muted">Your planning preferences live on your account.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/login" className="btn-sticker rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white">Log in</Link>
          <Link href="/signup" className="rounded-xl border border-line px-4 py-2 text-sm font-bold hover:bg-panel">Sign up</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pb-24">
      {/* account */}
      <div className="flex items-center gap-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-claw font-display text-2xl font-bold text-deep shadow-[3px_3px_0_var(--stroke)]" aria-hidden>
          {(user?.name ?? "?").charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-bold">{user?.name ?? " "}</h1>
          <p className="truncate text-sm text-muted">{user?.email ?? " "}</p>
        </div>
        <button type="button" onClick={logOut} className="ml-auto rounded-xl border border-line px-3.5 py-2 text-sm font-semibold hover:bg-panel">
          Log out
        </button>
      </div>

      <div className="rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
        <span className="font-bold">How Dino plans for you: </span>
        <span className="text-muted">{summary(a)}</span>
      </div>

      <Section title="About you">
        <Row label="Which sounds most like you?">
          {ROLES.map((r) => (
            <Pill
              key={r.v}
              on={a.role === r.v}
              onClick={() => {
                const ys = YEARS.filter((y) => y.roles.includes(r.v));
                const c = copyFor(r.v);
                setA((x) => ({
                  ...x,
                  role: r.v,
                  year: ys.some((y) => y.v === x.year) ? x.year : "na",
                  commitments: x.commitments.filter((v) => c.commitments.includes(v)),
                  goals: x.goals.filter((v) => c.goals.includes(v)),
                }));
                setStatus("idle");
              }}
            >
              {r.label}
            </Pill>
          ))}
        </Row>
        {years.length > 0 && (
          <Row label="Year" hint="Optional">
            {years.map((y) => (
              <Pill key={y.v} on={a.year === y.v} onClick={() => set("year", a.year === y.v ? "na" : y.v)}>
                {y.label}
              </Pill>
            ))}
          </Row>
        )}
      </Section>

      <Section title="Your day" sub="Dino never schedules outside these hours.">
        <Row label="Usually up by">
          {WAKE_OPTIONS.map((m) => (
            <Pill key={m} on={a.wake === m} onClick={() => set("wake", m)}>
              {timeLabel(m)}
            </Pill>
          ))}
        </Row>
        <Row label="Done for the day by">
          {SLEEP_OPTIONS.map((m) => (
            <Pill key={m} on={a.sleep === m} onClick={() => set("sleep", m)}>
              {m >= 1440 ? "Midnight+" : timeLabel(m)}
            </Pill>
          ))}
        </Row>
        <Row label="Best focus time">
          {PEAKS.map((p) => (
            <Pill key={p.v} on={a.peak === p.v} onClick={() => set("peak", p.v)}>
              {p.label} <span className="font-normal opacity-70">· {p.range}</span>
            </Pill>
          ))}
        </Row>
      </Section>

      <Section title="How you work">
        <Row label="Block length" hint="How long you can focus in one sitting">
          {SESSIONS.map((x) => (
            <Pill key={x.v} on={a.sessionLen === x.v} onClick={() => set("sessionLen", x.v)}>
              {x.label}
            </Pill>
          ))}
        </Row>
        <Row label="Daily limit" hint={copy.daily}>
          {DAILY.map((x) => (
            <Pill key={x.v} on={a.dailyHours === x.v} onClick={() => set("dailyHours", x.v)}>
              {x.label}
            </Pill>
          ))}
        </Row>
        <Row label="Starting on deadlines" hint={copy.start}>
          {STYLES.map((x) => (
            <Pill key={x.v} on={a.workStyle === x.v} onClick={() => set("workStyle", x.v)}>
              {x.label}
            </Pill>
          ))}
        </Row>
      </Section>

      <Section title="Your week">
        <Row label="Regular commitments">
          {copy.commitments.map((c) => (
            <Pill key={c} on={a.commitments.includes(c)} onClick={() => toggle("commitments", c)}>
              {c}
            </Pill>
          ))}
        </Row>
        <Row label={copy.goalsLabel}>
          {copy.goals.map((g) => (
            <Pill key={g} on={a.goals.includes(g)} onClick={() => toggle("goals", g)}>
              {g}
            </Pill>
          ))}
        </Row>
      </Section>

      <Section title="Check-ins">
        <Row label="How often Dino nudges you">
          {NUDGES.map((n) => (
            <Pill key={n.v} on={a.nudge === n.v} onClick={() => set("nudge", n.v)}>
              {n.label}
            </Pill>
          ))}
        </Row>
      </Section>

      <p className="text-center text-xs text-muted">
        Prefer the step-by-step version? <Link href="/onboarding" className="font-semibold text-accent hover:underline">Redo the setup questions</Link>
      </p>

      {/* save bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <span className="text-sm text-muted">
            {status === "saved" && !dirty ? "Saved. Generate a new plan to use these settings." : dirty ? "You have unsaved changes." : "All changes saved."}
          </span>
          <div className="ml-auto flex gap-2">
            {dirty && saved && (
              <button type="button" onClick={() => setA(saved)} className="rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:text-ink">
                Discard
              </button>
            )}
            {status === "saved" && !dirty ? (
              <Link href="/" className="btn-sticker rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white">
                Back to planner
              </Link>
            ) : (
              <button type="button" onClick={save} disabled={!dirty || status === "saving" || !a.role} className="btn-sticker rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
                {status === "saving" ? "Saving…" : "Save changes"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
