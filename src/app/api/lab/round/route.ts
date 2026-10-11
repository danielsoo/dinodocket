import { runRound, type RoundInput } from "@/lib/agents";
import { sanitizePersona } from "@/lib/persona";

export const maxDuration = 120;

export async function POST(req: Request) {
  const body = (await req.json()) as RoundInput;
  if (!Array.isArray(body?.elites) || body.elites.length === 0) {
    return Response.json({ error: "elites required" }, { status: 400 });
  }
  const candidates = await runRound({
    round: Number(body.round) || 1,
    elites: body.elites.slice(0, 5),
    recent: Array.isArray(body.recent) ? body.recent.slice(0, 8) : [],
    agent: typeof body.agent === "number" ? body.agent : undefined,
    persona: sanitizePersona((body as { persona?: unknown }).persona),
  });
  return Response.json({ candidates });
}
