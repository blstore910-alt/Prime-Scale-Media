// Enqueue side of the supplier auto-push.
//
// When an ad-account top-up reaches `completed` we have taken the
// advertiser's money; the ad account still has to be funded at the supplier.
// Today an admin does that by hand in the supplier portal. This enqueues an
// integration_jobs row so the worker can do it instead — but ONLY when the
// two-switch gate in ./autopush says so.
//
// Design rules this follows, because it sits next to money:
//
//   * Never throws. The top-up write has already committed; a queueing
//     failure must not fail the admin's action or roll anything back. Every
//     path returns a reason instead.
//   * Idempotent by construction. idempotency_key is `topup:<id>`, and
//     integration_jobs has UNIQUE (provider, operation, idempotency_key), so
//     a double-click, a retry, or an admin re-saving a completed top-up all
//     collapse to the one job. A duplicate-key error is a SUCCESS here.
//   * Only pushes accounts the supplier actually owns. The external id comes
//     from supplier_ad_accounts (the pool) with provider='supplier1'.
//     Manually-added pool rows (provider='manual') and accounts that were
//     never allocated from the pool have no supplier id and are skipped —
//     there is nowhere to push them to.

import type { SupabaseClient } from "@supabase/supabase-js";
import { autoPushGate } from "./autopush";
// Relative, not "@/…": this module is covered by tests/lib/autopush.test.ts
// which runs under `node --test` with no path-alias resolution.
import { safeErrorMessage } from "../pure-error";

export type EnqueueResult = {
  enqueued: boolean;
  /** Always populated — why it did or didn't queue. Safe to log. */
  reason: string;
  jobId?: string;
};

// Postgres unique_violation. Hitting it means the job is already queued,
// which is exactly the desired end state.
const UNIQUE_VIOLATION = "23505";

function toCents(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export async function enqueueSupplierTopupPush(
  supabase: Pick<SupabaseClient, "from">,
  params: { topupId: string; tenantId: string },
  env: Record<string, string | undefined> = process.env,
): Promise<EnqueueResult> {
  const gate = autoPushGate(env);
  if (!gate.enabled) {
    // No row is written at all. Nothing to drain later if the flag flips.
    return { enqueued: false, reason: gate.reason };
  }

  try {
    const { data: topup, error: topupErr } = await supabase
      .from("top_ups")
      .select("id, tenant_id, account_id, status, currency, topup_amount, is_deleted")
      .eq("id", params.topupId)
      .maybeSingle();

    if (topupErr) {
      return { enqueued: false, reason: `top-up read failed: ${safeErrorMessage(topupErr)}` };
    }
    if (!topup) return { enqueued: false, reason: "top-up not found" };

    // Re-read the state from the DB rather than trusting the caller — this
    // runs after the write, so the row is authoritative.
    if (topup.tenant_id !== params.tenantId) {
      return { enqueued: false, reason: "tenant mismatch" };
    }
    if (topup.status !== "completed") {
      return { enqueued: false, reason: `status is ${topup.status}, not completed` };
    }
    if (topup.is_deleted === true) {
      return { enqueued: false, reason: "top-up is deleted" };
    }
    if (!topup.account_id) {
      return { enqueued: false, reason: "top-up has no ad account" };
    }

    const amountCents = toCents(topup.topup_amount);
    if (amountCents == null) {
      return { enqueued: false, reason: "topup_amount is not a positive number" };
    }

    // The supplier's own id for this ad account. Only accounts that came from
    // the supplier pool have one.
    const { data: pool, error: poolErr } = await supabase
      .from("supplier_ad_accounts")
      .select("external_id, provider, currency")
      .eq("ad_account_id", topup.account_id)
      .eq("provider", "supplier1")
      .maybeSingle();

    if (poolErr) {
      return { enqueued: false, reason: `pool read failed: ${safeErrorMessage(poolErr)}` };
    }
    if (!pool?.external_id) {
      return {
        enqueued: false,
        reason: "ad account is not supplier-managed (manual account) — fund it by hand",
      };
    }

    // ── Currency safety ───────────────────────────────────────────────
    // `topup_amount` and `currency` are NOT guaranteed to be the same money.
    // The two writers disagree: the single top-up form stores topup_amount in
    // USD (utils-pure.calculateTopupAmount divides by the rate, then nets the
    // fee) while leaving `currency` as the PAYMENT currency; the bulk dialog
    // stores it in the payment currency. Pairing them blindly asked the
    // supplier for a USD number labelled EUR — roughly 9% too much on every
    // EUR top-up, out of our own supplier balance, irreversibly.
    //
    // The only currency the supplier will actually credit is the ad account's
    // own, so that is what we send. And because we cannot tell from the row
    // which writer produced it, we REFUSE rather than convert whenever the
    // payment currency differs from the account currency — a wrong guess here
    // spends real money. The admin funds those by hand until the two writers
    // are reconciled behind one explicitly-denominated column.
    const accountCurrency = String(pool.currency || "").toUpperCase();
    const paidCurrency = String(topup.currency || "").toUpperCase();
    if (!accountCurrency) {
      return {
        enqueued: false,
        reason: "ad account has no currency on the pool row — fund it by hand",
      };
    }
    if (!paidCurrency || paidCurrency !== accountCurrency) {
      return {
        enqueued: false,
        reason: `top-up is in ${paidCurrency || "an unknown currency"} but the ad account is ${accountCurrency} — amount denomination is ambiguous, fund it by hand`,
      };
    }
    // Matching LABELS are not enough — the earlier version of this guard
    // stopped here and was wrong. `topup_amount` is USD by construction on the
    // form path: calculateTopupAmount divides amount_received by the rate and
    // then nets the fee, so the stored number is USD even when `currency` says
    // EUR. A EUR top-up on a EUR account therefore passed the label check and
    // would have pushed a USD figure under a EUR label — over-funding by 1/rate
    // (~16% at 0.86), out of our own supplier balance.
    //
    // USD is the one currency where the stored number and the label agree by
    // construction. Until both writers sit behind one explicitly denominated
    // column, anything else is funded by hand. Refusing is cheap; guessing is
    // not recoverable.
    if (accountCurrency !== "USD") {
      return {
        enqueued: false,
        reason: `ad account is ${accountCurrency} but topup_amount is stored in USD — cannot push a converted amount safely, fund it by hand`,
      };
    }

    const idempotencyKey = `topup:${topup.id}`;
    const { data: job, error: jobErr } = await supabase
      .from("integration_jobs")
      .insert({
        tenant_id: params.tenantId,
        provider: "supplier1",
        operation: "push_topup",
        status: "pending",
        idempotency_key: idempotencyKey,
        payload: {
          external_ad_account_id: pool.external_id,
          amount_cents: amountCents,
          // The ad account's currency, not the payment currency — they are
          // equal here by the guard above, but this names the authoritative
          // source so a later edit can't silently reintroduce the mismatch.
          currency: accountCurrency,
          topup_id: topup.id,
          ad_account_id: topup.account_id,
        },
      })
      .select("id")
      .single();

    if (jobErr) {
      if ((jobErr as { code?: string }).code === UNIQUE_VIOLATION) {
        return { enqueued: true, reason: "already queued (idempotent)" };
      }
      return { enqueued: false, reason: `queue insert failed: ${safeErrorMessage(jobErr)}` };
    }

    return { enqueued: true, reason: "queued", jobId: job.id };
  } catch (err) {
    // Belt: the caller's money write already succeeded. Swallow and report.
    return { enqueued: false, reason: `enqueue threw: ${safeErrorMessage(err)}` };
  }
}
