import { strict as assert } from "node:assert";
import { test } from "node:test";
import { withdrawCeiling } from "../../lib/pure-withdraw-ceiling";

test("no live reading means the funded figure stands", () => {
  assert.deepEqual(withdrawCeiling(96, null), { max: 96, bron: "gestort" });
});

test("a lower live balance wins, because the rest is already spent", () => {
  assert.deepEqual(withdrawCeiling(96, 40), { max: 40, bron: "live" });
});

// De dure kant. Staat er MEER op dan wij erop gezet hebben, dan mag dat
// verschil niet terug: er staat in onze boeken niets tegenover.
test("a higher live balance does NOT raise the ceiling", () => {
  assert.deepEqual(withdrawCeiling(96, 500), { max: 96, bron: "gestort" });
});

// Het gevaar waar dit hulpje voor bestaat: een leverancier die even niet
// antwoordt mag de knop niet dichtzetten voor iedereen.
test("a failed reading is null, not zero, so nothing is blocked", () => {
  assert.deepEqual(withdrawCeiling(96, undefined), {
    max: 96,
    bron: "gestort",
  });
  assert.deepEqual(withdrawCeiling(96, ""), { max: 96, bron: "gestort" });
  assert.deepEqual(withdrawCeiling(96, Number("x")), {
    max: 96,
    bron: "gestort",
  });
});

// En een ECHTE nul bij de leverancier is wel een antwoord: er staat
// niets meer op, dus er kan niets terug.
test("a real zero at the supplier does close it", () => {
  assert.deepEqual(withdrawCeiling(96, 0), { max: 0, bron: "live" });
});

test("without our own figure we say nothing, even if they answered", () => {
  assert.deepEqual(withdrawCeiling(null, 500), { max: null, bron: "onbekend" });
  assert.deepEqual(withdrawCeiling(undefined, 40), {
    max: null,
    bron: "onbekend",
  });
});

test("a negative on either side reads as nothing left, never as a credit", () => {
  assert.deepEqual(withdrawCeiling(-5, null), { max: 0, bron: "gestort" });
  assert.deepEqual(withdrawCeiling(96, -1), { max: 0, bron: "live" });
});

test("equal figures report the funded source, so the wording stays calm", () => {
  assert.deepEqual(withdrawCeiling(96, 96), { max: 96, bron: "gestort" });
});
