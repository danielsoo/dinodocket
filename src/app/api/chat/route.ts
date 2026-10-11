import { interpret } from "@/lib/interpret";
import { sanitizeInstance } from "@/lib/plan";
import { sanitizePersona } from "@/lib/persona";

export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.slice(0, 1000) : "";
  if (!message.trim()) return Response.json({ error: "message required" }, { status: 400 });
  const history = Array.isArray(body?.history)
    ? body.history
        .filter((m: { role?: string; content?: unknown }) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-6)
    : [];
  const n = (x: unknown, lo: number, hi: number) => (typeof x === "number" && x >= lo && x <= hi ? x : null);
  const sessions = (Array.isArray(body?.sessions) ? body.sessions : [])
    .slice(0, 200)
    .map((s: Record<string, unknown>) => ({ taskId: String(s?.taskId ?? ""), day: n(s?.day, 0, 6), start: n(s?.start, 0, 1440), end: n(s?.end, 0, 1440) }))
    .filter((s: { day: number | null; start: number | null; end: number | null }) => s.day !== null && s.start !== null && s.end !== null && s.end > s.start);
  const result = await interpret(message, sanitizeInstance(body?.instance), history, sanitizePersona(body?.persona), sessions);
  return Response.json(result);
}
