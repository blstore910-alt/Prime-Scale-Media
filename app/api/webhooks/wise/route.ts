import { NextRequest, NextResponse } from "next/server";
import { createVerify } from "node:crypto";
import { processWiseWebhook } from "@/lib/integrations/wise-webhook";

// Wise incoming-payment webhook — signature-verified variant.
//
// Wise POSTs a deposit/credit event when money lands. This route
// verifies the RSA signature against Wise's public key (WISE_PUBLIC_KEY)
// and hands off to the shared processor, which matches the transfer to
// a pending wallet top-up and completes it idempotently.
//
// Wise refuses query parameters on the delivery URL, so the simpler
// shared-secret path lives at /api/webhooks/wise/<secret> instead —
// see the [token] route. Use whichever you configured.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "wise-webhook" });
}

function verifyWiseSignature(rawBody: string, signature: string): boolean {
  const publicKey = process.env.WISE_PUBLIC_KEY;
  if (!publicKey || !signature) return false;
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(rawBody);
    verifier.end();
    return verifier.verify(publicKey, signature, "base64");
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature =
    req.headers.get("x-signature-sha256") ??
    req.headers.get("x-signature") ??
    "";

  if (!verifyWiseSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Unverified webhook" }, { status: 401 });
  }

  const result = await processWiseWebhook(rawBody);
  return NextResponse.json(result.body, { status: result.status });
}
