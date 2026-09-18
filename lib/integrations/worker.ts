// Job runner for integration_jobs.
//
// Called from app/api/cron/integration-jobs on a Vercel cron. Pure
// dispatch logic — the caller supplies a Supabase client (already
// authorised) and the adapter accessors, so tests can exercise the
// state machine without a real DB or a real network. What lives here:
//
//   - "claim" a batch of due jobs by moving them from `pending` (or
//     stuck `processing`) to `processing` with a fresh timestamp
//   - dispatch each claim to the right adapter operation
//   - stamp success (`result`, `finished_at`, `status=succeeded`) or
//     failure (`last_error`, retry with backoff, or terminal `failed`)
//
// State machine
//   pending  → processing   (worker claims)
//   processing → succeeded  (adapter ok)
//   processing → pending    (adapter fail, attempts < max — backoff)
//   processing → failed     (adapter fail, attempts >= max)
//   * → cancelled           (admin action, worker never picks these)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Supplier1Adapter, WiseAdapter } from "./types";
import { autoPushGate } from "./autopush";

export type IntegrationJobRow = {
  id: string;
  tenant_id: string;
  provider: string;
  operation: string;
  status: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  attempts: number;
  max_attempts: number;
  next_run_at: string;
  /** Bumped by trg_touch_integration_jobs; the stale-claim reaper reads it. */
  updated_at?: string;
  last_error: string | null;
  result: Record<string, unknown> | null;
  finished_at: string | null;
};

export type WorkerContext = {
  supabase: Pick<SupabaseClient, "from" | "rpc">;
  supplier1: Supplier1Adapter;
  wise: WiseAdapter;
  now?: () => Date; // injectable for tests
  env?: Record<string, string | undefined>; // injectable for tests
};

export type ProcessResult = {
  claimed: number;
  succeeded: number;
  retried: number;
  failed: number;
  skipped: number;
  /** Held back by the auto-push gate — left pending, no attempt consumed. */
  blocked: number;
  /** Abandoned 'processing' claims returned to the queue this tick. */
  reclaimed: number;
};

// Operations that MOVE REAL MONEY at the supplier. Gated separately from
// read-only work (sync_ad_accounts, balance) so we can run the reads live
// long before we trust the writes. See ./autopush.
const MONEY_OPERATIONS = new Set(["push_topup", "push_withdraw"]);

function isGatedMoneyJob(job: IntegrationJobRow): boolean {
  return job.provider === "supplier1" && MONEY_OPERATIONS.has(job.operation);
}

// Exponential backoff for retry scheduling. Growth by attempt number:
//   1 → 30s, 2 → 60s, 3 → 2min, 4 → 5min, 5 → 15min, ≥6 → 30min.
// Small enough that a real transient outage recovers same-day, big
// enough to not hammer a broken remote.
export function backoffSeconds(attempts: number): number {
  const table = [30, 60, 120, 300, 900, 1800];
  const idx = Math.min(Math.max(attempts, 0), table.length - 1);
  return table[idx];
}

// How long a claim is allowed to be held before another tick may take it
// back. A claimed job stays "processing" for exactly as long as the function
// invocation that took it — so anything much older than a platform timeout
// is a job whose worker died, not one still working.
//
// 10 minutes: far longer than any single dispatch (the supplier call is
// bounded at 20s), so this can never steal a job from a live worker, and
// short enough that a funded top-up is retried within the hour.
const CLAIM_LEASE_MS = 10 * 60 * 1000;

/**
 * Return abandoned claims to the queue.
 *
 * claimBatch only ever selected status='pending', and nothing anywhere put a
 * job back. So a job flipped to 'processing' by a worker that then died —
 * platform timeout mid-batch, a deploy swapping the function out, an
 * unhandled throw — stayed 'processing' forever. For a push_topup that means
 * the advertiser's money was taken and the supplier was never told, silently,
 * with no way to requeue except editing the row by hand.
 *
 * The attempt is NOT refunded: the work may well have reached the supplier
 * before the worker died, so this is a retry, and max_attempts still bounds
 * it. A job that burns through its attempts this way ends up 'failed', which
 * is visible, rather than 'processing', which looks like progress.
 */
