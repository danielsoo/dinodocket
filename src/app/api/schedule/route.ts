import { plan } from "@/lib/plan";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const result = plan(body?.instance, body?.strategy);
  return Response.json(result, { status: result.ok ? 200 : 422 });
}
