import { authEnabled, currentUser, users } from "@/lib/session";

export async function GET() {
  if (!authEnabled()) return Response.json({ enabled: false, user: null });
  const s = await currentUser();
  if (!s) return Response.json({ enabled: true, user: null });
  try {
    const u = await (await users()).findOne({ _id: s.uid }, { projection: { pass: 0 } });
    if (!u) return Response.json({ enabled: true, user: null });
    return Response.json({ enabled: true, user: { email: u.email, name: u.name }, answers: u.answers ?? null });
  } catch {
    return Response.json({ enabled: true, user: { email: s.email, name: s.name }, answers: null });
  }
}

/** Save the signed-in user's onboarding answers so personalization follows them across devices. */
export async function PUT(req: Request) {
  const s = await currentUser();
  if (!s) return Response.json({ error: "not signed in" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const raw = body?.answers && typeof body.answers === "object" ? JSON.stringify(body.answers) : null;
  if (raw && raw.length > 4000) return Response.json({ error: "too large" }, { status: 413 });
  const answers = raw ? JSON.parse(raw) : null;
  try {
    await (await users()).updateOne({ _id: s.uid }, { $set: { answers } });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "db error" }, { status: 502 });
  }
}
