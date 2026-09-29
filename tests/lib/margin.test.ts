import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  invoiceMoneyKind,
  isKnownInvoiceType,
  whatWeKeep,
} from "../../lib/pure-margin.ts";

/**
 * THE REGRESSION THIS FILE EXISTS FOR
 *
 * 29-09: the "what we keep" panel summed every paid invoice and
 * reported EUR 1,885.04 where the real figure is EUR 122.34 — fifteen
 * times too big, on the screen that answers "are we making anything".
 *
 * A wallet top-up invoice is the customer's own money going into their
 * own wallet; an ad-account top-up invoice is gross spend on its way to
 * the supplier. Neither is income, and the fee inside the second one is
 * already counted from `top_ups.fee_amount`.
 */

test("a customer funding their own wallet is not our income", () => {
  assert.equal(invoiceMoneyKind("wallet_topup"), "through");
});

test("gross ad spend on its way to the supplier is not our income", () => {
  assert.equal(invoiceMoneyKind("ad_account_topup"), "through");
});

test("a subscription is ours", () => {
  assert.equal(invoiceMoneyKind("subscription"), "income");
});

test("case and padding do not decide whether money is ours", () => {
  assert.equal(invoiceMoneyKind("  Wallet_Topup "), "through");
  assert.equal(invoiceMoneyKind("SUBSCRIPTION"), "income");
});

test("an invoice type nobody has classified is NOT treated as income", () => {
  // The cautious direction. Understating the margin is visible and
  // someone complains; overstating it is invisible, and that is the
  // bug this whole file is about.
  assert.equal(invoiceMoneyKind("some_new_thing"), "through");
  assert.equal(invoiceMoneyKind(null), "through");
  assert.equal(invoiceMoneyKind(undefined), "through");
  assert.equal(invoiceMoneyKind(""), "through");
});

test("a new type is reported as unknown so it gets classified", () => {
  assert.equal(isKnownInvoiceType("subscription"), true);
  assert.equal(isKnownInvoiceType("wallet_topup"), true);
  assert.equal(isKnownInvoiceType("some_new_thing"), false);
  assert.equal(isKnownInvoiceType(null), false);
});

test("the real figures from 29-09 come out at EUR 122.34", () => {
  // Measured on production:
  //   fee on ad-account funding   EUR    22.30  (8x)
  //   subscriptions paid          EUR   180.00  (5x)
  //   DST billed on               EUR    20.00  (1x)
  //   affiliate commission paid   EUR    99.96  (6x)   cost
  //   wallet top-ups              EUR 1,165.00  (6x)   through
  //   ad spend                    EUR   597.70  (8x)   through
  const kept = whatWeKeep([
    { amount: 22.3, kind: "income" },
    { amount: 180.0, kind: "income" },
    { amount: 20.0, kind: "income" },
    { amount: 99.96, kind: "cost" },
    { amount: 1165.0, kind: "through" },
    { amount: 597.7, kind: "through" },
  ]);
  assert.equal(kept, 122.34);
});

test("pass-through cannot move the total, however large", () => {
  const without = whatWeKeep([{ amount: 50, kind: "income" }]);
  const with_ = whatWeKeep([
    { amount: 50, kind: "income" },
    { amount: 9_999_999.99, kind: "through" },
  ]);
  assert.equal(without, with_);
});

test("what we keep can be negative, and says so", () => {
  // Commission owed on a month with no subscriptions is a real state,
  // and clamping it at zero would hide exactly the month worth seeing.
  assert.equal(whatWeKeep([{ amount: 120, kind: "cost" }]), -120);
});

test("the running total is rounded at every step, not just at the end", () => {
  // Three additions of two-decimal money is enough for JS to produce
  // 0.30000000000000004, and this figure is printed as currency.
  assert.equal(
    whatWeKeep([
      { amount: 0.1, kind: "income" },
      { amount: 0.2, kind: "income" },
    ]),
    0.3,
  );
  assert.equal(
    whatWeKeep([
      { amount: 22.3, kind: "income" },
      { amount: 0.1, kind: "income" },
      { amount: 0.2, kind: "income" },
    ]),
    22.6,
  );
});

test("no lines is zero, not NaN", () => {
  assert.equal(whatWeKeep([]), 0);
});
