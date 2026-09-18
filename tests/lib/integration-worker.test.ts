import { strict as assert } from "node:assert";
import { describe, it, beforeEach } from "node:test";
import {
  backoffSeconds,
  processIntegrationJobs,
  type IntegrationJobRow,
  type WorkerContext,
} from "../../lib/integrations/worker.ts";
import type { Supplier1Adapter, WiseAdapter } from "../../lib/integrations/types.ts";

// ─────────────────────────────────────────────────────────────────
// Tiny in-memory Supabase stub — only the calls the worker makes.
// Not a general fixture, just enough to exercise the state machine.
// ─────────────────────────────────────────────────────────────────
function makeMockSupabase(
  initial: IntegrationJobRow[],
  // What a `top_ups` read answers with. The push dispatcher re-reads the
  // row before funding anything — a verify that has been undone must not
  // reach the supplier — and this stub answered every table with the JOB
  // chain, so `top_ups` came back as a job row and the guard was never
  // properly exercised. Default: the ordinary case, still completed.
  topup: { status?: string } | null = { status: "completed" },
) {
  const rows = new Map<string, IntegrationJobRow>();
  for (const r of initial) rows.set(r.id, { ...r });

  const from = (table: string) => {
    if (table === "top_ups") {
      const row: Record<string, unknown> = {
        select: () => row,
        eq: () => row,
        maybeSingle: async () => ({ data: topup, error: null }),
      };
      return row as never;
    }
    let selectSpec = "";
    let statusFilter: string[] | null = null;
    let lteField: string | null = null;
    let lteVal: string | null = null;
    let orderField: string | null = null;
    let orderAsc = true;
    let limitN: number | null = null;
    let eqField: string | null = null;
    let eqVal: string | null = null;
    let eqStatus: string | null = null;
    let updateBody: Partial<IntegrationJobRow> | null = null;
    let mode: "select" | "update" = "select";
    // The stale-claim reaper filters on updated_at < cutoff rather than on
    // an id, so the fake needs both .lt() and a bulk update path.
    let ltField: string | null = null;
    let ltVal: string | null = null;

    const api = {
      select(spec: string) {
        selectSpec = spec;
        return api;
      },
      in(field: string, vals: string[]) {
        if (field === "status") statusFilter = vals;
        return api;
      },
      lte(field: string, val: string) {
        lteField = field;
        lteVal = val;
        return api;
      },
      lt(field: string, val: string) {
        ltField = field;
        ltVal = val;
        return api;
      },
      order(field: string, opts: { ascending: boolean }) {
        orderField = field;
        orderAsc = opts.ascending;
        return api;
      },
      limit(n: number) {
        limitN = n;
        return api;
      },
      eq(field: string, val: string) {
        if (field === "id") {
          eqField = field;
          eqVal = val;
        } else if (field === "status") {
          eqStatus = val;
        }
        return api;
      },
      update(body: Partial<IntegrationJobRow>) {
        mode = "update";
        updateBody = body;
        return api;
      },
      async maybeSingle() {
        if (mode === "update" && eqField === "id" && eqVal) {
          const existing = rows.get(eqVal);
          if (!existing) return { data: null, error: null };
          if (eqStatus && existing.status !== eqStatus) {
            return { data: null, error: null };
          }
          const merged = { ...existing, ...updateBody } as IntegrationJobRow;
          rows.set(eqVal, merged);
          return { data: merged, error: null };
        }
        return { data: null, error: null };
      },
      then(_res: (v: unknown) => unknown, _rej?: (e: unknown) => unknown) {
        // Bulk update with no id — the stale-claim reaper.
        if (mode === "update" && !eqVal && eqStatus && ltField) {
          const hit: IntegrationJobRow[] = [];
          for (const [id, r] of rows) {
            if (r.status !== eqStatus) continue;
            if (ltField === "updated_at" && ltVal && !((r.updated_at ?? "") < ltVal)) {
              continue;
            }
            const merged = { ...r, ...updateBody } as IntegrationJobRow;
            rows.set(id, merged);
            hit.push(merged);
          }
          return Promise.resolve({ data: hit, error: null }).then(_res, _rej);
        }
        // Terminal `await` — only used by claim query batch select
        if (mode === "select" && selectSpec) {
          const list = Array.from(rows.values()).filter((r) => {
            if (statusFilter && !statusFilter.includes(r.status)) return false;
            if (lteField === "next_run_at" && lteVal) {
              if (r.next_run_at > lteVal) return false;
            }
            return true;
          });
          if (orderField === "next_run_at") {
            list.sort((a, b) =>
              orderAsc
                ? a.next_run_at.localeCompare(b.next_run_at)
                : b.next_run_at.localeCompare(a.next_run_at),
            );
          }
          const sliced = limitN ? list.slice(0, limitN) : list;
          return Promise.resolve({ data: sliced, error: null }).then(_res, _rej);
        }
        // Bare update() (no maybeSingle after) — the finaliser path.
        if (mode === "update" && eqField === "id" && eqVal) {
          const existing = rows.get(eqVal);
          if (existing) {
            rows.set(eqVal, {
              ...existing,
              ...updateBody,
            } as IntegrationJobRow);
          }
          return Promise.resolve({ data: null, error: null }).then(_res, _rej);
        }
        return Promise.resolve({ data: null, error: null }).then(_res, _rej);
      },
    };
    return api;
  };

  return {
    supabase: {
      from,
      async rpc() {
        return { data: null, error: null };
      },
    } as unknown as WorkerContext["supabase"],
    rows,
  };
}

