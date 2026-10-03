import { test } from "node:test";
import assert from "node:assert/strict";
import { lineFromWiseTransfer, wiseTime } from "../../lib/pure-wise-supplier.ts";

const SINCE = "2026-10-03T00:00:00Z";
const base = { id: "123", created: "2026-10-04 09:30:00", status: "outgoing_payment_sent", targetCurrency: "USD", targetValue: 2500 };

test("USD received: the full amount, confirmed", () => {
  const l = lineFromWiseTransfer(base, 0.888691, SINCE)!;
  assert.equal(l.amount, 2500);
  assert.equal(l.sentAmount, 2500);
  assert.equal(l.sentCurrency, "USD");
  assert.equal(l.usdConfirmed, true);
  assert.equal(l.day, "2026-10-04");
  assert.equal(l.externalRef, "wise:123");
});

test("EUR received: an estimate at our rate, NOT confirmed", () => {
  // the live payment of 9 July: EUR 1,500 received
  const l = lineFromWiseTransfer({ ...base, targetCurrency: "EUR", targetValue: 1500 }, 0.888691, SINCE)!;
  assert.equal(l.sentCurrency, "EUR");
  assert.equal(l.sentAmount, 1500);
  assert.equal(l.amount, 1687.88); // 1500 / 0.888691 = 1687.876...
  assert.equal(l.usdConfirmed, false);
});

test("EUR without a rate is still booked, at zero, unconfirmed", () => {
  const l = lineFromWiseTransfer({ ...base, targetCurrency: "EUR", targetValue: 1500 }, null, SINCE)!;
  assert.equal(l.amount, 0);
  assert.equal(l.usdConfirmed, false);
});

test("only payments that went out, from the cut-off on, in USD or EUR", () => {
  assert.equal(lineFromWiseTransfer({ ...base, status: "cancelled" }, 0.9, SINCE), null);
  assert.equal(lineFromWiseTransfer({ ...base, status: "processing" }, 0.9, SINCE), null);
  assert.equal(lineFromWiseTransfer({ ...base, created: "2026-07-09 13:03:01" }, 0.9, SINCE), null);
  assert.equal(lineFromWiseTransfer({ ...base, targetCurrency: "HKD" }, 0.9, SINCE), null);
  assert.equal(lineFromWiseTransfer({ ...base, targetValue: 0 }, 0.9, SINCE), null);
});

test("Wise time without a zone is UTC", () => {
  assert.equal(wiseTime("2026-10-03 00:00:00"), Date.parse("2026-10-03T00:00:00Z"));
  assert.equal(wiseTime("2026-10-03T00:00:00.000Z"), Date.parse("2026-10-03T00:00:00Z"));
  assert.ok(Number.isNaN(wiseTime("")));
});
