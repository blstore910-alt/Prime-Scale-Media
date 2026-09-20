import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  landedOnAccount,
  sumLandedByCurrency,
} from "../../lib/pure-topup-landed.ts";

describe("landedOnAccount — whose row is it", () => {
  it("a customer row is in the account's own currency", () => {
    // top_up_create_for_advertiser: EUR 100 at 3% on a EUR account.
    const row = {
      currency: "EUR",
      topup_amount: 97,
      topup_usd: 111.19,
    };
    assert.deepEqual(landedOnAccount(row), { amount: 97, currency: "EUR" });
  });

  it("an admin row has no topup_usd, and its topup_amount is dollars", () => {
    // calculateTopupAmount converts first, so 97 would be wrong here.
    const row = { currency: "EUR", topup_amount: 1104.65 };
    assert.deepEqual(landedOnAccount(row), {
      amount: 1104.65,
      currency: "USD",
    });
  });

  it("a USD customer row stays USD", () => {
    const row = { currency: "USD", topup_amount: 970, topup_usd: 970 };
    assert.deepEqual(landedOnAccount(row), { amount: 970, currency: "USD" });
  });

  it("an unreadable amount is null, never zero", () => {
    assert.equal(landedOnAccount({ topup_amount: null }).amount, null);
    assert.equal(landedOnAccount({ topup_amount: "" }).amount, null);
    assert.equal(landedOnAccount(null).amount, null);
  });

  it("a zero topup_usd does not make the row an admin row", () => {
    // 0 is a real value the customer path can write; only absence means
    // "an admin wrote this".
    const row = { currency: "EUR", topup_amount: 100, topup_usd: 0 };
    assert.equal(landedOnAccount(row).currency, "EUR");
  });
});

describe("sumLandedByCurrency — a sum across currencies is not a number", () => {
  it("keeps the currencies apart", () => {
    const rows = [
      { currency: "EUR", topup_amount: 97, topup_usd: 111.19 },
      { currency: "EUR", topup_amount: 3, topup_usd: 3.44 },
      { currency: "USD", topup_amount: 500, topup_usd: 500 },
      { currency: "EUR", topup_amount: 1104.65 }, // admin row -> USD
    ];
    assert.deepEqual(sumLandedByCurrency(rows), {
      EUR: 100,
      USD: 1604.65,
    });
  });

  it("skips what it cannot read rather than counting it as nothing", () => {
    const rows = [
      { currency: "EUR", topup_amount: 50, topup_usd: 57 },
      { currency: "EUR", topup_amount: null, topup_usd: 1 },
    ];
    assert.deepEqual(sumLandedByCurrency(rows), { EUR: 50 });
  });
});
