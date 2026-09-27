import { test } from "node:test";
import assert from "node:assert/strict";

import { paidInPeriod, type PaidRow } from "../../lib/pure-affiliate-paid";

const rows: PaidRow[] = [
  { status: "paid", currency: "EUR", amount: 4.96, paid_at: "2026-09-22T19:23:25Z" },
  { status: "paid", currency: "EUR", amount: 15.96, paid_at: "2026-09-25T14:44:29Z" },
  { status: "requested", currency: "EUR", amount: 99, paid_at: null },
  { status: "rejected", currency: "EUR", amount: 50, paid_at: "2026-09-24T10:00:00Z" },
  { status: "paid", currency: "USD", amount: 18.19, paid_at: "2026-09-25T14:44:29Z" },
];

test("all time is every settled row", () => {
  assert.deepEqual(paidInPeriod(rows), { eur: 20.92, usd: 18.19 });
});

test("only what was really paid counts", () => {
  // requested and rejected are not payments
  const v = paidInPeriod(rows, "2026-09-24", "2026-09-24");
  assert.deepEqual(v, { eur: 0, usd: 0 });
});

test("a period takes what fell inside it", () => {
  assert.deepEqual(paidInPeriod(rows, "2026-09-25", "2026-09-25"), {
    eur: 15.96,
    usd: 18.19,
  });
});

/**
 * The fault this replaces. The old tile computed
 * max(0, earnings - unpaid), and on 24 Sep -- two clawbacks booked,
 * neither yet attached to a payout -- `unpaid` went negative and the
 * subtraction added it back, reading "Paid out EUR 4.04" on a day
 * nothing was paid.
 */
test("a clawback cannot invent a payment", () => {
  // Whatever the clawbacks did, a day with no settled payout is zero.
  assert.deepEqual(paidInPeriod(rows, "2026-09-23", "2026-09-24"), {
    eur: 0,
    usd: 0,
  });
});

test("the currencies are never added together", () => {
  const v = paidInPeriod(rows);
  assert.notEqual(v.eur, v.eur + v.usd);
  assert.equal(v.usd, 18.19);
});

test("a settled row with no date counts for all time and no narrower period", () => {
  const odd: PaidRow[] = [
    { status: "paid", currency: "EUR", amount: 10, paid_at: null },
  ];
  assert.equal(paidInPeriod(odd).eur, 10);
  assert.equal(paidInPeriod(odd, "2026-09-01", "2026-09-30").eur, 0);
});

test("nonsense amounts are skipped rather than coerced", () => {
  const odd: PaidRow[] = [
    { status: "paid", currency: "EUR", amount: "abc", paid_at: "2026-09-25" },
    { status: "paid", currency: "EUR", amount: -5, paid_at: "2026-09-25" },
    { status: "paid", currency: "EUR", amount: "7.50", paid_at: "2026-09-25" },
  ];
  assert.equal(paidInPeriod(odd).eur, 7.5);
});

test("nothing at all is zero, not a crash", () => {
  assert.deepEqual(paidInPeriod(null), { eur: 0, usd: 0 });
  assert.deepEqual(paidInPeriod([]), { eur: 0, usd: 0 });
});
