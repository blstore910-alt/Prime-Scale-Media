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
  const d = data as Record<string, unknown>;
  const amount = Number(data.amount ?? d.value);
  const currency = String(data.currency ?? "").toUpperCase();

  // Wise webhook v2 "balances#credit" gives the BALANCE change, not a
  // per-transaction id — data.resource.id is the balance account
  // (same for every deposit into it), so it can't be the idempotency
  // key on its own. `occurred_at` is unique per credit event, so build
  // a composite external_id from (balance id : occurred_at : amount).
  // A Wise redelivery repeats the same occurred_at → same key → deduped;
  // two real deposits differ → two keys.
  const occurredAt = String(d.occurred_at ?? d.occurredAt ?? d.sent_at ?? "");
  const balanceId = String(data.resource?.id ?? "");
  const explicitTxnId = String(d.transfer_id ?? d.transaction_id ?? "");
  const externalId =
    explicitTxnId ||
    (balanceId && occurredAt
      ? `${balanceId}:${occurredAt}:${amount}`
      : occurredAt
        ? `${occurredAt}:${amount}`
        : "");

  // The sender's payment reference. v2 sometimes carries it as
  // transfer_reference; read every shape we've seen. When absent the
  // matcher falls back to amount+currency.
  const reference =
    (d.reference != null ? String(d.reference) : null) ??
    (d.transfer_reference != null ? String(d.transfer_reference) : null) ??
    (d.details as { reference?: string } | undefined)?.reference ??
    null;

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
