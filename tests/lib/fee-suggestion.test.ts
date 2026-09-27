import test from "node:test";
import assert from "node:assert/strict";

import { suggestFeePct } from "../../lib/pure-fee-suggestion";

test("the plan rate beats the type default", () => {
  // PSM0004 exactly: plan 5%, RockAds type default 3%. The screen was
  // showing 3 and saying so out loud.
  const s = suggestFeePct({ planPct: 5, typePct: 3 });
  assert.equal(s.pct, 5);
  assert.equal(s.source, "plan");
  assert.equal(s.belowTypeDefault, false);
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

test("a plan below the type default is flagged, not overruled", () => {
  const s = suggestFeePct({ planPct: 2, typePct: 4 });
  assert.equal(s.pct, 2, "an agreed discount is still what was agreed");
  assert.equal(s.belowTypeDefault, true);
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

test("both present and equal reads as the plan", () => {
  const s = suggestFeePct({ planPct: 3, typePct: 3 });
  assert.equal(s.pct, 3);
  assert.equal(s.source, "plan");
  assert.equal(s.belowTypeDefault, false);
});
