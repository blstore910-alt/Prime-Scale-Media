import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  EXCHANGE_FEE_PCT,
  getRate,
  landsAfterFee,
  neededFromAmount,
  otherWalletCovers,
} from "../../lib/pure-exchange.ts";

// exchange_rates.eur stores "1 USD = N EUR".
const R = 0.92;

describe("getRate", () => {
  it("is USD-based both ways", () => {
    assert.equal(getRate(R, "USD", "EUR"), R);
    assert.equal(getRate(R, "EUR", "USD"), 1 / R);
    assert.equal(getRate(R, "EUR", "EUR"), 1);
  });

  it("a rate that was never read is 0, not parity", () => {
    // The whole point: an unread rate must not behave like 1:1.
    assert.equal(getRate(0, "USD", "EUR"), 0);
    assert.equal(getRate(Number.NaN, "EUR", "USD"), 0);
    assert.equal(getRate(-1, "USD", "EUR"), 0);
  });
});

describe("landsAfterFee", () => {
  it("takes the fee off what arrives", () => {
    assert.equal(
      landsAfterFee(100, R),
      Math.round(100 * R * (1 - EXCHANGE_FEE_PCT) * 100) / 100,
    );
  });

  it("is 0 for nothing and for no rate", () => {
    assert.equal(landsAfterFee(0, R), 0);
    assert.equal(landsAfterFee(100, 0), 0);
  });
});

describe("neededFromAmount", () => {
  it("rounds UP, so exactly enough really is enough", () => {
    const rate = getRate(R, "USD", "EUR");
    const from = neededFromAmount(5, rate);
    assert.ok(landsAfterFee(from, rate) >= 5);
  });

  it("holds across amounts, rates and both directions", () => {
    for (const need of [0.01, 1, 4.99, 5, 50, 199.99, 200, 1234.56]) {
      for (const base of [0.8, 0.92, 1.0, 1.21]) {
        for (const [from, to] of [
          ["USD", "EUR"],
          ["EUR", "USD"],
        ] as const) {
          const rate = getRate(base, from, to);
          const amt = neededFromAmount(need, rate);
          assert.ok(
            landsAfterFee(amt, rate) >= need,
            `need ${need} at ${base} ${from}->${to}: ${amt} landed ${landsAfterFee(amt, rate)}`,
          );
        }
      }
    }
  });
});

describe("otherWalletCovers", () => {
  it("says UNKNOWN when no rate has been read", () => {
    // Not false. A failed read must not become a confident refusal.
    assert.equal(otherWalletCovers(200, 500, 0), null);
    assert.equal(otherWalletCovers(200, 500, Number.NaN), null);
  });

  it("is not fooled by one cent", () => {
    // The fault this exists for: EUR 200 owed, USD 0.01 held, and the
    // card offered "Exchange to pay EUR 200.00" while taking Top up away.
    const rate = getRate(R, "USD", "EUR");
    assert.equal(otherWalletCovers(200, 0.01, rate), false);
    assert.equal(otherWalletCovers(200, 0, rate), false);
    assert.equal(otherWalletCovers(200, 100000, rate), true);
  });

  it("holds at the exact boundary", () => {
    const rate = getRate(R, "USD", "EUR");
    const exact = neededFromAmount(5, rate);
    assert.equal(otherWalletCovers(5, exact, rate), true);
    assert.equal(otherWalletCovers(5, exact - 0.5, rate), false);
  });
});
