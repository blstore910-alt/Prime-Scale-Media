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
function makeMockSupabase(initial: IntegrationJobRow[]) {
  const rows = new Map<string, IntegrationJobRow>();
  for (const r of initial) rows.set(r.id, { ...r });

  const from = (_table: string) => {
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
    idempotency_key: overrides.idempotency_key ?? "key-1",
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

describe("processIntegrationJobs — success path", () => {
  it("succeeded run marks job succeeded with result", async () => {
    const { supabase, rows } = makeMockSupabase([baseJob()]);
    const summary = await processIntegrationJobs(
      { supabase, ...okAdapter, now: () => new Date("2026-08-30T10:00:00Z") },
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

describe("processIntegrationJobs — terminal failure", () => {
  it("exceeded attempts move to failed", async () => {
    const { supabase, rows } = makeMockSupabase([
      baseJob({ attempts: 4, max_attempts: 5 }),
    ]);
    const summary = await processIntegrationJobs(
      {
        supabase,
        ...brokenAdapter,
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
