import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PAYOUT_FEE_PCT,
  payoutLeg,
  payoutReach,
  payoutTotal,
} from "../../lib/pure-payout-reach";

// The live rate on 27-09, so the figures here are the ones the app was
// actually computing.
const RATE = 0.872361;
const MIN = 200;

describe("payoutLeg", () => {
  it("does not charge a fee on a pot paid in its own currency", () => {
    assert.deepEqual(payoutLeg(199, "EUR", "EUR", RATE), {
      gross: 199,
      fee: 0,
      net: 199,
    });
  });

  it("charges 0,6% on a pot that is converted", () => {
    // $100 -> EUR 87,24, fee EUR 0,52, net EUR 86,72
    assert.deepEqual(payoutLeg(100, "USD", "EUR", RATE), {
      gross: 87.24,
      fee: 0.52,
      net: 86.72,
    });
  });

  it("rounds per step, like the RPC does", () => {
    // Rounding once at the end would give 86.71 here rather than 86.72:
    // 87.2361 - 0.5234166 = 86.7126834 -> 86.71. The server rounds the
    // conversion first (87.24), then the fee (0.52), then the difference.
    const leg = payoutLeg(100, "USD", "EUR", RATE)!;
    assert.equal(leg.net, 86.72);
  });

  it("is null when a conversion is needed and there is no rate", () => {
    assert.equal(payoutLeg(100, "USD", "EUR", null), null);
    assert.equal(payoutLeg(100, "USD", "EUR", 0), null);
  });

  it("still answers for a pot of nothing, rate or no rate", () => {
    assert.deepEqual(payoutLeg(0, "USD", "EUR", null), {
      gross: 0,
      fee: 0,
      net: 0,
    });
  });

  it("carries the fee this repo says it does", () => {
    assert.equal(PAYOUT_FEE_PCT, 0.6);
  });
});

describe("payoutTotal", () => {
  it("leaves the receiving pot alone and only fees the other", () => {
    // EUR 199 untouched + $1,50 -> EUR 1,31 -> fee 0,01 -> 1,30
    assert.equal(payoutTotal({ EUR: 199, USD: 1.5 }, "EUR", RATE), 200.3);
  });

  it("an empty other pot never needs a rate", () => {
    assert.equal(payoutTotal({ EUR: 250, USD: 0 }, "EUR", null), 250);
  });

  it("is null when the pot that must convert has no rate", () => {
    assert.equal(payoutTotal({ EUR: 100, USD: 120 }, "EUR", null), null);
  });
});

describe("payoutReach", () => {
  it("EUR 199 + $1,50 passes — the case the old card refused", () => {
    // The old line computed 0,994 x 200,31 = EUR 199,11 and said "payouts
    // start at EUR 200,00" over a request the server would have taken.
    const r = payoutReach({ EUR: 199, USD: 1.5 }, MIN, RATE);
    assert.equal(r.bestEur, 200.3);
    assert.equal(r.reachable, true);
    assert.equal(r.onlyByConverting, true);
  });

  it("a pot that clears the floor on its own needs no conversion", () => {
    const r = payoutReach({ EUR: 250, USD: 0 }, MIN, RATE);
    assert.equal(r.sameEur, true);
    assert.equal(r.reachable, true);
    assert.equal(r.onlyByConverting, false);
  });

  it("EUR 120 + $110 reaches the floor only by converting", () => {
    // The case in the card's own note: about EUR 216 converted, and
    // neither pot is 200 alone — so "keep them separate" must not be the
    // mode step 2 opens on.
    const r = payoutReach({ EUR: 120, USD: 110 }, MIN, RATE);
    assert.equal(r.sameEur, false);
    assert.equal(r.sameUsd, false);
    assert.equal(r.reachable, true);
    assert.equal(r.onlyByConverting, true);
  });

  it("quotes the currency that actually passes, not always EUR", () => {
    // $205 + EUR 0: reachable in USD (205 >= 200) and nowhere near in EUR
    // (about 177). Quoting EUR here is how "about EUR 174,47 — enough for
    // a payout" ended up under a card saying payouts start at 200.
    const r = payoutReach({ EUR: 0, USD: 205 }, MIN, RATE);
    assert.equal(r.reachable, true);
    assert.equal(r.quoteCurrency, "USD");
    assert.equal(r.quoteAmount, 205);
    assert.ok((r.bestEur ?? 0) < MIN);
  });

  it("short of the floor, quotes whichever side is nearest", () => {
    // EUR 100 + $50: in EUR about 143, in USD about 164 — USD is nearer,
    // so the gap it reports is the smaller true one.
    const r = payoutReach({ EUR: 100, USD: 50 }, MIN, RATE);
    assert.equal(r.reachable, false);
    assert.equal(r.quoteCurrency, "USD");
    assert.ok((r.quoteAmount ?? 0) > (r.bestEur ?? 0));
  });

  it("nothing owed is not reachable", () => {
    const r = payoutReach({ EUR: 0, USD: 0 }, MIN, RATE);
    assert.equal(r.reachable, false);
    assert.equal(r.onlyByConverting, false);
  });

  it("no rate: a single pot can still pass on its own", () => {
    const r = payoutReach({ EUR: 250, USD: 0 }, MIN, null);
    assert.equal(r.sameEur, true);
    assert.equal(r.reachable, true);
  });

  it("no rate: two pots that only pass together do NOT pass", () => {
    // Refusing is right — without a rate we cannot say what it arrives as,
    // and the RPC raises "We cannot convert right now" on the same state.
    const r = payoutReach({ EUR: 120, USD: 110 }, MIN, null);
    assert.equal(r.bestEur, null);
    assert.equal(r.bestUsd, null);
    assert.equal(r.reachable, false);
  });

  it("honours a floor the owner released", () => {
    // The owner, 25-09: "tenzij admin het vrijgeeft, super admin". An
    // affiliate released to 50 who is owed 60 can ask.
    const r = payoutReach({ EUR: 60, USD: 0 }, 50, RATE);
    assert.equal(r.sameEur, true);
    assert.equal(r.reachable, true);
  });

  it("a released floor of 0 is not treated as no floor at all", () => {
    const r = payoutReach({ EUR: 0.01, USD: 0 }, 0, RATE);
    assert.equal(r.reachable, true);
  });
});
