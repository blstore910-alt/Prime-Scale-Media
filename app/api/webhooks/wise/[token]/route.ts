import { NextRequest, NextResponse } from "next/server";
import { processWiseWebhook } from "@/lib/integrations/wise-webhook";

// Path-secret variant of the Wise webhook.
//
// Wise refuses query parameters on the delivery URL, so the shared
// secret lives in the PATH instead:
//   /api/webhooks/wise/<WISE_WEBHOOK_SECRET>
// The token segment must equal WISE_WEBHOOK_SECRET. Everything else
// (parse → match → idempotent settle) is the shared processor.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tokenOk(token: string): boolean {
  const secret = process.env.WISE_WEBHOOK_SECRET;
  return !!secret && token === secret;
}

// Reachability probe → 200 when the token is valid, 404 otherwise so
// the path isn't a discovery oracle.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!tokenOk(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, endpoint: "wise-webhook" });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!tokenOk(token)) {
    return NextResponse.json({ error: "Unverified webhook" }, { status: 401 });
  }
  const rawBody = await req.text();
  const result = await processWiseWebhook(rawBody);
  return NextResponse.json(result.body, { status: result.status });
}
