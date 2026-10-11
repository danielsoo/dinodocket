import { db, dbEnabled } from "@/lib/db";

export async function GET() {
  if (!dbEnabled()) return Response.json({ enabled: false, runs: [] });
  const runs = await (await db())
    .collection("runs")
    .find({}, { projection: { rounds: 0 } })
    .sort({ savedAt: -1 })
    .limit(10)
    .toArray();
  return Response.json({ enabled: true, runs });
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
  const r = await (await db()).collection("runs").insertOne(doc);
  return Response.json({ enabled: true, id: r.insertedId });
}
