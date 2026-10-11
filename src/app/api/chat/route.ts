import { interpret } from "@/lib/interpret";
import { sanitizeInstance } from "@/lib/plan";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.slice(0, 1000) : "";
  if (!message.trim()) return Response.json({ error: "message required" }, { status: 400 });
  const history = Array.isArray(body?.history)
    ? body.history
        .filter((m: { role?: string; content?: unknown }) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-6)
    : [];
  const result = await interpret(message, sanitizeInstance(body?.instance), history);
  return Response.json(result);
}
