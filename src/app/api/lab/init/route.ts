import { evaluateStrategy } from "@/lib/engine/evaluate";
import { BASELINE } from "@/lib/engine/strategy";
import { trainSet, type Candidate } from "@/lib/agents";
import { llmConfig, llmEnabled } from "@/lib/llm";
import { dbEnabled } from "@/lib/db";

export async function POST() {
  const ev = evaluateStrategy(BASELINE, trainSet());
  const baseline: Candidate = {
    agent: "baseline", round: 0, strategy: BASELINE, source: "mock",
    rationale: "Earliest-deadline-first greedy: first free slot, 1h chunks, no daily limit or breaks.",
    eval: { mean: ev.mean, feasibleRate: ev.feasibleRate, components: ev.components, worst: ev.worst },
  };
  return Response.json({
    baseline,
    mode: llmEnabled() ? "llm" : "mock",
    model: llmEnabled() ? llmConfig().model : null,
    trainSize: trainSet().length,
    db: dbEnabled(),
  });
}