function baseJob(overrides: Partial<IntegrationJobRow> = {}): IntegrationJobRow {
  return {
    id: overrides.id ?? "job-1",
    tenant_id: "tenant-1",
    provider: "supplier1",
    operation: "push_topup",
    status: "pending",
    payload: {
      external_ad_account_id: "supplier1-mock-001",
      amount_cents: 500_00,
      currency: "USD",
    },
    // `topup:<id>` — the shape lib/integrations/enqueue.ts actually
    // writes. It was "key-1", which the dispatcher's parser does not
    // recognise, so EVERY test here took the topupId === null path and
    // skipped the re-read guard entirely. That is why adding the guard
    // turned only the other test file red.
    idempotency_key: overrides.idempotency_key ?? "topup:topup-1",
    attempts: 0,
    max_attempts: 5,
    next_run_at: "2020-01-01T00:00:00.000Z",
    last_error: null,
    result: null,
    finished_at: null,
    ...overrides,
  };
}

const okAdapter: { supplier1: Supplier1Adapter; wise: WiseAdapter } = {
  supplier1: {
    async listAdAccounts() {
      return { ok: true, data: [] };
    },
    async getBalance() {
      return { ok: true, data: { balance_cents: 0, currency: "USD" } };
    },
    async listAccountTopups() {
      return { ok: true, data: [] };
    },
    async getWalletBalance() {
      return {
        ok: true,
        data: {
          usd_balance: 0,
          eur_balance: 0,
          available_usd: 0,
          available_eur: 0,
        },
      };
    },
    async pushTopup(input) {
      return {
        ok: true,
        data: {
          external_topup_id: `ok-${input.idempotency_key}`,
          status: "completed",
          balance_after_cents: 100,
        },
      };
    },
    async pushWithdraw(input) {
      return {
        ok: true,
        data: {
          external_withdraw_id: `ok-${input.idempotency_key}`,
          status: "queued",
          balance_after_cents: null,
        },
      };
    },
  },
  wise: {
    async listIncomingSince() {
      return { ok: true, data: [] };
    },
  },
};

const brokenAdapter: { supplier1: Supplier1Adapter; wise: WiseAdapter } = {
  supplier1: {
    async listAdAccounts() {
      return { ok: false, error: "boom", retryable: true };
    },
    async getBalance() {
      return { ok: false, error: "boom", retryable: true };
    },
    async listAccountTopups() {
      return { ok: false, error: "boom", retryable: true };
    },
    async getWalletBalance() {
      return { ok: false, error: "boom", retryable: true };
    },
    async pushTopup() {
      return { ok: false, error: "boom", retryable: true };
    },
    async pushWithdraw() {
      return { ok: false, error: "boom", retryable: true };
    },
  },
  wise: {
    async listIncomingSince() {
      return { ok: false, error: "boom", retryable: true };
    },
  },
};

describe("backoffSeconds", () => {
  it("grows through the schedule then caps at 1800", () => {
    assert.equal(backoffSeconds(1), 60);
    assert.equal(backoffSeconds(2), 120);
    assert.equal(backoffSeconds(3), 300);
    assert.equal(backoffSeconds(4), 900);
    assert.equal(backoffSeconds(10), 1800);
  });
});

// These suites exercise the claim/retry/finalise state machine using a
// push_topup job. push_topup moves real money, so the worker refuses to
// dispatch it unless the auto-push gate is armed (lib/integrations/autopush).
// Arm it explicitly here — the gate's own behaviour is covered in
// tests/lib/autopush.test.ts.
const ARMED = { SUPPLIER1_MODE: "live", SUPPLIER1_AUTOPUSH: "on" };

describe("processIntegrationJobs — success path", () => {
  it("succeeded run marks job succeeded with result", async () => {
    const { supabase, rows } = makeMockSupabase([baseJob()]);
    const summary = await processIntegrationJobs(
      {
        supabase,
        ...okAdapter,
        env: ARMED,
        now: () => new Date("2026-08-30T10:00:00Z"),
      },
      { batchSize: 5 },
    );
    assert.equal(summary.succeeded, 1);
    assert.equal(summary.failed, 0);
    const stored = rows.get("job-1")!;
    assert.equal(stored.status, "succeeded");
    assert.equal(stored.attempts, 1);
    assert.ok(stored.result);
  });
});

