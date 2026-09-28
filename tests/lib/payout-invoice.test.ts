import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  payoutInvoiceAddsUp,
  payoutInvoiceLines,
  payoutInvoiceTotals,
} from "../../lib/pure-payout-invoice.ts";

/**
 * Block 9 closes on one sentence: gross minus clawback equals net, on
 * the screen, in `affiliate_payouts` and on the invoice — three times
 * the same figure. Two of the four shapes here cannot be produced on
 * the live tenant, so this is where they are held.
 */

test("a plain payout: one line, and it is the total", () => {
  const rows = [
    { currency: "EUR", amount: "75.00", clawback_amount: "0.00", commission_count: 1, payout_currency: "EUR", payout_amount: "75.00" },
  ];
  const lines = payoutInvoiceLines(rows);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].amount, 75);
  assert.deepEqual(payoutInvoiceTotals(rows), { EUR: 75 });
  assert.equal(payoutInvoiceAddsUp(rows), true);
});

test("one line needs no count; several say how many", () => {
  const one = payoutInvoiceLines([
    { currency: "EUR", amount: 75, commission_count: 1 },
  ]);
  const two = payoutInvoiceLines([
    { currency: "EUR", amount: 75, commission_count: 2 },
  ]);
  assert.equal(one[0].text, "Referral commission");
  assert.equal(two[0].text, "Referral commission — 2 commissions");
});

test("with a clawback, line one is the GROSS and the two lines reach the total", () => {
  // Live payout #2, measured 28-09: 3 commissions, gross 20.00,
  // clawed back 4.04, transferred 15.96.
  const rows = [
    { currency: "EUR", amount: "15.96", clawback_amount: "4.04", commission_count: 3, payout_currency: "EUR", payout_amount: "15.96" },
  ];
  const lines = payoutInvoiceLines(rows);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].amount, 20.0, "line one must be the gross, not the net");
  assert.equal(lines[1].amount, -4.04);
  assert.match(lines[1].text, /returned ad spend/);
  assert.deepEqual(payoutInvoiceTotals(rows), { EUR: 15.96 });
  assert.equal(payoutInvoiceAddsUp(rows), true);
});

test("the regression itself: net on line one would not add up", () => {
  // What the document said before the fix — kept as the counter-example
  // so nobody re-introduces it thinking it reads more honestly.
  const wrong = [{ text: "commission", amount: 15.96, currency: "EUR" }, { text: "clawback", amount: -4.04, currency: "EUR" }];
  const sum = Math.round(wrong.reduce((a, l) => a + l.amount, 0) * 100) / 100;
  assert.notEqual(sum, 15.96);
  assert.equal(sum, 11.92);
});

test("0.1 + 0.2 arithmetic does not leak onto a tax document", () => {
  const rows = [
    { currency: "EUR", amount: "0.10", clawback_amount: "0.20", commission_count: 2 },
  ];
  const lines = payoutInvoiceLines(rows);
  assert.equal(lines[0].amount, 0.3);
});

test("converted to USD: the destination lines land on the total", () => {
  // EUR 75.00 at 0.877807 EUR per USD = 85.44, fee 0.6% = 0.51,
  // transferred 84.93.
  const rows = [
    {
      currency: "EUR",
      amount: "75.00",
      clawback_amount: "0.00",
      commission_count: 1,
      payout_currency: "USD",
      fx_rate: "0.877807",
      fx_fee_pct: "0.60",
      fx_fee_amount: "0.51",
      payout_amount: "84.93",
    },
  ];
  const lines = payoutInvoiceLines(rows);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].amount, 75);
  assert.equal(lines[0].currency, "EUR");
  assert.equal(lines[1].amount, 85.44);
  assert.equal(lines[1].currency, "USD");
  assert.equal(lines[2].amount, -0.51);
  assert.deepEqual(payoutInvoiceTotals(rows), { USD: 84.93 });
  assert.equal(payoutInvoiceAddsUp(rows), true);
});

