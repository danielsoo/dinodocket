import { randomUUID } from "node:crypto";
import { EMAIL, authEnabled, hashPassword, setSession, users } from "@/lib/session";

export async function POST(req: Request) {
  if (!authEnabled()) return Response.json({ enabled: false });
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase().slice(0, 120);
  const password = String(body?.password ?? "");
  const name = String(body?.name ?? "").trim().slice(0, 60) || email.split("@")[0];
  if (!EMAIL.test(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "Use a password with at least 8 characters." }, { status: 400 });
  if (password.length > 200) return Response.json({ error: "That password is too long." }, { status: 400 });
  try {
    const col = await users();
    const uid = randomUUID();
    await col.insertOne({ _id: uid, email, name, pass: await hashPassword(password), createdAt: new Date() });
    await setSession({ uid, email, name });
    return Response.json({ enabled: true, user: { email, name } });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: number }).code === 11000)
      return Response.json({ error: "An account with this email already exists. Try logging in." }, { status: 409 });
    return Response.json({ error: "Couldn't create the account right now. Please try again." }, { status: 502 });
  }
}
