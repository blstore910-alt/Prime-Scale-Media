import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ADVERTISER_QUOTES,
  AFFILIATE_QUOTES,
  BOTH_QUOTES,
  DAILY_QUOTES,
  FOUNDER_QUOTES,
  dailyQuote,
} from "../../lib/pure-daily-quote";

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

describe("dailyQuote for the founders", () => {
  const d = new Date(2026, 8, 27, 12, 0);

  it("gives an owner a founder line, not a desk one", () => {
    const q = dailyQuote(A, d, "owner");
    assert.ok(q && FOUNDER_QUOTES.includes(q));
    assert.ok(!DAILY_QUOTES.includes(q));
  });

  it("gives the desk a desk line", () => {
    const q = dailyQuote(A, d, "desk");
    assert.ok(q && DAILY_QUOTES.includes(q));
  });

  it("defaults to the desk when nobody says", () => {
    assert.equal(dailyQuote(A, d), dailyQuote(A, d, "desk"));
  });

  it("the same person reads two different lines in the two places", () => {
    // An owner who opens the desk view should not meet the same sentence
    // twice on one day.
    assert.notEqual(dailyQuote(A, d, "owner"), dailyQuote(A, d, "desk"));
  });

  it("the founder lines stay out of the hustle genre", () => {
    for (const q of FOUNDER_QUOTES) {
      assert.ok(q.length > 0 && q.length <= 95, `too long: ${q}`);
      assert.doesNotMatch(
        q,
        /crush|hustle|grind|beast|smash|10x|rise and shine|no excuses/i,
        q,
      );
    }
  });

  it("walks an owner through different lines over a fortnight", () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 14; day++) {
      seen.add(String(dailyQuote(A, new Date(2026, 8, day, 12, 0), "owner")));
    }
    assert.ok(seen.size >= 8, `only ${seen.size} distinct lines in 14 days`);
  });
});

describe("quotes voor klanten", () => {
// ── DE DRIE KLANTSETS ──────────────────────────────────────────────

it("elke rol krijgt zijn eigen set", () => {
  const seed = "same-person";
  const adv = dailyQuote(seed, new Date("2026-09-30"), "advertiser")!;
  const aff = dailyQuote(seed, new Date("2026-09-30"), "affiliate")!;
  const both = dailyQuote(seed, new Date("2026-09-30"), "both")!;
  assert.ok(ADVERTISER_QUOTES.includes(adv));
  assert.ok(AFFILIATE_QUOTES.includes(aff));
  assert.ok(BOTH_QUOTES.includes(both));
});

it("zonder doelgroep blijft het de balie -- een bestaande aanroep mag niet van set wisselen", () => {
  const q = dailyQuote("x", new Date("2026-09-30"))!;
  assert.ok(DAILY_QUOTES.includes(q));
});

it("geen seed is geen spreuk, ook voor een klant", () => {
  assert.equal(dailyQuote(null, new Date(), "advertiser"), null);
  assert.equal(dailyQuote("", new Date(), "both"), null);
});

it("niets dat meer eist of het werk wegwuift", () => {
  // De twee valkuilen uit de kop van het bestand, als regel.
  const verboden =
    /\b(crush|hustle|grind|scale up|think bigger|opportunity|no excuses|10x)\b/i;
  for (const q of [...ADVERTISER_QUOTES, ...AFFILIATE_QUOTES, ...BOTH_QUOTES]) {
    assert.ok(!verboden.test(q), `te veeleisend of te luchtig: ${q}`);
  }
});

it("en niets over onszelf -- dit is hun dashboard, geen nieuwsbrief", () => {
  for (const q of [...ADVERTISER_QUOTES, ...AFFILIATE_QUOTES, ...BOTH_QUOTES]) {
    assert.ok(
      !/\b(we|our|us|Prime Scale)\b/i.test(q) || /you/i.test(q),
      `gaat over ons in plaats van over hen: ${q}`,
    );
  }
});
});
