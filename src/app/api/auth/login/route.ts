import { authEnabled, setSession, users, verifyPassword } from "@/lib/session";

export async function POST(req: Request) {
  if (!authEnabled()) return Response.json({ enabled: false });
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase().slice(0, 120);
  const password = String(body?.password ?? "").slice(0, 200);
  try {
    const u = await (await users()).findOne({ email });
    // Same message for unknown email and wrong password, so accounts can't be probed.
    if (!u || !(await verifyPassword(password, u.pass))) return Response.json({ error: "Wrong email or password." }, { status: 401 });
    await setSession({ uid: u._id, email: u.email, name: u.name });
    return Response.json({ enabled: true, user: { email: u.email, name: u.name }, answers: u.answers ?? null });
  } catch {
    return Response.json({ error: "Couldn't log in right now. Please try again." }, { status: 502 });
  }
}
