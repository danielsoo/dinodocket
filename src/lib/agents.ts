import { chat, extractJson, llmEnabled } from "./llm";
import { evaluateStrategy, WEIGHTS, type EvalResult } from "./engine/evaluate";
import { generateInstance, TRAIN_SEEDS } from "./engine/generator";
import { mutate, sanitize } from "./engine/strategy";
import type { Strategy } from "./engine/types";

export interface Candidate {
  agent: string;
  round: number;
  strategy: Strategy;
  rationale: string;
  eval: Pick<EvalResult, "mean" | "feasibleRate" | "components" | "worst">;
  source: "llm" | "mock" | "fallback";
  error?: string;
}

export const AGENTS = [
  {
    id: "guardian",
    name: "Deadline Guardian",
    brief: "Protect deadlines. Push completion (importance-weighted) and the 24h deadline buffer up without letting other components collapse.",
    boldness: 0.8,
    bias: { importance: 0.6, deadlineBuffer: 0.6, slack: 0.4 },
  },
  {
    id: "wellbeing",
    name: "Wellbeing Advocate",
    brief: "Make weeks livable. Improve the livable (daily load under the student's limit), breaks, and focus-window fit scores, while keeping completion high.",
    boldness: 0.8,
    bias: { preferred: 0.6, spread: 0.6, adjacency: 0.5, lateNight: 0.5 },
  },
  {
    id: "explorer",
    name: "Explorer",
    brief: "Try a structurally different approach from the current best: change passes, session length, daily cap factor, break rule, or flip the sign of a weight. Big moves are welcome.",
    boldness: 2.2,
    bias: {},
  },
  {
    id: "refiner",
    name: "Refiner",
    brief: "Make small, careful adjustments to the current best strategy, targeting its weakest component on the worst instances.",
    boldness: 0.35,
    bias: {},
  },
] as const;

let trainCache: ReturnType<typeof generateInstance>[] | null = null;
export const trainSet = () => (trainCache ??= TRAIN_SEEDS.map(generateInstance));

const SCHEMA = `{
  "name": string,
  "order": { "urgency": number, "importance": number, "size": number, "slack": number },
  "slot": { "preferred": number, "early": number, "spread": number, "lateNight": number, "deadlineBuffer": number, "adjacency": number },
  "sessionLen": 30-180 (multiple of 30),
  "minSession": 30-90 (multiple of 30),
  "dailyCapFactor": 0.5-10,
  "respectBreaks": boolean,
  "passes": 1-3
}  // all weights in [-5, 5]`;

const SYSTEM = `You are one agent in a team optimizing a weekly scheduler for overcommitted college students.
The scheduler is a greedy constructive algorithm controlled by a strategy JSON:
- order.*: weights for task ordering. priority = urgency*(100/(hoursUntilDeadline+1)) + importance*(1..4) + size*hours - slack*min(freeTimeBeforeDeadline/required, 10). Higher priority is placed first.
- slot.*: weights for choosing a slot for each chunk. score = preferred*fractionInFocusWindow + early*(1 - weekPosition) - spread*(hoursAlreadyOnThatDay) - lateNight*(hoursAfter22:00) + deadlineBuffer*(finished>=24h early ? 1 : 0) - adjacency*(touchingBlocks 0..2).
- sessionLen: chunk size; minSession: smallest chunk in early passes.
- dailyCapFactor * student's maxFocusPerDay = daily work cap in pass 1 (pass 2 allows 1.35x, pass 3 is uncapped).
- respectBreaks: in pass 1, never place a chunk directly touching another block.
Hard constraints (overlaps, deadlines, awake hours) are enforced by the engine; an invalid schedule scores 0.
Score per student week (0-100) = ${WEIGHTS.completion}*completion + completion*(${WEIGHTS.focusFit}*focusFit + ${WEIGHTS.livable}*livable + ${WEIGHTS.breaks}*breaks + ${WEIGHTS.buffer}*buffer).
Quality points are multiplied by completion, so dropping required work never pays. Many weeks are overloaded, so the challenge is fitting the work while keeping days livable.
Think briefly. Your final answer must be ONLY one JSON object, no markdown, no extra text: {"rationale": "<one or two sentences>", "strategy": <strategy>}. Strategy schema:
${SCHEMA}`;

