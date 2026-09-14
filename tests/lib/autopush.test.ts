import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { autoPushGate, autoPushEnabled } from "../../lib/integrations/autopush.ts";
import { enqueueSupplierTopupPush } from "../../lib/integrations/enqueue.ts";
import { processIntegrationJobs } from "../../lib/integrations/worker.ts";

// ── The gate ────────────────────────────────────────────────────────────
// This is the switch that stands between the app and real money leaving a
// real supplier account. Every "off" case below is a case where a customer's
// ad account must NOT be funded automatically.

describe("autoPushGate", () => {
  it("is OFF with a completely empty environment", () => {
    assert.equal(autoPushEnabled({}), false);
  });

  it("is OFF in mock mode even when the flag is on", () => {
    const g = autoPushGate({ SUPPLIER1_MODE: "mock", SUPPLIER1_AUTOPUSH: "on" });
    assert.equal(g.enabled, false);
    assert.match(g.reason, /mock mode/);
  });

  it("is OFF in live mode when the flag is absent", () => {
    const g = autoPushGate({ SUPPLIER1_MODE: "live" });
    assert.equal(g.enabled, false);
    assert.match(g.reason, /SUPPLIER1_AUTOPUSH/);
  });

  it("is OFF for values that only look enabled", () => {
    for (const flag of ["", " ", "off", "false", "0", "no", "mock", "live", "ON!"]) {
      assert.equal(
        autoPushEnabled({ SUPPLIER1_MODE: "live", SUPPLIER1_AUTOPUSH: flag }),
        false,
        `flag ${JSON.stringify(flag)} must not arm auto-push`,
      );
    }
  });

  it("is ON only with live mode AND an explicit on value", () => {
    for (const flag of ["on", "ON", " true ", "1", "yes", "enabled"]) {
      assert.equal(
        autoPushEnabled({ SUPPLIER1_MODE: "live", SUPPLIER1_AUTOPUSH: flag }),
        true,
        `flag ${JSON.stringify(flag)} should arm auto-push`,
      );
    }
  });
});

// ── The enqueue side ────────────────────────────────────────────────────

// Minimal Supabase stub: records every table touched so a test can assert
// that NOTHING was written.
function stubSupabase(rows: Record<string, unknown>) {
  const touched: string[] = [];
  const inserted: Array<{ table: string; values: unknown }> = [];
  return {
    touched,
    inserted,
    client: {
      from(table: string) {
        touched.push(table);
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
          single: async () => ({ data: rows[table] ?? null, error: null }),
          insert: (values: unknown) => {
            inserted.push({ table, values });
            return {
              select: () => ({
                single: async () => ({ data: { id: "job-1" }, error: null }),
              }),
            };
          },
        };
        return chain;
      },
    },
  };
}

const COMPLETED_TOPUP = {
  id: "topup-1",
  tenant_id: "tenant-1",
  account_id: "acct-1",
  status: "completed",
  currency: "usd",
  topup_amount: "250.50",
  is_deleted: false,
};

