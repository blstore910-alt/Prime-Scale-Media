import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { mockSeamxAdapter, getSeamxAdapter } from "../../lib/integrations/seamx.ts";
import { mockWiseAdapter, getWiseAdapter } from "../../lib/integrations/wise.ts";

describe("seamx mock adapter", () => {
  it("listAdAccounts returns the deterministic dataset", async () => {
    const res = await mockSeamxAdapter.listAdAccounts();
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.ok(res.data.length >= 1);
    for (const acc of res.data) {
      assert.equal(typeof acc.external_id, "string");
      assert.ok(
        ["meta-ads", "tiktok-ads", "google-ads"].includes(acc.platform),
      );
    }
  });

  it("pushTopup refuses without idempotency_key", async () => {
    const res = await mockSeamxAdapter.pushTopup({
      external_ad_account_id: "seamx-mock-001",
      amount_cents: 500_00,
      currency: "USD",
      idempotency_key: "",
    });
    assert.equal(res.ok, false);
  });

  it("pushTopup succeeds with a key and reports balance-after", async () => {
    const res = await mockSeamxAdapter.pushTopup({
      external_ad_account_id: "seamx-mock-001",
      amount_cents: 500_00,
      currency: "USD",
      idempotency_key: "test-key-1",
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.data.status, "completed");
    assert.ok(res.data.balance_after_cents! > 0);
  });

  it("pushWithdraw queues the request", async () => {
    const res = await mockSeamxAdapter.pushWithdraw({
      external_ad_account_id: "seamx-mock-001",
      amount_cents: 100_00,
      currency: "USD",
      idempotency_key: "test-key-w1",
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.data.status, "queued");
  });
});

describe("wise mock adapter", () => {
  it("listIncomingSince refuses when sinceIso is missing", async () => {
    const res = await mockWiseAdapter.listIncomingSince("");
    assert.equal(res.ok, false);
  });

  it("listIncomingSince returns a transfer with a reference", async () => {
    const res = await mockWiseAdapter.listIncomingSince(
      "2026-08-01T00:00:00Z",
    );
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.ok(res.data.length >= 1);
    assert.equal(typeof res.data[0].reference, "string");
  });
});

describe("adapter selection", () => {
  it("defaults to mock when SEAMX_MODE unset", () => {
    delete process.env.SEAMX_MODE;
    const adapter = getSeamxAdapter();
    assert.equal(adapter, mockSeamxAdapter);
  });

  it("selects real adapter when SEAMX_MODE=live", () => {
    process.env.SEAMX_MODE = "live";
    const adapter = getSeamxAdapter();
    // Real one just returns not-implemented — verify by shape.
    assert.notEqual(adapter, mockSeamxAdapter);
    delete process.env.SEAMX_MODE;
  });

  it("wise defaults to mock too", () => {
    delete process.env.WISE_MODE;
    const adapter = getWiseAdapter();
    assert.equal(adapter, mockWiseAdapter);
  });
});
