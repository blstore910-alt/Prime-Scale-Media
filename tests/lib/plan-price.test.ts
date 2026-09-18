import test from "node:test";
import assert from "node:assert/strict";
import {
  niceRound,
  suggestPrice,
  planPrice,
  yearlySaving,
  hasYearlyOption,
  yearlyDiscountPct,
} from "../../lib/pure-plan-price.ts";

// The owner's own three numbers, which are the specification:
//   "200eu plan mag dan 225 USD zijn per maand ipv 229 is lelijk,
//    150eu plan mag dan 170 USD en 75eu plan mag 85 usd"
test("the suggestion reproduces the prices the owner named", () => {
  const RATE = 1.13;
  assert.equal(suggestPrice(200, RATE), 225);
  assert.equal(suggestPrice(150, RATE), 170);
  assert.equal(suggestPrice(75, RATE), 85);
});

test("nearest, not ceiling — 226 becomes 225", () => {
  assert.equal(niceRound(226.14), 225);
  assert.equal(niceRound(227.6), 230);
});

test("small amounts step by 1, so a €5 plan is not rounded to $5", () => {
  assert.equal(suggestPrice(5, 1.13), 6);
  assert.equal(niceRound(12.4), 12);
});

test("no rate and no price yields nothing rather than zero", () => {
  assert.equal(suggestPrice(200, null), null);
  assert.equal(suggestPrice(null, 1.13), null);
  assert.equal(suggestPrice(200, 0), null);
});

test("a pinned price wins over any conversion", () => {
  const plan = { currency: "EUR", monthly_fee: 200, monthly_fee_usd: 225 };
  const usd = planPrice(plan, "USD", "month", 1.09);
  assert.equal(usd.amount, 225);
  assert.equal(usd.pinned, true);
});

test("the base currency is always pinned — it is the price as entered", () => {
  const plan = { currency: "EUR", monthly_fee: 200 };
  const eur = planPrice(plan, "EUR", "month", 1.13);
  assert.equal(eur.amount, 200);
  assert.equal(eur.pinned, true);
});

test("with nothing pinned it converts, and admits it is not pinned", () => {
  const plan = { currency: "EUR", monthly_fee: 200 };
  const usd = planPrice(plan, "USD", "month", 1.13);
  assert.equal(usd.amount, 225);
  assert.equal(usd.pinned, false);
});

test("a missing rate falls back to the base amount rather than to zero", () => {
  const plan = { currency: "EUR", monthly_fee: 200 };
  const usd = planPrice(plan, "USD", "month", null);
  assert.equal(usd.amount, 200);
  assert.equal(usd.pinned, false);
});

test("yearly is twelve pinned months less the discount", () => {
  const plan = {
    currency: "EUR",
    monthly_fee: 200,
    monthly_fee_usd: 225,
    yearly_discount_pct: 20,
  };
  assert.equal(planPrice(plan, "EUR", "year", 1.13).amount, 1920);
  assert.equal(planPrice(plan, "USD", "year", 1.13).amount, 2160);
});

test("a pinned yearly price wins over the computed one", () => {
  const plan = {
    currency: "EUR",
    monthly_fee: 170,
    yearly_discount_pct: 20,
    yearly_fee_eur: 1600,
  };
  const y = planPrice(plan, "EUR", "year", 1.13);
  assert.equal(y.amount, 1600);
  assert.equal(y.pinned, true);
});

test("no discount and no yearly price means no yearly option at all", () => {
  assert.equal(hasYearlyOption({ monthly_fee: 200 }), false);
  assert.equal(hasYearlyOption({ monthly_fee: 200, yearly_discount_pct: 0 }), false);
  assert.equal(hasYearlyOption({ monthly_fee: 200, yearly_discount_pct: 20 }), true);
  assert.equal(hasYearlyOption({ monthly_fee: 200, yearly_fee_eur: 1900 }), true);
});

test("a nonsense discount is treated as none, not as a 120% refund", () => {
  assert.equal(yearlyDiscountPct({ yearly_discount_pct: 120 }), 0);
  assert.equal(yearlyDiscountPct({ yearly_discount_pct: -5 }), 0);
});

test("the saving is what the customer actually keeps", () => {
  const plan = { currency: "EUR", monthly_fee: 200, yearly_discount_pct: 20 };
  assert.equal(yearlySaving(plan, "EUR", 1.13), 480);
});

test("numeric columns arriving as strings are handled", () => {
  const plan = {
    currency: "EUR",
    monthly_fee: "200.00",
    monthly_fee_usd: "225.00",
    yearly_discount_pct: "20.00",
  };
  assert.equal(planPrice(plan, "USD", "month", "1.13").amount, 225);
  assert.equal(planPrice(plan, "USD", "year", "1.13").amount, 2160);
});

// A zero is a decision — "this plan is free in USD" — and must survive as
// zero rather than fall through to a conversion of the EUR price.
test("a pinned zero is a price, not an absent one", () => {
  const plan = { currency: "EUR", monthly_fee: 200, monthly_fee_usd: 0 };
  const usd = planPrice(plan, "USD", "month", 1.13);
  assert.equal(usd.amount, 0);
  assert.equal(usd.pinned, true);
});