function describe(c: Pick<Candidate, "agent" | "round" | "strategy" | "eval">) {
  const comp = Object.entries(c.eval.components).map(([k, v]) => `${k}=${(v as number).toFixed(3)}`).join(" ");
  return `score=${c.eval.mean.toFixed(2)} [${comp}] by ${c.agent} r${c.round}\nworst: ${c.eval.worst.map((w) => `${w.id}:${w.total} ${w.weakest}`).join("; ")}\n${JSON.stringify(c.strategy)}`;
}

export interface RoundInput {
  round: number;
  elites: Candidate[]; // best strategies so far, best first
  recent: { agent: string; mean: number; rationale: string }[]; // what was tried last round
}

// Limit simultaneous LLM calls: the shared hackathon endpoint returns 503 when overloaded.
const LLM_CONCURRENCY = 2;
const ROUND_BUDGET_MS = 110000; // the round route has maxDuration 120s

export async function runRound({ round, elites, recent }: RoundInput): Promise<Candidate[]> {
  const train = trainSet();
  const best = elites[0];
  const useLlm = llmEnabled();
  const roundDeadline = Date.now() + ROUND_BUDGET_MS;
  let active = 0;
  const queue: (() => void)[] = [];
  const acquire = () => new Promise<void>((res) => (active < LLM_CONCURRENCY ? (active++, res()) : queue.push(() => (active++, res()))));
  const release = () => { active--; queue.shift()?.(); };

  return Promise.all(
    AGENTS.map(async (a, i): Promise<Candidate> => {
      let strategy: Strategy;
      let rationale = "";
      let source: Candidate["source"] = useLlm ? "llm" : "mock";
      let error: string | undefined;
      if (useLlm) {
        try {
          const user = `Round ${round}. Your role: ${a.name}. ${a.brief}

Top strategies so far (best first):
${elites.slice(0, 3).map(describe).join("\n\n")}

Last round's attempts:
${recent.length ? recent.map((r) => `- ${r.agent}: ${r.mean.toFixed(2)} (${r.rationale})`).join("\n") : "- none yet"}

Propose ONE new strategy that you expect to beat ${best.eval.mean.toFixed(2)} on unseen student weeks. Do not copy an existing strategy exactly.`;
          await acquire();
          let res;
          try {
            res = await chat([{ role: "system", content: SYSTEM }, { role: "user", content: user }], {
              temperature: a.id === "explorer" ? 1.0 : 0.6,
              budgetMs: Math.max(8000, roundDeadline - Date.now() - 2000),
            });
          } finally {
            release();
          }
          const { text, diag, attempts } = res;
          const json = extractJson(text, ["strategy", "order", "slot"], diag) as { rationale?: string; strategy?: unknown };
          strategy = sanitize(json.strategy ?? json, best.strategy);
          rationale = String(json.rationale ?? "").slice(0, 300) || "(model returned a strategy without a rationale)";
          if (attempts > 1) rationale += ` [succeeded after ${attempts} attempts]`;
        } catch (e) {
          source = "fallback";
          error = e instanceof Error ? e.message : String(e);
          strategy = mutate(best.strategy, round * 101 + i * 13, a.boldness, a.bias);
          rationale = "LLM call failed; used a local mutation of the current best.";
        }
      } else {
        // Mock agent: start from a random elite to keep diversity, mutate with the agent's bias.
        const parent = elites[(round + i) % Math.min(elites.length, a.id === "refiner" ? 1 : 3)];
        strategy = mutate(parent.strategy, round * 101 + i * 13, a.boldness, a.bias);
        rationale = `Mock agent: mutated ${parent.agent === "baseline" ? "the baseline" : `${parent.agent}'s r${parent.round} strategy`} (boldness ${a.boldness}).`;
      }
      strategy = { ...strategy, name: `${a.name} r${round}` };
      const ev = evaluateStrategy(strategy, train);
      return {
        agent: a.name,
        round,
        strategy,
        rationale,
        source,
        error,
        eval: { mean: ev.mean, feasibleRate: ev.feasibleRate, components: ev.components, worst: ev.worst },
      };
    }),
  );
}