async function reclaimStaleJobs(ctx: WorkerContext): Promise<number> {
  const now = ctx.now?.() ?? new Date();
  const cutoff = new Date(now.getTime() - CLAIM_LEASE_MS).toISOString();

  const { data, error } = await ctx.supabase
    .from("integration_jobs")
    .update({ status: "pending", next_run_at: now.toISOString() })
    .eq("status", "processing")
    .lt("updated_at", cutoff)
    .select("id");

  if (error) {
    // Never fail the tick over this — the normal queue must still drain.
    console.error("reclaimStaleJobs failed:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

async function claimBatch(
  ctx: WorkerContext,
  limit: number,
): Promise<IntegrationJobRow[]> {
  const now = (ctx.now?.() ?? new Date()).toISOString();
  const { data, error } = await ctx.supabase
    .from("integration_jobs")
    .select("*")
    .in("status", ["pending"])
    .lte("next_run_at", now)
    .order("next_run_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`claim query failed: ${error.message}`);
  if (!data?.length) return [];

  // Optimistic claim: only rows still in pending get flipped. Two
  // concurrent workers race on this and Postgres serialises them —
  // the loser sees updated_at drift on its half and just skips.
  const claimed: IntegrationJobRow[] = [];
  for (const row of data as IntegrationJobRow[]) {
    const { data: updated, error: upErr } = await ctx.supabase
      .from("integration_jobs")
      .update({
        status: "processing",
        attempts: row.attempts + 1,
      })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (upErr) continue;
    if (updated) claimed.push(updated as IntegrationJobRow);
  }
  return claimed;
}

async function dispatch(
  ctx: WorkerContext,
  job: IntegrationJobRow,
): Promise<
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; error: string; retryable: boolean }
> {
  if (job.provider === "supplier1") {
    if (job.operation === "push_topup") {
      // ── IS THE TOP-UP STILL COLLECTED? ────────────────────────────
      //
      // The job carries its own amount, frozen at enqueue time, and
      // nothing re-read the row. So: an admin verifies a EUR 10,000
      // ad-account top-up, the job is queued, the admin notices the
      // wrong account and undoes the verify — which reverses the money
      // on our side — and up to a minute later this worker funds the
      // supplier anyway, for a payment the app has un-collected.
      //
      // This file's own header promises `* -> cancelled (admin action,
      // worker never picks these)`, and nothing in the tree ever writes
      // `cancelled` to integration_jobs. There is no admin action. So
      // the check has to be here, against the row itself.
      //
      // The idempotency key is `topup:<id>`, which is the only link the
      // job keeps to what it is paying for.
      const topupId = String(job.idempotency_key ?? "").startsWith("topup:")
        ? String(job.idempotency_key).slice("topup:".length)
        : null;
      if (topupId) {
        const { data: row, error: rowErr } = await ctx.supabase
          .from("top_ups")
          .select("status")
          .eq("id", topupId)
          .maybeSingle();
        // A read we could not make is not permission to send money.
        if (rowErr) {
          return {
            ok: false,
            error: "Could not confirm the top-up is still completed",
            retryable: true,
          };
        }
        if (!row || String(row.status ?? "") !== "completed") {
          return {
            ok: false,
            error: `The top-up is no longer completed (${row?.status ?? "gone"}), so nothing was funded`,
            // NOT retryable: this is a decision, not a hiccup. Retrying
            // would just ask the same question every minute for ever.
            retryable: false,
          };
        }
      }

      const res = await ctx.supplier1.pushTopup({
        external_ad_account_id: String(job.payload.external_ad_account_id),
        amount_cents: Number(job.payload.amount_cents),
        currency: String(job.payload.currency),
        idempotency_key: job.idempotency_key,
      });
      if (!res.ok) {
        return {
          ok: false,
          error: res.error,
          retryable: res.retryable ?? true,
        };
      }
      // Transport success is NOT business success: the supplier can accept the
      // request and still reject the movement. We were dumping that status
      // into the result blob and marking the job 'succeeded', so a rejected
      // top-up was indistinguishable from a settled one and alerted nobody.
      if (res.data?.status === "failed") {
        return {
          ok: false,
          error: `Supplier rejected the top-up (external id ${res.data.external_topup_id || "unknown"})`,
          retryable: false,
        };
      }
      return { ok: true, result: res.data as unknown as Record<string, unknown> };
    }
    if (job.operation === "push_withdraw") {
      const res = await ctx.supplier1.pushWithdraw({
        external_ad_account_id: String(job.payload.external_ad_account_id),
        amount_cents: Number(job.payload.amount_cents),
        currency: String(job.payload.currency),
        idempotency_key: job.idempotency_key,
      });
      if (!res.ok) {
        return {
          ok: false,
          error: res.error,
          retryable: res.retryable ?? true,
        };
      }
      if (res.data?.status === "failed") {
        return {
          ok: false,
          error: `Supplier rejected the withdrawal (external id ${res.data.external_withdraw_id || "unknown"})`,
          retryable: false,
        };
      }
      return { ok: true, result: res.data as unknown as Record<string, unknown> };
    }
    if (job.operation === "sync_ad_accounts") {
      const res = await ctx.supplier1.listAdAccounts();
      if (!res.ok) {
        return {
          ok: false,
          error: res.error,
          retryable: res.retryable ?? true,
        };
      }
      return { ok: true, result: { accounts: res.data } };
    }
  }
  if (job.provider === "wise") {
    if (job.operation === "match_incoming") {
      const since = String(job.payload.since ?? new Date(0).toISOString());
      const res = await ctx.wise.listIncomingSince(since);
      if (!res.ok) {
        return {
          ok: false,
          error: res.error,
          retryable: res.retryable ?? true,
        };
      }
      return { ok: true, result: { transfers: res.data } };
    }
  }
  // Unknown provider/operation is terminal — no retry helps.
  return {
    ok: false,
    error: `Unknown job: ${job.provider}/${job.operation}`,
    retryable: false,
  };
}

async function finaliseJob(
  ctx: WorkerContext,
  job: IntegrationJobRow,
  outcome:
    | { ok: true; result: Record<string, unknown> }
    | { ok: false; error: string; retryable: boolean },
): Promise<"succeeded" | "retried" | "failed"> {
  const now = ctx.now?.() ?? new Date();

  if (outcome.ok) {
    await ctx.supabase
      .from("integration_jobs")
      .update({
        status: "succeeded",
        result: outcome.result,
        last_error: null,
        finished_at: now.toISOString(),
      })
      .eq("id", job.id);
    return "succeeded";
  }

  const attemptsAfterClaim = job.attempts + 1;
  const isTerminal =
    !outcome.retryable || attemptsAfterClaim >= job.max_attempts;

  if (isTerminal) {
    await ctx.supabase
      .from("integration_jobs")
      .update({
        status: "failed",
        last_error: outcome.error,
        finished_at: now.toISOString(),
      })
      .eq("id", job.id);
    return "failed";
  }

  const delayMs = backoffSeconds(attemptsAfterClaim) * 1000;
  const nextAt = new Date(now.getTime() + delayMs).toISOString();
  await ctx.supabase
    .from("integration_jobs")
    .update({
      status: "pending",
      last_error: outcome.error,
      next_run_at: nextAt,
    })
    .eq("id", job.id);
  return "retried";
}

export async function processIntegrationJobs(
  ctx: WorkerContext,
  { batchSize = 10 }: { batchSize?: number } = {},
): Promise<ProcessResult> {
  // Before claiming anything new, take back claims whose worker never came
  // home. Runs first so a reclaimed job can be picked up in this same tick.
  const reclaimed = await reclaimStaleJobs(ctx);

  const claimed = await claimBatch(ctx, batchSize);
  const summary: ProcessResult = {
    claimed: claimed.length,
    succeeded: 0,
    retried: 0,
    failed: 0,
    skipped: 0,
    blocked: 0,
    reclaimed,
  };
  const gate = autoPushGate(ctx.env ?? process.env);
  for (const job of claimed) {
    // Hard stop before any adapter is touched. A money job that exists while
    // the gate is shut is put BACK to pending with its attempt refunded — not
    // failed, not retried-with-backoff. It simply waits. That way a queue
    // built up during testing can never be drained by accident, and the jobs
    // are still there (intact, un-aged) if the gate is opened deliberately.
    if (isGatedMoneyJob(job) && !gate.enabled) {
      summary.blocked++;
      await ctx.supabase
        .from("integration_jobs")
        .update({
          status: "pending",
          attempts: job.attempts - 1,
          last_error: `held: ${gate.reason}`,
        })
        .eq("id", job.id);
      continue;
    }
    try {
      const outcome = await dispatch(ctx, job);
      const state = await finaliseJob(ctx, job, outcome);
      if (state === "succeeded") summary.succeeded++;
      else if (state === "retried") summary.retried++;
      else summary.failed++;
    } catch (err) {
      summary.skipped++;
      await ctx.supabase
        .from("integration_jobs")
        .update({
          status: "pending",
          last_error: `worker threw: ${
            err instanceof Error ? err.message : "unknown"
          }`,
          next_run_at: new Date(
            (ctx.now?.() ?? new Date()).getTime() +
              backoffSeconds(job.attempts + 1) * 1000,
          ).toISOString(),
        })
        .eq("id", job.id);
    }
  }
  return summary;
}