describe("enqueueSupplierTopupPush", () => {
  it("writes NOTHING and reads NOTHING when the gate is shut", async () => {
    const s = stubSupabase({ top_ups: COMPLETED_TOPUP });
    const res = await enqueueSupplierTopupPush(
      s.client as never,
      { topupId: "topup-1", tenantId: "tenant-1" },
      {},
    );
    assert.equal(res.enqueued, false);
    // The strongest guarantee in this file: with the gate shut the function
    // does not even look at the database, so it cannot queue anything.
    assert.deepEqual(s.touched, []);
    assert.deepEqual(s.inserted, []);
  });

  it("queues a job with the supplier's external id when armed", async () => {
    const s = stubSupabase({
      top_ups: COMPLETED_TOPUP,
      supplier_ad_accounts: {
        external_id: "seamx-9001",
        provider: "supplier1",
        currency: "USD",
      },
    });
    const res = await enqueueSupplierTopupPush(
      s.client as never,
      { topupId: "topup-1", tenantId: "tenant-1" },
      { SUPPLIER1_MODE: "live", SUPPLIER1_AUTOPUSH: "on" },
    );
    assert.equal(res.enqueued, true);
    assert.equal(s.inserted.length, 1);
    const job = s.inserted[0].values as Record<string, never>;
    assert.equal(s.inserted[0].table, "integration_jobs");
    assert.equal(job.idempotency_key, "topup:topup-1");
    assert.equal(job.operation, "push_topup");
    const payload = job.payload as unknown as Record<string, unknown>;
    assert.equal(payload.external_ad_account_id, "seamx-9001");
    assert.equal(payload.amount_cents, 25050);
    assert.equal(payload.currency, "USD");
  });

  // The bug this guards: `topup_amount` is written in USD by the single
  // top-up form but in the payment currency by the bulk dialog, while
  // `currency` always holds the payment currency. Pairing them sent a USD
  // number labelled EUR to the supplier — ~9% overfunding per EUR top-up.
  // Every earlier fixture used USD, the one case where that is invisible.
  it("refuses when the payment currency differs from the ad account's", async () => {
    const s = stubSupabase({
      top_ups: { ...COMPLETED_TOPUP, currency: "eur" },
      supplier_ad_accounts: {
        external_id: "seamx-9001",
        provider: "supplier1",
        currency: "USD",
      },
    });
    const res = await enqueueSupplierTopupPush(
      s.client as never,
      { topupId: "topup-1", tenantId: "tenant-1" },
      { SUPPLIER1_MODE: "live", SUPPLIER1_AUTOPUSH: "on" },
    );
    assert.equal(res.enqueued, false);
    assert.match(res.reason, /ambiguous/);
    assert.equal(s.inserted.length, 0);
  });

  it("refuses when the pool row has no currency at all", async () => {
    const s = stubSupabase({
      top_ups: COMPLETED_TOPUP,
      supplier_ad_accounts: { external_id: "seamx-9001", provider: "supplier1" },
    });
    const res = await enqueueSupplierTopupPush(
      s.client as never,
      { topupId: "topup-1", tenantId: "tenant-1" },
      { SUPPLIER1_MODE: "live", SUPPLIER1_AUTOPUSH: "on" },
    );
    assert.equal(res.enqueued, false);
    assert.match(res.reason, /no currency/);
    assert.equal(s.inserted.length, 0);
  });

  // This test previously asserted the OPPOSITE and blessed a real bug: with
  // EUR/EUR it expected a push of the raw topup_amount labelled EUR. But
  // topup_amount is USD by construction (calculateTopupAmount divides by the
  // rate), so that push would have over-funded the account by 1/rate. Matching
  // labels are not the same as a matching denomination.
  it("refuses EUR/EUR, because topup_amount is stored in USD", async () => {
    const s = stubSupabase({
      top_ups: { ...COMPLETED_TOPUP, currency: "eur" },
      supplier_ad_accounts: {
        external_id: "seamx-9001",
        provider: "supplier1",
        currency: "eur",
      },
    });
    const res = await enqueueSupplierTopupPush(
      s.client as never,
      { topupId: "topup-1", tenantId: "tenant-1" },
      { SUPPLIER1_MODE: "live", SUPPLIER1_AUTOPUSH: "on" },
    );
    assert.equal(res.enqueued, false);
    assert.match(res.reason, /stored in USD/);
    assert.equal(s.inserted.length, 0);
  });

  it("refuses a manual (non-supplier) ad account", async () => {
    const s = stubSupabase({ top_ups: COMPLETED_TOPUP }); // no pool row
    const res = await enqueueSupplierTopupPush(
      s.client as never,
      { topupId: "topup-1", tenantId: "tenant-1" },
      { SUPPLIER1_MODE: "live", SUPPLIER1_AUTOPUSH: "on" },
    );
    assert.equal(res.enqueued, false);
    assert.match(res.reason, /not supplier-managed/);
    assert.equal(s.inserted.length, 0);
  });

  it("refuses a top-up that is not completed, and one from another tenant", async () => {
    const pending = stubSupabase({
      top_ups: { ...COMPLETED_TOPUP, status: "pending" },
    });
    const r1 = await enqueueSupplierTopupPush(
      pending.client as never,
      { topupId: "topup-1", tenantId: "tenant-1" },
      { SUPPLIER1_MODE: "live", SUPPLIER1_AUTOPUSH: "on" },
    );
    assert.equal(r1.enqueued, false);
    assert.equal(pending.inserted.length, 0);

    const other = stubSupabase({ top_ups: COMPLETED_TOPUP });
    const r2 = await enqueueSupplierTopupPush(
      other.client as never,
      { topupId: "topup-1", tenantId: "SOMEONE-ELSE" },
      { SUPPLIER1_MODE: "live", SUPPLIER1_AUTOPUSH: "on" },
    );
    assert.equal(r2.enqueued, false);
    assert.equal(other.inserted.length, 0);
  });

  it("treats a duplicate-key collision as already queued, not a failure", async () => {
    const client = {
      from(table: string) {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({
            data:
              table === "top_ups"
                ? COMPLETED_TOPUP
                : {
                    external_id: "seamx-9001",
                    provider: "supplier1",
                    currency: "USD",
                  },
            error: null,
          }),
          insert: () => ({
            select: () => ({
              single: async () => ({ data: null, error: { code: "23505" } }),
            }),
          }),
        };
        return chain;
      },
    };
    const res = await enqueueSupplierTopupPush(
      client as never,
      { topupId: "topup-1", tenantId: "tenant-1" },
      { SUPPLIER1_MODE: "live", SUPPLIER1_AUTOPUSH: "on" },
    );
    assert.equal(res.enqueued, true);
    assert.match(res.reason, /already queued/);
  });

  it("never throws when the database errors", async () => {
    const client = {
      from() {
        throw new Error("connection reset");
      },
    };
    const res = await enqueueSupplierTopupPush(
      client as never,
      { topupId: "topup-1", tenantId: "tenant-1" },
      { SUPPLIER1_MODE: "live", SUPPLIER1_AUTOPUSH: "on" },
    );
    assert.equal(res.enqueued, false);
    assert.match(res.reason, /enqueue threw/);
  });
});

