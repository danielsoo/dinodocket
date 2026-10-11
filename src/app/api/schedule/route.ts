import { plan } from "@/lib/plan";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const result = plan(body?.instance, body?.strategy, body?.keep);
  return Response.json(result, { status: result.ok ? 200 : 422 });
}
