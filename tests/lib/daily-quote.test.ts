import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DAILY_QUOTES, dailyQuote } from "../../lib/pure-daily-quote";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("dailyQuote", () => {
  it("gives the same person the same line all day", () => {
    const morning = new Date(2026, 8, 27, 8, 5);
    const evening = new Date(2026, 8, 27, 23, 55);
    assert.equal(dailyQuote(A, morning), dailyQuote(A, evening));
  });

  it("moves at midnight", () => {
    const today = new Date(2026, 8, 27, 12, 0);
    const tomorrow = new Date(2026, 8, 28, 12, 0);
    assert.notEqual(dailyQuote(A, today), dailyQuote(A, tomorrow));
  });

  it("gives two people different lines on the same day", () => {
    const d = new Date(2026, 8, 27, 12, 0);
    assert.notEqual(dailyQuote(A, d), dailyQuote(B, d));
  });

  it("is null without a seed, never a fallback line", () => {
    // A greeting addressed to nobody is worse than no greeting.
    const d = new Date(2026, 8, 27, 12, 0);
    assert.equal(dailyQuote(null, d), null);
    assert.equal(dailyQuote(undefined, d), null);
    assert.equal(dailyQuote("", d), null);
    assert.equal(dailyQuote("   ", d), null);
  });

  it("always returns a line that is in the list", () => {
    const d = new Date(2026, 8, 27, 12, 0);
    for (let i = 0; i < 200; i++) {
      const q = dailyQuote(`seed-${i}`, d);
      assert.ok(q && DAILY_QUOTES.includes(q));
    }
  });

  it("spreads across the list rather than favouring one line", () => {
    // Not a distribution proof — just that it is not effectively constant,
    // which is the failure a weak hash would give and which nobody would
    // notice by looking.
    const d = new Date(2026, 8, 27, 12, 0);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) seen.add(String(dailyQuote(`user-${i}`, d)));
    assert.ok(
      seen.size > DAILY_QUOTES.length / 2,
      `only ${seen.size} distinct lines across 300 seeds`,
    );
  });

  it("one person walks through different lines over a fortnight", () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 14; day++) {
      seen.add(String(dailyQuote(A, new Date(2026, 8, day, 12, 0))));
    }
    assert.ok(seen.size >= 8, `only ${seen.size} distinct lines in 14 days`);
  });

  it("the lines themselves stay kind and short", () => {
    for (const q of DAILY_QUOTES) {
      assert.ok(q.length > 0 && q.length <= 90, `too long: ${q}`);
      // No targets, no hustle. A tired person does not need either.
      assert.doesNotMatch(q, /crush|hustle|grind|beast|smash|10x/i, q);
    }
  });
});
