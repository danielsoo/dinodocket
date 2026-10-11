import { db, dbEnabled } from "@/lib/db";

export async function GET() {
  if (!dbEnabled()) return Response.json({ enabled: false, runs: [] });
  try {
    const runs = await (await db())
      .collection("runs")
      .find({}, { projection: { rounds: 0 } })
      .sort({ savedAt: -1 })
      .limit(10)
      .toArray();
    return Response.json({ enabled: true, runs });
  } catch (e) {
    return Response.json({ enabled: true, runs: [], error: e instanceof Error ? e.message : "db error" }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!dbEnabled()) return Response.json({ enabled: false }, { status: 200 });
  const body = await req.json();
  const doc = {
    savedAt: new Date(),
    mode: String(body?.mode ?? "unknown"),
    model: body?.model ?? null,
    baselineTrain: Number(body?.baselineTrain) || 0,
    bestTrain: Number(body?.bestTrain) || 0,
    test: body?.test ?? null,
    bestStrategy: body?.bestStrategy ?? null,
    rounds: Array.isArray(body?.rounds) ? body.rounds.slice(0, 50) : [],
  };
  try {
    const r = await (await db()).collection("runs").insertOne(doc);
    return Response.json({ enabled: true, id: r.insertedId });
  } catch (e) {
    return Response.json({ enabled: true, error: e instanceof Error ? e.message : "db error" }, { status: 502 });
  }
}
