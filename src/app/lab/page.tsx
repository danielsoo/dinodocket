"use client";

import { useState } from "react";
import type { Candidate } from "@/lib/agents";

type TestResult = { name: string; mean: number; feasibleRate: number; components: Record<string, number> };
const AGENT_COLORS: Record<string, string> = {
  baseline: "#8a877e",
  "Deadline Guardian": "#c2410c",
  "Wellbeing Advocate": "#0f766e",
  Explorer: "#7c3aed",
  Refiner: "#2f5bd3",
};
const COMPONENTS = ["completion", "focusFit", "livable", "breaks", "buffer"] as const;

export default function Lab() {
  const [rounds, setRounds] = useState(6);
  const [all, setAll] = useState<Candidate[]>([]);
  const [meta, setMeta] = useState<{ mode: string; model: string | null; trainSize: number; db: boolean } | null>(null);
  const [test, setTest] = useState<{ baseline: TestResult; best: TestResult; testSize: number } | null>(null);
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const [saved, setSaved] = useState("");

  const sorted = [...all].sort((a, b) => b.eval.mean - a.eval.mean);
  const best = sorted[0];
  const baseline = all.find((c) => c.agent === "baseline");

  async function run() {
    setRunning(true);
    setTest(null);
    setSaved("");
    setAll([]);
    try {
      setStatus("Scoring baseline on training weeks…");
      const init = await (await fetch("/api/lab/init", { method: "POST" })).json();
      setMeta({ mode: init.mode, model: init.model, trainSize: init.trainSize, db: init.db });
      let pool: Candidate[] = [init.baseline];
      setAll(pool);
      let recent: { agent: string; mean: number; rationale: string }[] = [];
      for (let r = 1; r <= rounds; r++) {
        setStatus(`Round ${r}/${rounds}: 4 agents proposing in parallel…`);
        const elites = [...pool].sort((a, b) => b.eval.mean - a.eval.mean).slice(0, 5);
        const res = await fetch("/api/lab/round", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ round: r, elites, recent }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "round failed");
        const cands = data.candidates as Candidate[];
        pool = [...pool, ...cands];
        recent = cands.map((c) => ({ agent: c.agent, mean: c.eval.mean, rationale: c.rationale }));
        setAll(pool);
      }
      setStatus("Testing baseline and best strategy on held-out weeks…");
      const top = [...pool].sort((a, b) => b.eval.mean - a.eval.mean)[0];
      const t = await (await fetch("/api/lab/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strategies: [pool[0].strategy, top.strategy] }) })).json();
      const testRes = { baseline: t.results[0], best: t.results[1], testSize: t.testSize };
      setTest(testRes);
      setStatus("Done.");
      if (init.db) {
        const s = await (await fetch("/api/lab/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: init.mode, model: init.model, baselineTrain: pool[0].eval.mean, bestTrain: top.eval.mean, test: testRes, bestStrategy: top.strategy,
            rounds: pool.map((c) => ({ agent: c.agent, round: c.round, mean: c.eval.mean, source: c.source, rationale: c.rationale })),
          }),
        })).json();
        if (s.id) setSaved(`Run saved to MongoDB (${s.id}).`);
      }
    } catch (e) {
      setStatus(`Stopped: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  }

  function applyToPlanner() {
    if (!best) return;
    try {
      localStorage.setItem("dinodocket.strategy", JSON.stringify({ ...best.strategy, name: `Agent-tuned (${best.agent} r${best.round})` }));
      setStatus("Saved. The Planner now uses this strategy.");
    } catch {
      setStatus("Couldn't save to this browser's storage.");
    }
  }

  const maxRound = Math.max(rounds, ...all.map((c) => c.round));
  const scores = all.map((c) => c.eval.mean);
  const lo = Math.floor(Math.min(60, ...scores) / 5) * 5;
  const hi = Math.ceil(Math.max(85, ...scores) / 5) * 5;
  const W = 640, H = 260, P = { l: 40, r: 12, t: 12, b: 28 };
  const x = (r: number) => P.l + (r / maxRound) * (W - P.l - P.r);
  const yy = (s: number) => H - P.b - ((s - lo) / (hi - lo)) * (H - P.t - P.b);
  const bestSoFar: { r: number; s: number }[] = [];
  for (let r = 0; r <= maxRound; r++) {
    const upto = all.filter((c) => c.round <= r);
    if (upto.length && upto.some((c) => c.round === r)) bestSoFar.push({ r, s: Math.max(...upto.map((c) => c.eval.mean)) });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agent Lab</h1>
          <p className="max-w-2xl text-sm text-muted">
            Four agents improve the scheduling strategy in parallel. Each round they read the best strategies, scores and worst
            failures, propose new strategies, and the engine scores them on {meta?.trainSize ?? 30} synthetic student weeks.
            The final strategy is then tested on 15 weeks the agents never saw.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted">
            Rounds{" "}
            <input type="number" min={1} max={15} value={rounds} onChange={(e) => setRounds(Math.max(1, Math.min(15, Number(e.target.value))))} className="w-16 rounded-md border border-line bg-panel px-2 py-1.5 text-ink" />
          </label>
          <button onClick={run} disabled={running} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-50">
            {running ? "Running…" : "Run optimization"}
          </button>
        </div>
      </div>

      {meta && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-line bg-panel px-2.5 py-1">
            {meta.mode === "llm" ? `LLM agents · ${meta.model} on Luminal` : "Mock agents (no LUMINAL_API_KEY): random mutation, not an LLM"}
          </span>
          {meta.mode === "llm" && all.length > 1 && (() => {
            const props = all.filter((c) => c.agent !== "baseline");
            const ok = props.filter((c) => c.source === "llm").length;
            return (
              <span className={`rounded-full border px-2.5 py-1 ${ok === props.length ? "border-ok text-ok" : "border-warn text-warn"}`}>
                LLM proposals {ok}/{props.length}{ok < props.length ? ` · ${props.length - ok} fell back to local mutation` : ""}
              </span>
            );
          })()}
          <span className="rounded-full border border-line bg-panel px-2.5 py-1">MongoDB {meta.db ? "on" : "off"}</span>
          {status && <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-muted">{status}</span>}
        </div>
      )}
      {!meta && status && <p className="text-sm text-muted">{status}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Stat label="Baseline (train)" value={baseline ? baseline.eval.mean.toFixed(1) : "—"} />
        <Stat label="Best so far (train)" value={best ? best.eval.mean.toFixed(1) : "—"} sub={best && best.agent !== "baseline" ? `${best.agent}, round ${best.round}` : undefined} />
        <Stat
          label={`Held-out test (${test?.testSize ?? 15} unseen weeks)`}
          value={test ? `${test.baseline.mean.toFixed(1)} → ${test.best.mean.toFixed(1)}` : "—"}
          sub={test ? `${(((test.best.mean - test.baseline.mean) / test.baseline.mean) * 100).toFixed(1)}% relative improvement · ${Math.round(test.best.feasibleRate * 100)}% valid` : undefined}
          highlight={!!test}
        />
      </div>

      <div className="rounded-xl border border-line bg-panel p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Score by round (training weeks)</h2>
          <div className="flex flex-wrap gap-3 text-xs text-muted">
            {Object.entries(AGENT_COLORS).map(([n, c]) => (
              <span key={n} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{n}</span>
            ))}
            <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-ink" />best so far</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Candidate scores per round with best-so-far line">
          {Array.from({ length: (hi - lo) / 5 + 1 }, (_, i) => lo + i * 5).map((s) => (
            <g key={s}>
              <line x1={P.l} x2={W - P.r} y1={yy(s)} y2={yy(s)} stroke="var(--line)" />
              <text x={P.l - 6} y={yy(s) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{s}</text>
            </g>
          ))}
          {Array.from({ length: maxRound + 1 }, (_, r) => (
            <text key={r} x={x(r)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">{r === 0 ? "base" : `r${r}`}</text>
          ))}
          {bestSoFar.length > 1 && (
            <polyline fill="none" stroke="var(--ink)" strokeWidth="2" points={bestSoFar.map((p) => `${x(p.r)},${yy(p.s)}`).join(" ")} />
          )}
          {all.map((c, i) => (
            <circle key={i} cx={x(c.round) + (c.agent === "baseline" ? 0 : ((i % 4) - 1.5) * 5)} cy={yy(c.eval.mean)} r="4.5" fill={AGENT_COLORS[c.agent] ?? "#888"} opacity="0.85">
              <title>{`${c.agent} r${c.round}: ${c.eval.mean.toFixed(2)}`}</title>
            </circle>
          ))}
        </svg>
      </div>

      {baseline && best && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-line bg-panel p-4">
            <h2 className="mb-3 text-sm font-semibold">Where the gain comes from (train, baseline vs best)</h2>
            <div className="space-y-2.5">
              {COMPONENTS.map((k) => (
                <div key={k} className="text-xs">
                  <div className="mb-1 flex justify-between text-muted">
                    <span>{k}</span>
                    <span>{Math.round(baseline.eval.components[k] * 100)}% → <b className="text-ink">{Math.round(best.eval.components[k] * 100)}%</b></span>
                  </div>
                  <div className="relative h-2 rounded bg-fixed">
                    <div className="absolute inset-y-0 left-0 rounded bg-muted/50" style={{ width: `${baseline.eval.components[k] * 100}%` }} />
                    <div className="absolute inset-y-0 left-0 h-1 translate-y-0.5 rounded bg-accent" style={{ width: `${best.eval.components[k] * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <button onClick={applyToPlanner} disabled={!best || best.agent === "baseline"} className="mt-4 rounded-lg border border-accent px-3 py-1.5 text-sm text-accent disabled:opacity-40">
              Use best strategy in Planner
            </button>
            {saved && <p className="mt-2 text-xs text-ok">{saved}</p>}
          </div>
          <div className="rounded-xl border border-line bg-panel p-4">
            <h2 className="mb-2 text-sm font-semibold">Best strategy</h2>
            <pre className="max-h-72 overflow-auto rounded-md bg-bg p-3 text-[11px] leading-snug">{JSON.stringify(best.strategy, null, 2)}</pre>
          </div>
        </div>
      )}

      {all.length > 1 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr><th className="px-3 py-2">Round</th><th className="px-3 py-2">Agent</th><th className="px-3 py-2">Score</th><th className="px-3 py-2">Rationale</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...all].reverse().map((c, i) => (
                <tr key={i} className={c === best ? "bg-accent/10" : ""}>
                  <td className="px-3 py-2 text-muted">{c.round}</td>
                  <td className="whitespace-nowrap px-3 py-2" style={{ color: AGENT_COLORS[c.agent] }}>{c.agent}{c.source === "fallback" ? " (fallback)" : ""}</td>
                  <td className="px-3 py-2 font-mono">{c.eval.mean.toFixed(2)}</td>
                  <td className="px-3 py-2 text-muted">{c.rationale}{c.error ? ` [${c.error.slice(0, 220)}]` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border bg-panel p-4 ${highlight ? "border-accent" : "border-line"}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}
