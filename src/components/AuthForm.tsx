"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { demoLogin } from "@/lib/auth";

// Demo auth screen. Every submit succeeds: nothing is validated or sent anywhere.

type Mode = "login" | "signup";

const input =
  "w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
const label = "mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted";

const COPY: Record<Mode, { title: string; sub: string; cta: string; busy: string; swapText: string; swapLink: string; swapHref: string }> = {
  login: {
    title: "Welcome back",
    sub: "Log in to see whether your week actually fits.",
    cta: "Log in",
    busy: "Logging in…",
    swapText: "New to DinoDocket?",
    swapLink: "Create an account",
    swapHref: "/signup",
  },
  signup: {
    title: "Create your account",
    sub: "Your AI chief of staff for classes, deadlines and everything in between.",
    cta: "Create account",
    busy: "Creating account…",
    swapText: "Already have an account?",
    swapLink: "Log in",
    swapHref: "/login",
  },
};

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const c = COPY[mode];

  const finish = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    demoLogin(email, mode === "signup" ? name : undefined);
    // short pause so the button state is visible, then into the planner
    setTimeout(() => router.push("/"), 450);
  };

  return (
    <div className="mx-auto grid w-full max-w-4xl overflow-hidden rounded-[1.5rem] border-2 border-[var(--stroke)] bg-panel shadow-[6px_6px_0_var(--stroke)] md:grid-cols-[1fr_1.1fr]">
      {/* Brand side */}
      <aside className="relative hidden overflow-hidden bg-deep p-8 text-white md:flex md:flex-col">
        <div aria-hidden className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-cyan/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 -right-10 h-72 w-72 rounded-full bg-accent/50 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <Image src="/logo-160.png" alt="" width={48} height={48} className="drop-shadow-[0_2px_0_rgba(0,0,0,0.35)]" />
          <span className="font-display text-2xl font-bold tracking-wide">
            Dino<span className="text-cyan">Docket</span>
          </span>
        </div>
        <div className="relative mt-auto">
          <h2 className="font-display text-3xl font-bold leading-tight">
            Plans that fit
            <br />
            your <span className="text-claw">real</span> week.
          </h2>
          <ul className="mt-6 space-y-3 text-sm text-white/85">
            {[
              "Checks if your deadlines actually fit before you commit",
              "Breaks big assignments into doable sessions",
              "AI proposes, you approve. Always.",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-claw" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Form side */}
      <section className="p-6 sm:p-10">
        <div className="mb-6 flex items-center gap-2 md:hidden">
          <Image src="/logo-160.png" alt="" width={36} height={36} />
          <span className="font-display text-xl font-bold">
            Dino<span className="text-accent">Docket</span>
          </span>
        </div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{c.title}</h1>
        <p className="mt-1.5 text-sm text-muted">{c.sub}</p>

        <button
          type="button"
          onClick={() => finish()}
          disabled={busy}
          className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-panel px-4 py-2.5 text-sm font-bold transition hover:border-accent hover:bg-bg disabled:opacity-60"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3 text-xs font-semibold text-muted">
          <span className="h-px flex-1 bg-line" />
          or with email
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={finish} noValidate className="space-y-4">
          {mode === "signup" && (
            <div>
              <label htmlFor="name" className={label}>Name</label>
              <input id="name" autoComplete="name" className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nittany Lion" />
            </div>
          )}
          <div>
            <label htmlFor="email" className={label}>{mode === "signup" ? "School email" : "Email"}</label>
            <input id="email" type="email" inputMode="email" autoComplete="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="abc1234@psu.edu" />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="password" className={label}>Password</label>
              {mode === "login" && (
                <button type="button" onClick={() => setNote("Password reset isn't available in the demo.")} className="text-xs font-semibold text-accent hover:underline">
                  Forgot?
                </button>
              )}
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPw ? "text" : "password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className={`${input} pr-16`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute inset-y-0 right-2 my-auto h-7 rounded-lg px-2 text-xs font-bold text-muted hover:bg-line/60 hover:text-ink"
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          {mode === "signup" && (
            <div>
              <label htmlFor="confirm" className={label}>Confirm password</label>
              <input id="confirm" type={showPw ? "text" : "password"} autoComplete="new-password" className={input} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
            </div>
          )}
          {mode === "login" && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
              <input type="checkbox" defaultChecked className="h-4 w-4 accent-[var(--accent)]" />
              Keep me logged in
            </label>
          )}
          {mode === "signup" && (
            <p className="text-xs text-muted">
              By creating an account you agree to the Terms and Privacy Policy.
            </p>
          )}

          {note && <p className="rounded-lg bg-fixed px-3 py-2 text-xs font-semibold text-fixed-ink">{note}</p>}

          <button type="submit" disabled={busy} className="btn-sticker w-full rounded-xl bg-accent px-4 py-3 text-sm font-bold text-white disabled:opacity-70">
            {busy ? c.busy : c.cta}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          {c.swapText}{" "}
          <Link href={c.swapHref} className="font-bold text-accent hover:underline">
            {c.swapLink}
          </Link>
        </p>
      </section>
    </div>
  );
}
