import test from "node:test";
import assert from "node:assert/strict";

import { suggestFeePct } from "../../lib/pure-fee-suggestion";

test("PSM0004: an agreed 5% is not undercut by a 3% type", () => {
  // The screen was showing 3 and saying so out loud: "Their plan says
  // 5% -- this account overrides it and 3% gets charged."
  const s = suggestFeePct({ planPct: 5, typePct: 3 });
  assert.equal(s.pct, 5);
  assert.equal(s.source, "plan");
  assert.equal(s.belowTypeDefault, false);
});

test("the type's own rate is not undercut by a lower plan", () => {
  // "soms heeft iemand hk geven we hem 3% fee bijv en soms eu ra geven
  // we hem 4% fee bijv dat die moet betalen" -- the same customer, two
  // rates, decided by the kind of account.
  const s = suggestFeePct({ planPct: 3, typePct: 4 });
  assert.equal(s.pct, 4, "EU RockAds is priced at 4 whatever the plan says");
  assert.equal(s.source, "type");
  assert.equal(s.belowTypeDefault, true, "worth showing, not worth hiding");
});

test("the same customer gets 3 on Hong Kong and 4 on EU RockAds", () => {
  assert.equal(suggestFeePct({ planPct: 3, typePct: 3 }).pct, 3);
  assert.equal(suggestFeePct({ planPct: 3, typePct: 4 }).pct, 4);
});

test("no plan rate falls back to the type default", () => {
  const s = suggestFeePct({ planPct: null, typePct: 4 });
  assert.equal(s.pct, 4);
  assert.equal(s.source, "type");
});

test("neither one suggests nothing, and nothing is not zero", () => {
  const s = suggestFeePct({});
  assert.equal(s.pct, null);
  assert.equal(s.source, "none");
});

test("a zero rate is 'not set', never an offer to work for free", () => {
  // resolveEffectiveFeePct reads 0 as unset, so offering 0 would be a
  // form quietly agreeing to charge nothing for ever.
  assert.equal(suggestFeePct({ planPct: 0, typePct: 3 }).pct, 3);
  assert.equal(suggestFeePct({ planPct: 0, typePct: 0 }).pct, null);
});

test("a plan below the type rate is lifted to it, and flagged", () => {
  const s = suggestFeePct({ planPct: 2, typePct: 4 });
  assert.equal(s.pct, 4, "never below what that kind of account is priced at");
  assert.equal(s.belowTypeDefault, true);
  // Both figures stay readable, so the screen can name the difference
  // instead of quietly resolving it.
  assert.equal(s.planPct, 2);
  assert.equal(s.typePct, 4);
});

test("PostgREST numerics arrive as strings", () => {
  const s = suggestFeePct({ planPct: "5.00", typePct: "3.00" });
  assert.equal(s.pct, 5);
  assert.equal(s.source, "plan");
});

test("nonsense is refused rather than rounded into a price", () => {
  assert.equal(suggestFeePct({ planPct: "abc", typePct: 3 }).pct, 3);
  assert.equal(suggestFeePct({ planPct: 150, typePct: 3 }).pct, 3);
  assert.equal(suggestFeePct({ planPct: -5, typePct: 3 }).pct, 3);
  assert.equal(suggestFeePct({ planPct: "abc", typePct: "abc" }).pct, null);
});

test("the suggestion is always a figure an employee admin may save", () => {
  // feeIsAPrice lets a non-owner save the plan rate or the type default
  // and refuses anything else. Whichever way the max falls, it is one of
  // those two -- so the offered figure is never one they are then
  // refused for accepting.
  for (const [plan, type] of [
    [5, 3],
    [3, 4],
    [3, 3],
    [null, 4],
    [5, null],
  ] as const) {
    const s = suggestFeePct({ planPct: plan, typePct: type });
    if (s.pct === null) continue;
    assert.ok(
      s.pct === plan || s.pct === type,
      `${s.pct} is neither the plan (${plan}) nor the type (${type})`,
    );
  }
});

test("a tie reads as the plan — the friendlier sentence", () => {
  const s = suggestFeePct({ planPct: 3, typePct: 3 });
  assert.equal(s.pct, 3);
  assert.equal(s.source, "plan");
  assert.equal(s.belowTypeDefault, false);
});
