import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createVerify } from "node:crypto";
import {
  matchIncomingTransfer,
  type PendingTopup,
} from "@/lib/integrations/wise-match";

// Wise incoming-payment webhook.
//
// Wise POSTs a `balances#credit` event when money lands in the
// connected account. We verify it's genuinely from Wise, pull the
// incoming transfer's amount / currency / reference, match it to a
// pending wallet top-up, and complete that top-up — which credits the
// wallet and accrues any referral commission via the existing
// triggers.
//
// Safety:
//   - Signature verified against Wise's public key (env WISE_PUBLIC_KEY).
//   - Every transfer is recorded once (external_id UNIQUE) and a topup
//     completes at most once (UPDATE ... WHERE status='pending'), both
//     inside the wise_record_and_settle RPC.
//   - Ambiguous / unmatched transfers are recorded for admin review,
//     never auto-completed by guessing.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyWiseSignature(rawBody: string, signature: string): boolean {
  const publicKey = process.env.WISE_PUBLIC_KEY;
  if (!publicKey) {
    // No key configured — refuse rather than trust an unsigned event.
    return false;
  }
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(rawBody);
    verifier.end();
    return verifier.verify(publicKey, signature, "base64");
  } catch {
    return false;
  }
}

type WiseEvent = {
  event_type?: string;
  data?: {
    resource?: { id?: string | number; type?: string };
    amount?: number;
    currency?: string;
    // Some events carry the occurred transfer id / reference; shapes
    // vary by Wise product version, so read defensively below.
    [k: string]: unknown;
  };
  [k: string]: unknown;
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Wise sends the signature in this header (base64 RSA-SHA256).
  const signature =
    req.headers.get("x-signature-sha256") ??
    req.headers.get("x-signature") ??
    "";
  if (!signature || !verifyWiseSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: WiseEvent;
  try {
    event = JSON.parse(rawBody) as WiseEvent;
  } catch {
    return NextResponse.json({ error: "Malformed body" }, { status: 400 });
  }

  // We only act on balance credits (money in). Acknowledge everything
  // else with 200 so Wise stops retrying.
  const type = event.event_type ?? "";
  if (!/credit/i.test(type)) {
    return NextResponse.json({ ok: true, ignored: type }, { status: 200 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 500 },
    );
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Pull the incoming transfer's essentials. Wise's balances#credit
  // payload gives amount + currency directly; the reference and a
  // stable transfer id live under data.resource / data. Read
  // defensively across shapes.
  const data = event.data ?? {};
  const amount = Number(data.amount ?? (data as Record<string, unknown>).value);
  const currency = String(data.currency ?? "").toUpperCase();
  const externalId = String(
    data.resource?.id ??
      (data as Record<string, unknown>).transfer_id ??
      (data as Record<string, unknown>).transaction_id ??
      "",
  );
  const reference =
    (data as Record<string, unknown>).reference != null
      ? String((data as Record<string, unknown>).reference)
      : ((data as Record<string, unknown>).details as
          | { reference?: string }
          | undefined)?.reference ?? null;

  if (!externalId || !Number.isFinite(amount) || amount <= 0 || !currency) {
    // Can't act, but acknowledge so Wise doesn't hammer us.
    return NextResponse.json(
      { ok: true, note: "insufficient transfer data" },
      { status: 200 },
    );
  }
  const amountCents = Math.round(amount * 100);

  // Candidate pending topups in the matching currency.
  const { data: pendingRows, error: pendingErr } = await supabase
    .from("wallet_topups")
    .select("id, reference_no, amount, currency, status")
    .eq("status", "pending")
    .eq("currency", currency);
  if (pendingErr) {
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const match = matchIncomingTransfer(
    { amount_cents: amountCents, currency, reference },
    (pendingRows ?? []) as PendingTopup[],
  );

  const { error: settleErr } = await supabase.rpc("wise_record_and_settle", {
    p_external_id: externalId,
    p_amount_cents: amountCents,
    p_currency: currency,
    p_reference: reference,
    p_topup_id: match.matched ? match.topupId : null,
    p_note: match.matched ? `auto-matched via ${match.via}` : match.reason,
  });
  if (settleErr) {
    return NextResponse.json({ error: "Settle failed" }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      matched: match.matched,
      via: match.matched ? match.via : undefined,
      reason: match.matched ? undefined : match.reason,
    },
    { status: 200 },
  );
}