describe("processIntegrationJobs — retry path", () => {
  it("first failure schedules a retry, keeps status pending", async () => {
    const { supabase, rows } = makeMockSupabase([baseJob()]);
    const summary = await processIntegrationJobs(
      {
        supabase,
        ...brokenAdapter,
        env: ARMED,
        now: () => new Date("2026-08-30T10:00:00Z"),
      },
      { batchSize: 5 },
    );
    assert.equal(summary.retried, 1);
    assert.equal(summary.failed, 0);
    const stored = rows.get("job-1")!;
    assert.equal(stored.status, "pending");
    assert.equal(stored.last_error, "boom");
    assert.ok(stored.next_run_at > "2026-08-30T10:00:00Z");
  });
});

describe("processIntegrationJobs — the attempt counter", () => {
  // THE FIXTURE THAT ACTUALLY DISCRIMINATES.
  //
  // claimBatch writes attempts + 1 and returns the UPDATED row, so
  // finaliseJob must use job.attempts as-is. It used to add one again,
  // killing every job an attempt early. Neither existing test could see
  // it: attempts 0 is nowhere near the cap, and attempts 4 with a cap of
  // 5 is terminal either way (5 >= 5 and 6 >= 5). Only attempts 3 tells
  // them apart — correct: 4 >= 5 is false, so it RETRIES; broken: 5 >= 5
  // is true, so it dies with the customer's money already taken and the
  // supplier never funded.
  //
  // Reverting that one line used to leave the suite green.
  it("a job one below the cap retries rather than dying", async () => {
    const { supabase, rows } = makeMockSupabase([
      baseJob({ attempts: 3, max_attempts: 5 }),
    ]);
    const summary = await processIntegrationJobs(
      {
        supabase,
        ...brokenAdapter,
        env: ARMED,
        now: () => new Date("2026-08-30T10:00:00Z"),
      },
      { batchSize: 5 },
    );
    assert.equal(summary.retried, 1);
    assert.equal(summary.failed, 0);
    const stored = rows.get("job-1")!;
    assert.equal(stored.status, "pending");
    assert.equal(stored.attempts, 4);
  });
});

describe("processIntegrationJobs — the top-up re-read", () => {
  // The guard that shipped without tests: the job carries an amount
  // frozen at enqueue time, so an admin who undoes a verify must not have
  // the supplier funded a minute later for a payment we un-collected.
  it("a top-up that is no longer completed is not funded", async () => {
    const { supabase, rows } = makeMockSupabase([baseJob()], {
      status: "pending",
    });
    const summary = await processIntegrationJobs(
      {
        supabase,
        ...okAdapter,
        env: ARMED,
        now: () => new Date("2026-08-30T10:00:00Z"),
      },
      { batchSize: 5 },
    );
    assert.equal(summary.succeeded, 0);
    assert.equal(summary.failed, 1);
    // Terminal, not retried: it is a decision, and asking again every
    // minute answers the same way for ever.
    assert.equal(rows.get("job-1")!.status, "failed");
  });

  it("a top-up that is gone is not funded either", async () => {
    const { supabase } = makeMockSupabase([baseJob()], null);
    const summary = await processIntegrationJobs(
      {
        supabase,
        ...okAdapter,
        env: ARMED,
        now: () => new Date("2026-08-30T10:00:00Z"),
      },
      { batchSize: 5 },
    );
    assert.equal(summary.succeeded, 0);
    assert.equal(summary.failed, 1);
  });
});

describe("processIntegrationJobs — terminal failure", () => {
  it("exceeded attempts move to failed", async () => {
    const { supabase, rows } = makeMockSupabase([
      baseJob({ attempts: 4, max_attempts: 5 }),
    ]);
    const summary = await processIntegrationJobs(
      {
        supabase,
        ...brokenAdapter,
        env: ARMED,
        now: () => new Date("2026-08-30T10:00:00Z"),
      },
      { batchSize: 5 },
    );
    assert.equal(summary.failed, 1);
    const stored = rows.get("job-1")!;
    assert.equal(stored.status, "failed");
    assert.equal(stored.last_error, "boom");
    assert.ok(stored.finished_at);
  });

  it("non-retryable error fails immediately", async () => {
    const { supabase, rows } = makeMockSupabase([
      baseJob({ provider: "supplier1", operation: "unknown-op" }),
    ]);
    const summary = await processIntegrationJobs(
      { supabase, ...okAdapter, now: () => new Date("2026-08-30T10:00:00Z") },
      { batchSize: 5 },
    );
    assert.equal(summary.failed, 1);
    const stored = rows.get("job-1")!;
    assert.equal(stored.status, "failed");
    assert.match(stored.last_error ?? "", /Unknown job/);
  });
});