// ── The worker side ─────────────────────────────────────────────────────
// Second layer: even if a money job somehow exists, a shut gate must stop it
// before any adapter method is reached.

function workerStub(job: Record<string, unknown>) {
  const updates: Array<Record<string, unknown>> = [];
  let claimed = false;
  const supabase = {
    from() {
      const chain: Record<string, unknown> = {
        select: () => chain,
        in: () => chain,
        lte: () => chain,
        order: () => chain,
        limit: async () => ({ data: claimed ? [] : [job], error: null }),
        update: (values: Record<string, unknown>) => {
          updates.push(values);
          const after = {
            eq: () => after,
            select: () => after,
            maybeSingle: async () => {
              claimed = true;
              return {
                data: { ...job, status: "processing", attempts: 1 },
                error: null,
              };
            },
            then: (r: (v: unknown) => unknown) => Promise.resolve(r(undefined)),
          };
          return after;
        },
      };
      return chain;
    },
  };
  return { supabase, updates };
}

describe("worker auto-push gate", () => {
  it("holds a supplier money job and refunds its attempt when the gate is shut", async () => {
    const calls: string[] = [];
    const { supabase, updates } = workerStub({
      id: "job-1",
      provider: "supplier1",
      operation: "push_topup",
      status: "pending",
      attempts: 0,
      max_attempts: 5,
      payload: { external_ad_account_id: "seamx-9001", amount_cents: 1000, currency: "USD" },
      idempotency_key: "topup:topup-1",
    });

    const res = await processIntegrationJobs({
      supabase: supabase as never,
      supplier1: {
        pushTopup: async () => {
          calls.push("pushTopup");
          return { ok: true, data: {} } as never;
        },
      } as never,
      wise: {} as never,
      env: { SUPPLIER1_MODE: "live" }, // live, but AUTOPUSH not set
      now: () => new Date("2026-09-13T00:00:00Z"),
    });

    // The adapter was never called — no request left the process.
    assert.deepEqual(calls, []);
    assert.equal(res.blocked, 1);
    assert.equal(res.succeeded, 0);
    assert.equal(res.failed, 0);

    // And the job is back to pending with its attempt refunded, so it ages
    // not at all and is still there if the gate is opened on purpose.
    const release = updates[updates.length - 1];
    assert.equal(release.status, "pending");
    assert.equal(release.attempts, 0);
    assert.match(String(release.last_error), /held:/);
  });

  it("dispatches the same job once the gate is armed", async () => {
    const calls: string[] = [];
    const { supabase } = workerStub({
      id: "job-1",
      provider: "supplier1",
      operation: "push_topup",
      status: "pending",
      attempts: 0,
      max_attempts: 5,
      payload: { external_ad_account_id: "seamx-9001", amount_cents: 1000, currency: "USD" },
      idempotency_key: "topup:topup-1",
    });

    const res = await processIntegrationJobs({
      supabase: supabase as never,
      supplier1: {
        pushTopup: async () => {
          calls.push("pushTopup");
          return { ok: true, data: { status: "completed" } } as never;
        },
      } as never,
      wise: {} as never,
      env: { SUPPLIER1_MODE: "live", SUPPLIER1_AUTOPUSH: "on" },
      now: () => new Date("2026-09-13T00:00:00Z"),
    });

    assert.deepEqual(calls, ["pushTopup"]);
    assert.equal(res.blocked, 0);
    assert.equal(res.succeeded, 1);
  });

  it("does not hold read-only supplier work", async () => {
    const calls: string[] = [];
    const { supabase } = workerStub({
      id: "job-2",
      provider: "supplier1",
      operation: "sync_ad_accounts",
      status: "pending",
      attempts: 0,
      max_attempts: 5,
      payload: {},
      idempotency_key: "sync:1",
    });

    const res = await processIntegrationJobs({
      supabase: supabase as never,
      supplier1: {
        listAdAccounts: async () => {
          calls.push("listAdAccounts");
          return { ok: true, data: [] } as never;
        },
      } as never,
      wise: {} as never,
      env: { SUPPLIER1_MODE: "live" }, // AUTOPUSH off — reads still run
      now: () => new Date("2026-09-13T00:00:00Z"),
    });

    assert.deepEqual(calls, ["listAdAccounts"]);
    assert.equal(res.blocked, 0);
    assert.equal(res.succeeded, 1);
  });
});
