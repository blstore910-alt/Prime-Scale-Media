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
  /**
   * True when nothing was queued because the AUTO-PUSH GATE is shut.
   *
   * That is the ordinary state and nobody needs telling. Every OTHER
   * refusal is the dangerous one: the gate was armed, the customer's
   * money has moved, and the supplier was NOT told — because the
   * currencies disagree, the account is not supplier-managed, or the
   * denomination of topup_amount is ambiguous. Those reasons were
   * returned faithfully and then discarded at all four call sites, so a
   * wallet was debited, the queue showed the top-up green, and the ad
   * account was never funded, with nothing anywhere saying so.
   */
  heldByGate?: boolean;
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
    return { enqueued: false, reason: gate.reason, heldByGate: true };
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
        // ── "ALREADY QUEUED" IS NOT ALWAYS TRUE ─────────────────────
        //
        // The unique key is topup:<id>, so a job that ran and FAILED
        // still holds it — and nothing anywhere resets a failed job to
        // pending. So: verify a top-up (job queued), undo it (the worker
        // sees the top-up is no longer completed and marks the job
        // failed, terminally), then re-verify the corrected row. This
        // branch hit the unique key, reported success, and the money was
        // collected while the supplier was never told. getAutoPushStatus
        // counts only `pending`, so the held tile reads 0 as well.
        //
        // Read the row that owns the key and say which it is. A failed
        // job goes back to pending — the worker's own reclaim does the
        // same for a stale one, and re-pushing is exactly what the
        // caller is asking for.
        const { data: existing, error: readErr } = await supabase
          .from("integration_jobs")
          .select("id, status")
          .eq("provider", "supplier1")
          .eq("operation", "push_topup")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        // A READ WE COULD NOT MAKE IS NOT "ALREADY QUEUED". This fell
        // through to the idempotent-success return, which is the exact
        // false success this branch was written to remove: the money is
        // collected, the supplier is never told, and the desk is shown
        // a tick. It fails closed now — an admin funding it by hand is
        // recoverable; believing it was done is not.
        if (readErr) {
          return {
            enqueued: false,
            reason:
              "we could not check whether this top-up was already sent to the supplier - fund the account by hand",
          };
        }
        const prior = existing as { id: string; status?: string } | null;
        if (prior && String(prior.status ?? "") === "failed") {
          const { error: resetErr } = await supabase
            .from("integration_jobs")
            .update({ status: "pending", attempts: 0, last_error: null })
            .eq("id", prior.id);
          if (resetErr) {
            return {
              enqueued: false,
              reason:
                "the previous push for this top-up failed and could not be requeued - fund the account by hand",
            };
          }
          return {
            enqueued: true,
            reason: "requeued (the previous push had failed)",
          };
        }
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

/**
 * Tell the supplier to take money OFF an ad account.
 *
 * ── THE MONEY EXISTED TWICE ──────────────────────────────────────────
 *
 * Approving a withdrawal credits the customer's wallet and returns.
 * The worker has had a complete `push_withdraw` handler all along
 * (lib/integrations/worker.ts) and it is in MONEY_OPERATIONS — and
 * nothing anywhere enqueued one. Every other money hop calls its
 * enqueue; this one had none to call.
 *
 * So: $5,000 sits on a supplier account, the customer withdraws it, an
 * admin approves. Wallet +$5,000 — and the supplier account still holds
 * $5,000. Then releaseSupplierAdAccount computes funded = top-ups minus
 * approved withdrawals = 0, passes, and hands the row to the next
 * customer with five thousand dollars on it. No screen compares the
 * app's figure to the supplier's, so nothing shows the gap.
 *
 * Same shape as enqueueSupplierTopupPush deliberately, including the
 * refusals: an account that is not supplier-managed, or whose currency
 * is not USD, is done by hand. Returning `enqueued: false` is the
 * caller's cue to say so — the money has already moved on our side.
 */
