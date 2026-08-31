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

  // Sender bank details, when the payload carries them (v2 balances#
  // credit often doesn't — fetching from the Wise statement API is a
  // follow-up). Normalised for the known-sender lookup.
  const rawIban =
    (d.sender_iban != null ? String(d.sender_iban) : null) ??
    ((d.sender_account as { iban?: string } | undefined)?.iban ?? null);
  const senderIban = rawIban
    ? rawIban.replace(/\s/g, "").toUpperCase()
    : null;
  const senderName =
    d.sender_name != null ? String(d.sender_name) : null;

  const { data: pendingRows, error: pendingErr } = await supabase
    .from("wallet_topups")
    .select("id, reference_no, amount, currency, status, advertiser_id")
    .eq("status", "pending")
    .eq("currency", currency);
  if (pendingErr) {
    return { status: 500, body: { error: "Query failed" } };
  }

  // Which advertisers does this sender IBAN belong to? (Could be
  // several — one customer, multiple accounts, same bank.)
  let knownAdvertiserIds: string[] = [];
  if (senderIban) {
    const { data: senderRows } = await supabase
      .from("advertiser_bank_senders")
      .select("advertiser_id")
      .eq("sender_iban", senderIban);
    knownAdvertiserIds = (senderRows ?? []).map(
      (r: { advertiser_id: string }) => r.advertiser_id,
    );
  }

  const match = matchIncomingTransfer(
    { amount_cents: amountCents, currency, reference, sender_iban: senderIban },
    (pendingRows ?? []) as PendingTopup[],
    knownAdvertiserIds,
  );

  // Safe start: nothing auto-completes. A confident match is stored
  // as a SUGGESTION for an admin to confirm. Flip WISE_AUTO_SETTLE=true
  // once matching is proven and matches will complete on their own.
  const autoSettle = /^(true|1|yes|on)$/i.test(
    process.env.WISE_AUTO_SETTLE ?? "",
  );

  const { data: settleData, error: settleErr } = await supabase.rpc(
    "wise_record_and_settle",
    {
      p_external_id: externalId,
      p_amount_cents: amountCents,
      p_currency: currency,
      p_reference: reference,
      p_topup_id: match.matched ? match.topupId : null,
      p_note: match.matched ? `matched via ${match.via}` : match.reason,
      p_auto_settle: autoSettle,
    },
  );
  if (settleErr) {
    return { status: 500, body: { error: "Settle failed" } };
  }

  // Learn the sender → advertiser link on a CONFIDENT match (reference
  // is the only signal that proves the account), so future no-reference
  // payments from this bank auto-match. Never learn from a sender-only
  // or amount-only match (would reinforce a guess).
  if (
    match.matched &&
    match.via === "reference" &&
    senderIban &&
    settleData
  ) {
    const settled = Array.isArray(settleData) ? settleData[0] : settleData;
    const topup = (pendingRows ?? []).find(
      (t: { id: string }) => t.id === match.topupId,
    ) as { advertiser_id?: string } | undefined;
    const tenantId = (settled as { tenant_id?: string } | undefined)?.tenant_id;
    if (topup?.advertiser_id && tenantId) {
      await supabase.rpc("wise_remember_sender", {
        p_tenant_id: tenantId,
        p_advertiser_id: topup.advertiser_id,
        p_sender_iban: senderIban,
        p_sender_name: senderName,
      });
    }
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
