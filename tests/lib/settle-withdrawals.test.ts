import test from "node:test";
import assert from "node:assert/strict";

import {
  settleWithdrawalsAtSupplier,
  type SettleDb,
} from "../../lib/integrations/settle-withdrawals";

type Call = { fn: string; args: Record<string, unknown> };

function db(rows: unknown, readError: unknown = null, rpcError: unknown = null) {
  const calls: Call[] = [];
  const api = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data: rows, error: readError }),
          }),
        }),
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { error: rpcError };
    },
  };
  // Cast at the seam, once. The function takes the real client's type
  // so the cron can pass the real client; a stub only has the handful
  // of builder methods this path walks.
  return { api: api as unknown as SettleDb, calls };
}

const supplier = (status: "queued" | "completed" | "failed") => ({
  async getWithdraw(id: string) {
    return {
      ok: true as const,
      data: {
        external_withdraw_id: id,
        status,
        balance_after_cents: null,
      },
    };
  },
});

const brokenSupplier = {
  async getWithdraw() {
    return { ok: false as const, error: "network", retryable: true };
  },
};

const ROW = {
  id: "w1",
  external_withdraw_id: "SX-1",
  sent_to_supplier_at: "2026-09-27T10:00:00.000Z",
  reference: "WD-000123",
};

test("completed settles, and settle is the only write", async () => {
  const { api, calls } = db([ROW]);
  const out = await settleWithdrawalsAtSupplier(api, supplier("completed"));
  assert.equal(out.settled, 1);
  assert.equal(out.failed, 0);
  assert.equal(out.stillWaiting, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fn, "ad_account_withdrawal_settle");
  assert.equal(calls[0].args.p_withdrawal_id, "w1");
  assert.equal(calls[0].args.p_external_id, "SX-1");
});

test("queued credits NOTHING — that is the whole point of waiting", async () => {
  const { api, calls } = db([ROW]);
  const out = await settleWithdrawalsAtSupplier(api, supplier("queued"));
  assert.equal(out.stillWaiting, 1);
  assert.equal(out.settled, 0);
  assert.equal(calls.length, 0, "no wallet may move on an unconfirmed push");
});

test("failed goes back to the desk, and does not credit", async () => {
  const { api, calls } = db([ROW]);
  const out = await settleWithdrawalsAtSupplier(api, supplier("failed"));
  assert.equal(out.failed, 1);
  assert.equal(out.settled, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fn, "ad_account_withdrawal_supplier_failed");
});

test("a failed READ is not a failed withdrawal", async () => {
  // A network blip must not push a real withdrawal back to the desk.
  const { api, calls } = db([ROW]);
  const out = await settleWithdrawalsAtSupplier(api, brokenSupplier);
  assert.equal(out.checked, 1);
  assert.equal(out.settled, 0);
  assert.equal(out.failed, 0);
  assert.equal(calls.length, 0, "nothing is written on a read we could not make");
  assert.equal(out.errors.length, 1);
  assert.match(out.errors[0], /WD-000123/);
});

test("a read we could not make is not an empty queue", async () => {
  const { api, calls } = db(null, { message: "boom" });
  const out = await settleWithdrawalsAtSupplier(api, supplier("completed"));
  assert.equal(out.checked, 0);
  assert.equal(calls.length, 0);
  assert.equal(out.errors.length, 1, "the run says so instead of reporting zero");
});

test("a row with no supplier id is NAMED, not silently skipped", async () => {
  // Marked as sent on our side, never sent on theirs: the status moved
  // and the push never queued. Asking with an empty id would read some
  // other withdrawal, so there is nothing to poll -- but a customer's
  // wallet is waiting on it, so it must not go quiet.
  const { api, calls } = db([{ ...ROW, external_withdraw_id: "  " }]);
  const out = await settleWithdrawalsAtSupplier(api, supplier("completed"));
  assert.equal(out.checked, 0);
  assert.equal(calls.length, 0);
  assert.deepEqual(out.stuck, ["WD-000123"]);
});

test("a settle that fails is reported, not counted as settled", async () => {
  const { api } = db([ROW], null, { message: "locked" });
  const out = await settleWithdrawalsAtSupplier(api, supplier("completed"));
  assert.equal(out.settled, 0);
  assert.equal(out.errors.length, 1);
});

test("a withdrawal sitting there for a day and a half is named", async () => {
  const { api } = db([ROW]);
  const out = await settleWithdrawalsAtSupplier(
    api,
    supplier("queued"),
    new Date("2026-09-29T00:00:00.000Z"),
  );
  assert.deepEqual(out.stale, ["WD-000123"]);
  assert.equal(out.stillWaiting, 1, "stale is a warning, not a decision");
});

test("a fresh one is not called stale", async () => {
  const { api } = db([ROW]);
  const out = await settleWithdrawalsAtSupplier(
    api,
    supplier("queued"),
    new Date("2026-09-27T11:00:00.000Z"),
  );
  assert.deepEqual(out.stale, []);
});

test("an empty queue is an honest zero", async () => {
  const { api, calls } = db([]);
  const out = await settleWithdrawalsAtSupplier(api, supplier("completed"));
  assert.deepEqual(
    {
      ...out,
      stale: out.stale.length,
      errors: out.errors.length,
      stuck: out.stuck.length,
    },
    {
      checked: 0,
      settled: 0,
      failed: 0,
      stillWaiting: 0,
      stale: 0,
      errors: 0,
      stuck: 0,
    },
  );
  assert.equal(calls.length, 0);
});

test("several rows are each decided on their own", async () => {
  const rows = [
    ROW,
    { ...ROW, id: "w2", external_withdraw_id: "SX-2", reference: "WD-2" },
  ];
  const { api, calls } = db(rows);
  const out = await settleWithdrawalsAtSupplier(api, supplier("completed"));
  assert.equal(out.checked, 2);
  assert.equal(out.settled, 2);
  assert.deepEqual(
    calls.map((c) => c.args.p_external_id),
    ["SX-1", "SX-2"],
  );
});
