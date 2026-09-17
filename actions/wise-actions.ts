"use server";

import { safeErrorMessage } from "@/lib/pure-error";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveAdminContext, wroteSomething } from "./_shared";
import {
  matchIncomingTransfer,
  type PendingTopup,
} from "@/lib/integrations/wise-match";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Admin confirms a Wise deposit the matcher suggested — completes the
// suggested topup. Used during the safe-start phase where nothing
// auto-completes.
export async function confirmWiseSuggestion(
  transferId: string,
): Promise<ActionResult> {
  // resolveAdminContext, not maintenanceGuard alone. These actions used to
  // go straight to the RPC and lean on its own `role = 'admin'` check — and
  // NO money RPC in the schema tests is_active or status alongside the role.
  // So a deactivated admin kept every power they had, which is precisely the
  // thing deactivating them is meant to remove. This guard checks the role,
  // the tenant AND that the account is still active, and it carries the
  // maintenance freeze with it.
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof transferId !== "string" || !transferId) {
    return { ok: false, error: "Invalid input" };
  }
  const { supabase } = auth.ctx;
  const { error } = await supabase.rpc("wise_confirm_suggestion", {
    p_transfer_id: transferId,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}

/**
 * Match a deposit to a top-up BY HAND, when the matcher could not.
 *
 * It genuinely cannot in ordinary cases: a customer who forgot the reference,
 * a bank that stripped it, two top-ups for the same amount. Leaving those to
 * be sorted out in the database is how a queue silently stops being worked.
 *
 * There is no new RPC. A manual match writes the pairing onto the transfer
 * and then goes through wise_confirm_suggestion, the same path a suggested
 * match takes — so crediting, the ledger write and whatever else that
 * function does stay in one place rather than being reimplemented here.
 *
 * THE AMOUNTS MUST AGREE. Confirming credits the TOP-UP's amount, not the
 * deposit's, so pairing a EUR 500 deposit with a EUR 1000 top-up would credit
 * a thousand euros for five hundred received. A cent of tolerance, matching
 * the automatic matcher; anything wider is a decision someone has to make
 * deliberately, with an adjustment, not by picking from a list.
 */
export async function matchWiseToTopup(
  transferId: string,
  topupId: string,
): Promise<ActionResult> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof transferId !== "string" || !transferId) {
    return { ok: false, error: "Invalid input" };
  }
  if (typeof topupId !== "string" || !topupId) {
    return { ok: false, error: "Pick a top-up to match." };
  }
  const { supabase, profile } = auth.ctx;

  const { data: transfer, error: tErr } = await supabase
    .from("wise_incoming_transfers")
    .select("id, amount_cents, currency, status, tenant_id")
    .eq("id", transferId)
    .maybeSingle();
  if (tErr) return { ok: false, error: safeErrorMessage(tErr) };
  if (!transfer) return { ok: false, error: "Deposit not found" };
  // A deposit is either unassigned (tenant_id null — the matcher could not
  // tell whose it was) or already ours. Anything else belongs to another
  // tenant, and the write below runs with the service role, so this check is
  // the only thing standing in its way — RLS will not catch it for us.
  if (
    transfer.tenant_id !== null &&
    transfer.tenant_id !== profile.tenant_id
  ) {
    return { ok: false, error: "Forbidden" };
  }
  if (transfer.status === "completed" || transfer.status === "confirmed") {
    return { ok: false, error: "That deposit has already been credited." };
  }

  const { data: topup, error: uErr } = await supabase
    .from("wallet_topups")
    .select("id, amount, currency, status, tenant_id")
    .eq("id", topupId)
    .maybeSingle();
  if (uErr) return { ok: false, error: safeErrorMessage(uErr) };
  if (!topup) return { ok: false, error: "Top-up not found" };
  if (topup.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  if ((topup.status ?? "pending") !== "pending") {
    return { ok: false, error: "That top-up is no longer pending." };
  }

  const depCur = String(transfer.currency ?? "").toUpperCase();
  const topCur = String(topup.currency ?? "").toUpperCase();
  if (depCur !== topCur) {
    return {
      ok: false,
      error: `The deposit is in ${depCur} and the top-up is in ${topCur}. Credit that by hand instead.`,
    };
  }
  const depCents = Math.round(Number(transfer.amount_cents ?? 0));
  const topCents = Math.round(Number(topup.amount ?? 0) * 100);
  if (Math.abs(depCents - topCents) > 1) {
    return {
      ok: false,
      error: `The amounts differ — the deposit is ${(depCents / 100).toFixed(2)} and the top-up is ${(topCents / 100).toFixed(2)}. Confirming credits the top-up's amount, so this needs an adjustment rather than a match.`,
    };
  }

  // The service-role client, deliberately. wise_incoming_transfers carries a
  // SELECT policy and nothing else — its migration says so outright: "No
  // client writes — only the service-role webhook path writes". So this
  // UPDATE matched zero rows under the caller's client and the whole feature
  // was dead on arrival; it failed loudly rather than silently, thanks to the
  // row check below, but it never worked.
  //
  // Every authorisation this needs has already been done above, by hand,
  // because RLS is not doing it here: the caller is an active admin of this
  // tenant, the top-up is theirs and pending, the deposit is theirs or
  // unassigned, and the amounts agree to the cent. The write itself is one
  // column on one row, and wise_confirm_suggestion re-checks the caller
  // before it moves any money.
  const admin = await createAdminClient();
  const { data: linked, error: linkErr } = await admin
    .from("wise_incoming_transfers")
    .update({ suggested_topup_id: topupId, status: "suggested" })
    .eq("id", transferId)
    .select("id");
  if (linkErr) return { ok: false, error: safeErrorMessage(linkErr) };
  const wrote = wroteSomething(linked);
  if (!wrote.ok) return wrote;

  const { error } = await supabase.rpc("wise_confirm_suggestion", {
    p_transfer_id: transferId,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}

/**
 * Look at the unmatched deposits again, now that the pending top-ups have
 * changed.
 *
 * WHY THIS HAS TO EXIST. The webhook matches a deposit ONCE, at the moment
 * it arrives, against the top-ups that are pending right then. That is the
 * wrong moment more often than it sounds:
 *
 *   - the customer transferred the money BEFORE filing their claim (which
 *     is what people do — they pay first and tell you after), so at arrival
 *     there was nothing to match and the deposit was filed "no pending
 *     topup with matching amount" for ever;
 *   - the claim was refused on submit and re-sent minutes later;
 *   - two same-amount claims were open at arrival and one has since been
 *     verified, so what was ambiguous is now unambiguous.
 *
 * Nothing re-read those deposits, so the queue kept a permanent snapshot of
 * a question nobody asked again.
 *
 * This re-asks it. It SUGGESTS and never credits: the same safe-start rule
 * the webhook obeys, so the money still only moves when an admin presses
 * Confirm. It is therefore safe to run on every visit to the panel.
 *
 * It uses the same pure matcher as the webhook, so a deposit cannot be
 * matched here by a rule the automatic path would have refused.
 */
export async function rematchWiseDeposits(): Promise<
  ActionResult<{ checked: number; suggested: number }>
> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  // Only deposits that are still an open question. 'matched' and
  // 'suggested' already point at a top-up; 'confirmed' and 'completed' have
  // moved money and must never be touched again.
  const { data: deposits, error: dErr } = await supabase
    .from("wise_incoming_transfers")
    .select(
      "id, amount_cents, currency, reference, sender_iban, status, tenant_id, created_at",
    )
    .in("status", ["unmatched", "ambiguous", "received"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (dErr) return { ok: false, error: safeErrorMessage(dErr) };
  if (!deposits || deposits.length === 0) {
    return { ok: true, data: { checked: 0, suggested: 0 } };
  }

  const { data: pending, error: pErr } = await supabase
    .from("wallet_topups")
    .select("id, reference_no, amount, currency, status, advertiser_id")
    .eq("status", "pending")
    .eq("tenant_id", profile.tenant_id);
  if (pErr) return { ok: false, error: safeErrorMessage(pErr) };
  if (!pending || pending.length === 0) {
    return { ok: true, data: { checked: deposits.length, suggested: 0 } };
  }

  // Sender IBAN → advertiser ids, the same signal the webhook uses.
  const ibans = Array.from(
    new Set(
      deposits
        .map((d) => (d as { sender_iban?: string | null }).sender_iban)
        .filter((v): v is string => !!v)
        .map((v) => v.replace(/\s/g, "").toUpperCase()),
    ),
  );
  const advertisersByIban = new Map<string, string[]>();
  if (ibans.length > 0) {
    const { data: senderRows } = await supabase
      .from("advertiser_bank_senders")
      .select("advertiser_id, sender_iban")
      .in("sender_iban", ibans);
    for (const row of senderRows ?? []) {
      const r = row as { advertiser_id: string; sender_iban: string };
      const key = r.sender_iban.replace(/\s/g, "").toUpperCase();
      const list = advertisersByIban.get(key) ?? [];
      list.push(r.advertiser_id);
      advertisersByIban.set(key, list);
    }
  }

  // The service-role client, for the same reason matchWiseToTopup uses it:
  // wise_incoming_transfers carries a SELECT policy and nothing else, so a
  // write under the caller's client matches zero rows. Every check that
  // would normally be RLS's job is done here by hand — admin of this
  // tenant, the top-up is theirs and pending, the deposit is theirs or
  // unassigned, amounts equal to the cent (inside the matcher).
  const admin = await createAdminClient();

  // One top-up cannot settle two deposits. Without this, three €5 deposits
  // and one €5 claim would all be pointed at the same claim and an admin
  // would be offered the same money three times.
  const claimed = new Set<string>();
  let suggested = 0;

  for (const row of deposits) {
    const d = row as {
      id: string;
      amount_cents: number;
      currency: string;
      reference: string | null;
      sender_iban: string | null;
      tenant_id: string | null;
    };
    if (d.tenant_id !== null && d.tenant_id !== profile.tenant_id) continue;

    const iban = d.sender_iban
      ? d.sender_iban.replace(/\s/g, "").toUpperCase()
      : null;
    const candidates = (pending as PendingTopup[]).filter(
      (t) => !claimed.has(t.id),
    );
    if (candidates.length === 0) break;

    const match = matchIncomingTransfer(
      {
        amount_cents: Math.round(Number(d.amount_cents ?? 0)),
        currency: String(d.currency ?? ""),
        reference: d.reference,
        sender_iban: iban,
      },
      candidates,
      iban ? (advertisersByIban.get(iban) ?? []) : [],
    );
    if (!match.matched) continue;

    const { data: linked, error: linkErr } = await admin
      .from("wise_incoming_transfers")
      .update({
        suggested_topup_id: match.topupId,
        status: "suggested",
        note: `re-checked: matched via ${match.via}`,
      })
      .eq("id", d.id)
      .select("id");
    if (linkErr) return { ok: false, error: safeErrorMessage(linkErr) };
    if (!wroteSomething(linked).ok) continue;

    claimed.add(match.topupId);
    suggested += 1;
  }

  return { ok: true, data: { checked: deposits.length, suggested } };
}