export async function enqueueSupplierWithdrawPush(
  supabase: Pick<SupabaseClient, "from">,
  params: { withdrawalId: string; tenantId: string },
  env: Record<string, string | undefined> = process.env,
): Promise<EnqueueResult> {
  const gate = autoPushGate(env);
  if (!gate.enabled) {
    return { enqueued: false, reason: gate.reason, heldByGate: true };
  }

  try {
    const { data: wd, error: wdErr } = await supabase
      .from("ad_account_withdrawals")
      .select("id, tenant_id, ad_account_id, status, currency, amount")
      .eq("id", params.withdrawalId)
      .maybeSingle();

    if (wdErr) {
      return {
        enqueued: false,
        reason: `withdrawal read failed: ${safeErrorMessage(wdErr)}`,
      };
    }
    if (!wd) return { enqueued: false, reason: "withdrawal not found" };
    if (String(wd.tenant_id) !== String(params.tenantId)) {
      return { enqueued: false, reason: "withdrawal belongs to another tenant" };
    }
    if (String(wd.status ?? "") !== "approved") {
      return {
        enqueued: false,
        reason: `withdrawal is ${wd.status ?? "unknown"}, not approved`,
      };
    }

    const amount = Number(wd.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { enqueued: false, reason: "amount is not a positive number" };
    }
    const amountCents = Math.round(amount * 100);

    const { data: pool, error: poolErr } = await supabase
      .from("supplier_ad_accounts")
      .select("external_id, provider, currency")
      .eq("ad_account_id", wd.ad_account_id)
      .eq("provider", "supplier1")
      .maybeSingle();

    if (poolErr) {
      return {
        enqueued: false,
        reason: `pool read failed: ${safeErrorMessage(poolErr)}`,
      };
    }
    if (!pool?.external_id) {
      return {
        enqueued: false,
        reason:
          "ad account is not supplier-managed (manual account) — take it off by hand",
      };
    }

    // An ad-account balance is USD by construction, and 20260919100000
    // forces the withdrawal currency to USD by trigger — so these agree
    // by design. The check is here anyway: a mismatch means one of those
    // two assumptions has moved, and guessing at the supplier's expense
    // is not recoverable.
    const accountCurrency = String(pool.currency || "").toUpperCase();
    const wdCurrency = String(wd.currency || "").toUpperCase();
    if (accountCurrency !== "USD" || wdCurrency !== "USD") {
      return {
        enqueued: false,
        reason: `withdrawal is ${wdCurrency || "unknown"} and the ad account is ${
          accountCurrency || "unknown"
        } — only USD can be pushed safely, take it off by hand`,
      };
    }

    const idempotencyKey = `withdraw:${wd.id}`;
    const { data: job, error: jobErr } = await supabase
      .from("integration_jobs")
      .insert({
        tenant_id: params.tenantId,
        provider: "supplier1",
        operation: "push_withdraw",
        status: "pending",
        idempotency_key: idempotencyKey,
        payload: {
          external_ad_account_id: pool.external_id,
          amount_cents: amountCents,
          currency: accountCurrency,
          withdrawal_id: wd.id,
          ad_account_id: wd.ad_account_id,
        },
      })
      .select("id")
      .single();

    if (jobErr) {
      if ((jobErr as { code?: string }).code === UNIQUE_VIOLATION) {
        // Same reasoning as the top-up push: a FAILED job still holds
        // the key, and nothing resets one. Read the row that owns it and
        // say which case this is rather than reporting a tick.
        const { data: existing, error: readErr } = await supabase
          .from("integration_jobs")
          .select("id, status")
          .eq("provider", "supplier1")
          .eq("operation", "push_withdraw")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (readErr) {
          return {
            enqueued: false,
            reason:
              "we could not check whether this withdrawal was already sent to the supplier - take it off by hand",
          };
        }
        const prior = existing as { id: string; status?: string } | null;
        if (prior && String(prior.status ?? "") === "failed") {
          const { error: resetErr } = await supabase
            .from("integration_jobs")
            .update({ status: "pending", attempts: 0, last_error: null })
            .eq("id", prior.id);
          if (resetErr) {
            return {
              enqueued: false,
              reason:
                "the previous push for this withdrawal failed and could not be requeued - take it off by hand",
            };
          }
          return {
            enqueued: true,
            reason: "requeued (the previous push had failed)",
          };
        }
        return { enqueued: true, reason: "already queued (idempotent)" };
      }
      return {
        enqueued: false,
        reason: `queue insert failed: ${safeErrorMessage(jobErr)}`,
      };
    }

    return { enqueued: true, reason: "queued", jobId: job.id };
  } catch (err) {
    // Belt: the wallet credit already happened. Swallow and report.
    return { enqueued: false, reason: `enqueue threw: ${safeErrorMessage(err)}` };
  }
}
