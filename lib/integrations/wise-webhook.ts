// Shared Wise webhook processing — everything after the request has
// been authenticated. Both the signature route and the path-secret
// route call this so the settle logic lives in one place.

import { createClient } from "@supabase/supabase-js";
import { matchIncomingTransfer, type PendingTopup } from "./wise-match";

type WiseEvent = {
  event_type?: string;
  data?: Record<string, unknown> & {
    resource?: { id?: string | number; type?: string };
    amount?: number;
    currency?: string;
  };
  [k: string]: unknown;
};

export type WiseProcessResult = {
  status: number;
  body: Record<string, unknown>;
};

export async function processWiseWebhook(
  rawBody: string,
): Promise<WiseProcessResult> {
  let event: WiseEvent;
  try {
    event = JSON.parse(rawBody) as WiseEvent;
  } catch {
    return { status: 400, body: { error: "Malformed body" } };
  }

  // Act only on money-in (deposit/credit) events. Acknowledge the
  // rest with 200 so Wise stops retrying.
  const type = event.event_type ?? "";
  if (!/(credit|deposit)/i.test(type)) {
    return { status: 200, body: { ok: true, ignored: type } };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { status: 500, body: { error: "Server not configured" } };
  }
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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
    return { status: 200, body: { ok: true, note: "insufficient transfer data" } };
  }
  const amountCents = Math.round(amount * 100);

  const { data: pendingRows, error: pendingErr } = await supabase
    .from("wallet_topups")
    .select("id, reference_no, amount, currency, status")
    .eq("status", "pending")
    .eq("currency", currency);
  if (pendingErr) {
    return { status: 500, body: { error: "Query failed" } };
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
    return { status: 500, body: { error: "Settle failed" } };
  }

  return {
    status: 200,
    body: {
      ok: true,
      matched: match.matched,
      via: match.matched ? match.via : undefined,
      reason: match.matched ? undefined : match.reason,
    },
  };
}
