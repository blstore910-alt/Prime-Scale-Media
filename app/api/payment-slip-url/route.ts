import { NextResponse } from "next/server";
import { getSignedPaymentSlipUrl } from "@/actions/payment-slip-actions";

// ── THE SLIP PREVIEW, OUTSIDE THE SERVER-ACTION QUEUE ────────────────
//
// Test 4, 02-10: the slip in the admin's Verify confirmation took about
// twenty seconds to appear. Server actions from one page run one at a
// time, and the queue page has several reads in flight, so the signing
// call waited its turn. This route is a plain fetch: same function,
// same checks (signed-in, active account, tenant, path shape -- see
// actions/payment-slip-actions.ts), no queue.
//
// POST with the path in the body, not in the URL: a stored path can
// carry a file name, and file names do not belong in access logs.
export async function POST(req: Request) {
  let path = "";
  try {
    const body = (await req.json()) as { path?: unknown };
    path = typeof body?.path === "string" ? body.path : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  const res = await getSignedPaymentSlipUrl(path);
  return NextResponse.json(res, { status: res.ok ? 200 : 403 });
}
