import { evaluateStrategy } from "@/lib/engine/evaluate";
import { generateInstance, TEST_SEEDS } from "@/lib/engine/generator";
import { sanitize } from "@/lib/engine/strategy";

// Held-out student weeks: never shown to the agents during optimization.
const test = TEST_SEEDS.map(generateInstance);

export async function POST(req: Request) {
  const body = await req.json();
  const list: unknown[] = Array.isArray(body?.strategies) ? body.strategies.slice(0, 4) : [];
  const results = list.map((raw) => {
    const st = sanitize(raw);
    const ev = evaluateStrategy(st, test);
    return { name: st.name, mean: ev.mean, feasibleRate: ev.feasibleRate, components: ev.components, perInstance: ev.perInstance };
  });
  return Response.json({ testSize: test.length, results });
}
