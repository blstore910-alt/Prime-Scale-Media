"use server";

import { safeErrorMessage } from "@/lib/pure-error";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveAdminContext, wroteSomething } from "./_shared";
import {
  matchIncomingTransfer,
  type PendingTopup,
} from "@/lib/integrations/wise-match";
import {
  fetchWiseProfileIds,
  fetchWiseTxnDetail,
  parseExternalId,
  probeWiseStatement,
} from "@/lib/integrations/wise-api";

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

  // The same reference, amount and day must never be credited twice — see
  // alreadyCredited below.
  const { data: dep } = await supabase
    .from("wise_incoming_transfers")
    .select("id, reference, amount_cents, created_at")
    .eq("id", transferId)
    .maybeSingle();
  if (dep) {
    const admin = await createAdminClient();
    const twin = await alreadyCredited(
      admin,
      dep as {
        id: string;
        reference: string | null;
        amount_cents: number;
        created_at: string;
      },
    );
    if (twin) {
      return {
        ok: false,
        error:
          "A deposit with the same reference and amount was already credited on that day. If this is genuinely a second payment, it needs its own reference — credit it by hand after checking the bank.",
      };
    }
  }

  const { error } = await supabase.rpc("wise_confirm_suggestion", {
    p_transfer_id: transferId,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}

/**
 * Has this exact payment already been credited?
 *
 * The owner's rule: the same reference, amount and date must never be
 * credited twice — while ten payments from one person on one day, each
 * with its own reference, all have to land.
 *
 * Three things already stand in the way of a double credit, and each of
 * them has a gap this closes:
 *
 *   1. wise_incoming_transfers.external_id is unique, so a Wise
 *      REDELIVERY of the same credit is deduped at ingest. But the
 *      composite key is balance:second:amount, so two genuinely separate
 *      payments of the same amount in the same second would collide — and
 *      dropping a real payment is as bad as crediting one twice.
 *   2. A top-up can only be completed while it is 'pending', so one CLAIM
 *      cannot be settled twice.
 *   3. The in-pass `claimed` set stops one sweep offering one claim to two
 *      deposits.
 *
 * None of those stops an admin confirming two DIFFERENT deposit rows that
 * represent the same payment — a redelivery that slipped through with a
 * different key, or the same transfer imported twice. So before money
 * moves: is there another deposit, already credited, with the same
 * reference, the same amount, and the same calendar day? If so, say which
 * one and refuse.
 */
async function alreadyCredited(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  dep: {
    id: string;
    reference: string | null;
    amount_cents: number;
    created_at: string;
  },
): Promise<{ id: string; created_at: string } | null> {
  // With no reference there is nothing to compare — amount and date alone
  // are exactly the coincidence we refuse to treat as identity elsewhere.
  const ref = (dep.reference ?? "").trim();
  if (!ref) return null;

  const day = dep.created_at.slice(0, 10);
  const { data } = await supabase
    .from("wise_incoming_transfers")
    .select("id, created_at, reference, amount_cents, status")
    .eq("reference", ref)
    .eq("amount_cents", dep.amount_cents)
    .in("status", ["confirmed", "completed", "matched"])
    .neq("id", dep.id)
    .gte("created_at", `${day}T00:00:00Z`)
    .lte("created_at", `${day}T23:59:59.999Z`)
    .limit(1);
  const hit = (data ?? [])[0] as
    | { id: string; created_at: string }
    | undefined;
  return hit ?? null;
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

  // Same rule on the manual path: an admin picking by hand is exactly who
  // would pair the same payment twice.
  const { data: depRow } = await supabase
    .from("wise_incoming_transfers")
    .select("id, reference, amount_cents, created_at")
    .eq("id", transferId)
    .maybeSingle();
  if (depRow) {
    const twin = await alreadyCredited(
      admin,
      depRow as {
        id: string;
        reference: string | null;
        amount_cents: number;
        created_at: string;
      },
    );
    if (twin) {
      return {
        ok: false,
        error:
          "A deposit with the same reference and amount was already credited on that day. A second real payment needs its own reference — check the bank before crediting this one.",
      };
    }
  }

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
  ActionResult<{ checked: number; suggested: number; withdrawn: number }>
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
      "id, external_id, amount_cents, currency, reference, sender_iban, status, tenant_id, created_at",
    )
    .in("status", ["unmatched", "ambiguous", "received"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (dErr) return { ok: false, error: safeErrorMessage(dErr) };
  if (!deposits || deposits.length === 0) {
    return { ok: true, data: { checked: 0, suggested: 0, withdrawn: 0 } };
  }

  const { data: pending, error: pErr } = await supabase
    .from("wallet_topups")
    .select(
      "id, reference_no, amount, currency, status, advertiser_id, created_at",
    )
    .eq("status", "pending")
    .eq("tenant_id", profile.tenant_id);
  if (pErr) return { ok: false, error: safeErrorMessage(pErr) };
  if (!pending || pending.length === 0) {
    return { ok: true, data: { checked: deposits.length, suggested: 0, withdrawn: 0 } };
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


  // ── Withdraw the suggestions the old rule made ─────────────────────
  // Until today a deposit was matched when exactly one pending top-up
  // happened to fit the amount, and that is not evidence of whose money it
  // is — a hundred customers can wire the same figure. Those suggestions
  // are still on the table with "matched via amount" on them, and a
  // Confirm button beside them, which is precisely the click that would
  // credit the wrong wallet.
  //
  // So they are put back to unmatched, with a note that says why. Scoped to
  // status 'suggested' — a deposit that has already been confirmed or
  // completed has MOVED MONEY and is never touched again — and only where
  // the note itself says the match came from the amount.
  const { data: withdrawn } = await admin
    .from("wise_incoming_transfers")
    .update({
      status: "unmatched",
      suggested_topup_id: null,
      note: "amount-only match withdrawn — an amount is not proof of whose money it is; match it by hand or wait for a reference",
    })
    .eq("status", "suggested")
    .ilike("note", "%via amount%")
    .select("id");
  const undone = (withdrawn ?? []).length;

  // One top-up cannot settle two deposits. Without this, three €5 deposits
  // and one €5 claim would all be pointed at the same claim and an admin
  // would be offered the same money three times.
  const claimed = new Set<string>();
  let suggested = 0;

  for (const row of deposits) {
    const d = row as {
      id: string;
      external_id: string;
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
        // When the money landed. The composite key keeps it, and for a
        // deposit recorded earlier it is the only place we have it.
        occurred_at: parseExternalId(d.external_id)?.occurredAt ?? null,
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

  return { ok: true, data: { checked: deposits.length, suggested, withdrawn: undone } };
}

/**
 * Put a deposit aside, or bring it back.
 *
 * Housekeeping, not a money state. `archived_at` is a separate column from
 * `status` on purpose: status records what happened to the MONEY, and
 * folding "I have dealt with looking at this" into it would mean an
 * archived deposit losing the record of whether it was ever credited.
 *
 * Nothing is deleted and nothing is hidden irreversibly — the panel's
 * Archived view lists them with every field intact and unarchiving is this
 * same call with `archived: false`.
 *
 * Deliberately allowed on ANY status, including completed ones: a credited
 * deposit is exactly the kind you want out of the queue. The one thing it
 * cannot do is change what a deposit is or what it did.
 */
export async function setWiseDepositArchived(
  transferId: string,
  archived: boolean,
): Promise<ActionResult> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof transferId !== "string" || !transferId) {
    return { ok: false, error: "Invalid input" };
  }
  const { supabase, profile } = auth.ctx;

  // Read it under the CALLER's client first, so RLS decides whether they
  // may see it at all, and check the tenant by hand — the write below runs
  // with the service role because wise_incoming_transfers has a SELECT
  // policy and nothing else, so RLS will not catch a mistake there.
  const { data: dep, error: rErr } = await supabase
    .from("wise_incoming_transfers")
    .select("id, tenant_id")
    .eq("id", transferId)
    .maybeSingle();
  if (rErr) return { ok: false, error: safeErrorMessage(rErr) };
  if (!dep) return { ok: false, error: "Deposit not found" };
  if (dep.tenant_id !== null && dep.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  const admin = await createAdminClient();
  const { data: rows, error } = await admin
    .from("wise_incoming_transfers")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", transferId)
    .select("id");
  if (error) return { ok: false, error: safeErrorMessage(error) };
  const wrote = wroteSomething(rows);
  if (!wrote.ok) return wrote;
  return { ok: true, data: null };
}

/**
 * Go and ask Wise what it knows about deposits we recorded blind.
 *
 * The webhook enriches ONCE, at arrival, and only when it has both a
 * balance id and a profile id in the payload — and the v2 balances#credit
 * payload frequently carries neither the reference nor the profile. So a
 * deposit that arrived before the read token was configured, or whose
 * payload was thin, or whose statement window held several credits of the
 * same amount (which used to make the parser give up), is stored with no
 * reference, no sender and no description, for ever. 231 of them here.
 *
 * This asks again, from the row: the idempotency key still holds the
 * balance id and the exact instant, and the profiles come from the token
 * itself, so there is no new environment variable and nothing to keep in
 * step.
 *
 * It writes only CONTEXT — reference, sender name, sender IBAN, description
 * — and never a status, a match or a cent. Matching stays a separate,
 * deliberate step (rematchWiseDeposits), which is what makes this safe to
 * run over two hundred rows.
 *
 * It reports WHY it could not, per deposit, because "still nothing" with no
 * reason is how a feature gets declared broken when it is unconfigured.
 */
export async function refreshWiseDepositDetails(
  transferId?: string,
): Promise<
  ActionResult<{
    looked: number;
    filled: number;
    withReference: number;
    reason: string | null;
  }>
> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  if (!process.env.WISE_API_TOKEN) {
    return {
      ok: true,
      data: {
        looked: 0,
        filled: 0,
        withReference: 0,
        reason:
          "No Wise read token is set (WISE_API_TOKEN), so there is nothing to ask. The webhook can still record deposits; it just cannot look up what the payer wrote.",
      },
    };
  }

  const profileIds = await fetchWiseProfileIds();
  if (profileIds.length === 0) {
    return {
      ok: true,
      data: {
        looked: 0,
        filled: 0,
        withReference: 0,
        reason:
          "The Wise token is set but it could not list any profiles — it is probably expired, or it is a token for a different account. Check WISE_API_TOKEN.",
      },
    };
  }

  let q = supabase
    .from("wise_incoming_transfers")
    .select("id, external_id, amount_cents, currency, reference, description, tenant_id")
    .order("created_at", { ascending: false })
    .limit(transferId ? 1 : 60);
  if (transferId) {
    q = q.eq("id", transferId);
  } else {
    // Only the ones that are actually missing something.
    q = q.is("reference", null);
  }
  const { data: rows, error } = await q;
  if (error) return { ok: false, error: safeErrorMessage(error) };
  if (!rows || rows.length === 0) {
    return {
      ok: true,
      data: { looked: 0, filled: 0, withReference: 0, reason: null },
    };
  }

  const admin = await createAdminClient();
  let filled = 0;
  let withReference = 0;
  let noKey = 0;

  for (const row of rows) {
    const r = row as {
      id: string;
      external_id: string;
      amount_cents: number;
      currency: string;
      tenant_id: string | null;
    };
    if (r.tenant_id !== null && r.tenant_id !== profile.tenant_id) continue;

    const key = parseExternalId(r.external_id);
    if (!key || !key.balanceId || key.balanceId === "0") {
      // A balance id of 0 is what a payload with no balance in it produces.
      // Nothing to ask Wise about.
      noKey += 1;
      continue;
    }

    let detail = null as Awaited<ReturnType<typeof fetchWiseTxnDetail>>;
    for (const pid of profileIds) {
      detail = await fetchWiseTxnDetail({
        profileId: pid,
        balanceId: key.balanceId,
        currency: String(r.currency ?? ""),
        amountCents: Math.round(Number(r.amount_cents ?? 0)),
        occurredAt: key.occurredAt,
      });
      if (detail) break;
    }
    if (!detail) continue;

    const patch: Record<string, string> = {};
    if (detail.reference) patch.reference = detail.reference;
    if (detail.senderName) patch.sender_name = detail.senderName;
    if (detail.senderIban) patch.sender_iban = detail.senderIban;
    if (detail.description) patch.description = detail.description;
    if (Object.keys(patch).length === 0) continue;

    const { data: wrote } = await admin
      .from("wise_incoming_transfers")
      .update(patch)
      .eq("id", r.id)
      .select("id");
    if ((wrote ?? []).length > 0) {
      filled += 1;
      if (detail.reference) withReference += 1;
    }
  }

  const reason =
    filled === 0 && noKey === rows.length
      ? "None of these deposits carry a Wise balance id — their webhook payloads had no balance in them, so there is no statement to look up. Newer deposits will."
      : filled === 0
        ? "Wise returned nothing for these. Either the statements no longer cover that date, or several credits of the same amount sat within a minute of each other and we refuse to guess between them."
        : null;

  return {
    ok: true,
    data: { looked: rows.length, filled, withReference, reason },
  };
}

/**
 * What did Wise actually say?
 *
 * "Wise returned nothing" covers four completely different situations — an
 * expired token, a balance the token cannot see, a window outside the
 * plan's statement retention, and the SCA challenge Wise puts in front of
 * statement reads for some business accounts — and they need opposite
 * responses. Guessing between them wastes a day.
 *
 * Read-only, one request, admin-gated, and it never returns a token or a
 * header value.
 */
export async function probeWiseDepositLookup(
  transferId?: string,
): Promise<
  ActionResult<{
    externalId: string | null;
    tokenConfigured: boolean;
    profilesStatus: number | null;
    profileCount: number;
    statementStatus: number | null;
    scaRequired: boolean;
    signingKeyConfigured: boolean;
    signed: boolean;
    signError: string | null;
    balancesSeen: string[];
    attempts: string[];
    transactions: number | null;
    bodySnippet: string | null;
    reason: string | null;
  }>
> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  // The newest deposit that still has no reference — or the one asked for.
  let q = supabase
    .from("wise_incoming_transfers")
    .select("id, external_id, currency, tenant_id")
    .order("created_at", { ascending: false })
    .limit(1);
  q = transferId ? q.eq("id", transferId) : q.is("reference", null);
  const { data: rows, error } = await q;
  if (error) return { ok: false, error: safeErrorMessage(error) };
  const dep = (rows ?? [])[0] as
    | { id: string; external_id: string; currency: string; tenant_id: string | null }
    | undefined;
  if (!dep) {
    return {
      ok: true,
      data: {
        externalId: null,
        tokenConfigured: !!process.env.WISE_API_TOKEN,
        profilesStatus: null,
        profileCount: 0,
        statementStatus: null,
        scaRequired: false,
        signingKeyConfigured: !!process.env.WISE_API_PRIVATE_KEY,
        signed: false,
        signError: null,
        balancesSeen: [],
        attempts: [],
        transactions: null,
        bodySnippet: null,
        reason: "There is no deposit without a reference to test with.",
      },
    };
  }
  if (dep.tenant_id !== null && dep.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  const key = parseExternalId(dep.external_id);
  if (!key || !key.balanceId || key.balanceId === "0") {
    return {
      ok: true,
      data: {
        externalId: dep.external_id,
        tokenConfigured: !!process.env.WISE_API_TOKEN,
        profilesStatus: null,
        profileCount: 0,
        statementStatus: null,
        scaRequired: false,
        signingKeyConfigured: !!process.env.WISE_API_PRIVATE_KEY,
        signed: false,
        signError: null,
        balancesSeen: [],
        attempts: [],
        transactions: null,
        bodySnippet: null,
        reason:
          "This deposit's webhook payload carried no balance id (its key starts with 0:), so there is no statement to look up. Nothing is wrong with the token.",
      },
    };
  }

  const probe = await probeWiseStatement({
    balanceId: key.balanceId,
    currency: String(dep.currency ?? ""),
    occurredAt: key.occurredAt,
  });

  return {
    ok: true,
    data: {
      externalId: dep.external_id,
      tokenConfigured: probe.tokenConfigured,
      profilesStatus: probe.profilesStatus,
      profileCount: probe.profileIds.length,
      statementStatus: probe.statementStatus,
      scaRequired: probe.scaRequired,
      signingKeyConfigured: probe.signingKeyConfigured,
      signed: probe.signed,
      signError: probe.signError ?? null,
      balancesSeen: probe.balancesSeen ?? [],
      attempts: probe.attempts ?? [],
      transactions: probe.transactions,
      bodySnippet: probe.bodySnippet,
      reason:
        probe.error ??
        (probe.transactions === 0
          ? "Wise answered, and its statement for that window is empty — so the credit is outside the window or on another balance."
          : probe.transactions !== null
            ? `Wise answered with ${probe.transactions} transaction(s) in that window, but none matched this amount closely enough to be sure.`
            : null),
    },
  };
}