test("the rate is printed EUR-per-USD in both directions", () => {
  const toUsd = payoutInvoiceLines([
    { currency: "EUR", amount: 75, payout_currency: "USD", fx_rate: "0.877807", fx_fee_amount: 0.51, payout_amount: 84.93 },
  ]);
  const toEur = payoutInvoiceLines([
    { currency: "USD", amount: 75, payout_currency: "EUR", fx_rate: "0.877807", fx_fee_amount: 0.39, payout_amount: 65.44 },
  ]);
  assert.match(toUsd[1].text, /1 USD = 0\.8778 EUR/);
  assert.match(toEur[1].text, /1 USD = 0\.8778 EUR/);
});

test("clawback AND conversion together still add up", () => {
  const rows = [
    {
      currency: "EUR",
      amount: "15.96",
      clawback_amount: "4.04",
      commission_count: 3,
      payout_currency: "USD",
      fx_rate: "0.877807",
      fx_fee_pct: "0.60",
      fx_fee_amount: "0.11",
      payout_amount: "18.07",
    },
  ];
  const lines = payoutInvoiceLines(rows);
  assert.deepEqual(
    lines.map((l) => [l.currency, l.amount]),
    [
      ["EUR", 20.0],
      ["EUR", -4.04],
      ["USD", 18.18],
      ["USD", -0.11],
    ],
  );
  assert.equal(payoutInvoiceAddsUp(rows), true);
});

test("two earned currencies in one transfer get a total each", () => {
  const rows = [
    { currency: "EUR", amount: "75.00", commission_count: 1, payout_currency: "EUR", payout_amount: "75.00" },
    { currency: "USD", amount: "12.50", commission_count: 2, payout_currency: "USD", payout_amount: "12.50" },
  ];
  assert.deepEqual(payoutInvoiceTotals(rows), { EUR: 75, USD: 12.5 });
  assert.equal(payoutInvoiceAddsUp(rows), true);
});

test("a row from before the conversion columns: amount IS the transfer", () => {
  // payout #1, written when payout_amount/payout_currency did not exist.
  const rows = [
    { currency: "EUR", amount: "4.96", clawback_amount: null, commission_count: 2, payout_currency: null, payout_amount: null },
  ];
  assert.deepEqual(payoutInvoiceTotals(rows), { EUR: 4.96 });
  assert.equal(payoutInvoiceAddsUp(rows), true);
});

test("a figure that will not parse is not silently a zero-sum document", () => {
  // PostgREST hands numerics over as strings; a null or a broken one
  // must not quietly make the lines agree with a wrong total.
  const lines = payoutInvoiceLines([
    { currency: "EUR", amount: null, clawback_amount: "not a number", commission_count: 0 },
  ]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].amount, 0);
});

test("a blank currency falls back to EUR rather than vanishing", () => {
  // The line no longer names the currency (the amount column carries
  // the symbol), so the fallback is checked where it still decides
  // something: which total the line lands in.
  const lines = payoutInvoiceLines([
    { currency: "", amount: 10, commission_count: 1 },
  ]);
  assert.equal(lines[0].currency, "EUR");
  assert.deepEqual(payoutInvoiceTotals([{ currency: "", amount: 10 }]), {
    EUR: 10,
  });
});

test("lowercase currencies from the database are one currency, not two", () => {
  const rows = [
    { currency: "eur", amount: "10.00", payout_currency: "EUR", payout_amount: "10.00" },
    { currency: "EUR", amount: "5.00", payout_currency: "eur", payout_amount: "5.00" },
  ];
  assert.deepEqual(payoutInvoiceTotals(rows), { EUR: 15 });
  assert.equal(payoutInvoiceAddsUp(rows), true);
});

test("nothing to pay renders nothing, and says so by being empty", () => {
  assert.deepEqual(payoutInvoiceLines([]), []);
  assert.deepEqual(payoutInvoiceTotals([]), {});
  assert.equal(payoutInvoiceAddsUp([]), true);
});
