import { db, dbEnabled } from "@/lib/db";
import { sanitizeInstance } from "@/lib/plan";
import { currentUser } from "@/lib/session";

/** Signed-in users get one plan per account; everyone else uses an anonymous per-browser id. */
async function planKey(id: string) {
  const u = await currentUser();
  if (u) return { key: `user:${u.uid}`, owner: u.uid };
  return ID.test(id) ? { key: id, owner: null } : null;
}

// Anonymous plan sync: each browser gets a random plan id (no login). Anyone with the id can open the plan,
// which is what powers the "open on another device" link.
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type PlanDoc = { _id: string; instance?: unknown; approved?: unknown; updatedAt?: Date; createdAt?: Date };
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);

function sanitizeSchedule(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const sessions = (Array.isArray(r.sessions) ? r.sessions : []).slice(0, 400).map((s: Record<string, unknown>) => ({
    taskId: String(s?.taskId ?? "").slice(0, 40),
    day: num(s?.day),
    start: num(s?.start),
    end: num(s?.end),
  }));
  const unscheduled = (Array.isArray(r.unscheduled) ? r.unscheduled : []).slice(0, 100).map((u: Record<string, unknown>) => ({
    taskId: String(u?.taskId ?? "").slice(0, 40),
    missing: num(u?.missing),
    reason: String(u?.reason ?? "").slice(0, 400),
  }));
  return { sessions, unscheduled };
}

export async function GET(req: Request) {
  if (!dbEnabled()) return Response.json({ enabled: false });
  const k = await planKey(new URL(req.url).searchParams.get("id") ?? "");
  if (!k) return Response.json({ error: "bad id" }, { status: 400 });
  try {
    const doc = await (await db()).collection<PlanDoc>("plans").findOne({ _id: k.key });
    return Response.json({ enabled: true, account: !!k.owner, owner: k.owner, plan: doc ? { instance: doc.instance, approved: doc.approved, updatedAt: doc.updatedAt } : null });
  } catch (e) {
    return Response.json({ enabled: true, error: e instanceof Error ? e.message : "db error" }, { status: 502 });
  }
}

export async function PUT(req: Request) {
  if (!dbEnabled()) return Response.json({ enabled: false });
  const body = await req.json().catch(() => null);
  const k = await planKey(String(body?.id ?? ""));
  if (!k) return Response.json({ error: "bad id" }, { status: 400 });
  // The tab must still belong to the account that is signed in now. If someone signed into a different
  // account in another tab, this tab's (old) calendar must never overwrite the new account's plan.
  if ((body?.owner ?? null) !== k.owner) return Response.json({ error: "owner_changed" }, { status: 409 });
  const id = k.key;
  try {
    const now = new Date();
    await (await db())
      .collection<PlanDoc>("plans")
      .updateOne(
        { _id: id },
        { $set: { instance: sanitizeInstance(body?.instance), approved: sanitizeSchedule(body?.approved), updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true },
      );
    return Response.json({ enabled: true, ok: true, updatedAt: now });
  } catch (e) {
    return Response.json({ enabled: true, error: e instanceof Error ? e.message : "db error" }, { status: 502 });
  }
}
