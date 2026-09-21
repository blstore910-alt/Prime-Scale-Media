import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  unpaidSubscriptionInvoices,
  unpaidTotalsByCurrency,
  unpaidTotalsText,
  walletCurrencyOf,
} from "../../lib/pure-invoice-due.ts";

const inv = (o: Record<string, unknown>) => ({
  type: "subscription",
  status: "unpaid",
  total: 5,
  currency: "EUR",
  created_at: "2026-09-01T00:00:00Z",
  ...o,
});

describe("walletCurrencyOf", () => {
  it("follows the RPC: NULL is EUR, case-insensitive", () => {
    assert.equal(walletCurrencyOf({ currency: null }), "EUR");
    assert.equal(walletCurrencyOf({ currency: " usd " }), "USD");
    assert.equal(walletCurrencyOf({ currency: "USD" }), "USD");
    assert.equal(walletCurrencyOf(undefined), "EUR");
  });
});

describe("unpaidSubscriptionInvoices", () => {
  it("is empty for nothing, and does not throw on null", () => {
    assert.deepEqual(unpaidSubscriptionInvoices(null), []);
    assert.deepEqual(unpaidSubscriptionInvoices([]), []);
  });

  it("drops paid and void, keeps adjustments", () => {
    const rows = [
      inv({ status: "paid" }),
      inv({ status: "void" }),
      inv({ type: "manual_invoice" }),
      inv({ type: "subscription_adjustment", total: 50 }),
      inv({ total: 5 }),
    ];
    const out = unpaidSubscriptionInvoices(rows);
    assert.equal(out.length, 2);
    assert.ok(out.every((r) => r.status === "unpaid"));
  });

  it("puts the OLDEST first — the one being dunned", () => {
    const old = inv({ created_at: "2026-08-01T00:00:00Z", total: 200 });
    const recent = inv({ created_at: "2026-09-20T00:00:00Z", total: 5 });
    const out = unpaidSubscriptionInvoices([recent, old]);
    assert.equal(out[0].total, 200);
  });

  it("a missing created_at does not crash the sort", () => {
    const out = unpaidSubscriptionInvoices([
      inv({ created_at: null, total: 1 }),
      inv({ total: 2 }),
    ]);
    assert.equal(out.length, 2);
  });
});

describe("unpaidTotalsByCurrency", () => {
  // THE REGRESSION THIS FILE EXISTS FOR: the non-empty path. A reduce
  // over an empty array never calls its callback, which is how a
  // ReferenceError inside it survived to production and took the whole
  // customer app down for anyone with one open invoice.
  it("adds up one invoice", () => {
    assert.deepEqual(unpaidTotalsByCurrency([inv({ total: 5 })]), { EUR: 5 });
  });

  it("adds up two in the same currency", () => {
    assert.deepEqual(
      unpaidTotalsByCurrency([inv({ total: 5 }), inv({ total: 200 })]),
      { EUR: 205 },
    );
  });

  it("keeps currencies apart", () => {
    assert.deepEqual(
      unpaidTotalsByCurrency([
        inv({ total: 200 }),
        inv({ total: 500, currency: "USD" }),
      ]),
      { EUR: 200, USD: 500 },
    );
  });

  it("does not let a non-numeric total become NaN", () => {
    assert.deepEqual(
      unpaidTotalsByCurrency([inv({ total: null }), inv({ total: "12.34" })]),
      { EUR: 12.34 },
    );
  });

  it("rounds at the cent, every step", () => {
    assert.deepEqual(
      unpaidTotalsByCurrency([
        inv({ total: 0.1 }),
        inv({ total: 0.2 }),
      ]),
      { EUR: 0.3 },
    );
  });
});

describe("unpaidTotalsText", () => {
  it("says nothing when nothing is owed", () => {
    assert.equal(unpaidTotalsText({}), "");
  });

  it("one currency", () => {
    assert.equal(unpaidTotalsText({ EUR: 205 }), "€205.00");
  });

  it("never sums two currencies under one symbol", () => {
    // EUR 200 + USD 500 must not read "€700.00" — a figure that exists
    // in no currency.
    const text = unpaidTotalsText({ EUR: 200, USD: 500 });
    assert.equal(text, "€200.00 + $500.00");
    assert.ok(!text.includes("700"));
  });
});
