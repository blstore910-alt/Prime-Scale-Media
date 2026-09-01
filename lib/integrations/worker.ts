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
  last_error: string | null;
  result: Record<string, unknown> | null;
  finished_at: string | null;
};

export type WorkerContext = {
  supabase: Pick<SupabaseClient, "from" | "rpc">;
  supplier1: Supplier1Adapter;
  wise: WiseAdapter;
  now?: () => Date; // injectable for tests
};

export type ProcessResult = {
  claimed: number;
  succeeded: number;
  retried: number;
  failed: number;
  skipped: number;
};

// Exponential backoff for retry scheduling. Growth by attempt number:
//   1 → 30s, 2 → 60s, 3 → 2min, 4 → 5min, 5 → 15min, ≥6 → 30min.
// Small enough that a real transient outage recovers same-day, big
// enough to not hammer a broken remote.
export function backoffSeconds(attempts: number): number {
  const table = [30, 60, 120, 300, 900, 1800];
  const idx = Math.min(Math.max(attempts, 0), table.length - 1);
  return table[idx];
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
  const claimed = await claimBatch(ctx, batchSize);
  const summary: ProcessResult = {
    claimed: claimed.length,
    succeeded: 0,
    retried: 0,
    failed: 0,
    skipped: 0,
  };
  for (const job of claimed) {
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
