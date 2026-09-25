import { test } from "node:test";
import assert from "node:assert/strict";

import {
  STANDING_PAYOUT_MIN,
  isReleased,
  payoutMinimumFor,
} from "../../lib/pure-payout-min";

test("nothing set means the standing rule", () => {
  for (const v of [null, undefined, ""]) {
    assert.equal(payoutMinimumFor(v), STANDING_PAYOUT_MIN, String(v));
    assert.equal(isReleased(v), false, String(v));
  }
});

/**
 * The fault this exists to prevent: `Number(x) || 200`. Zero is falsy, so
 * the one release that matters most — "this affiliate may ask for any
 * amount" — would silently come back as the full 200, the button would
 * stay dead, and the owner would have pressed save on nothing.
 */
test("zero is a release, not an empty box", () => {
  assert.equal(payoutMinimumFor(0), 0);
  assert.equal(payoutMinimumFor("0"), 0);
  assert.equal(payoutMinimumFor("0.00"), 0);
  assert.equal(isReleased(0), true);
});

test("numeric comes back from PostgREST as a string", () => {
  assert.equal(payoutMinimumFor("50.00"), 50);
  assert.equal(payoutMinimumFor("15.96"), 15.96);
  assert.equal(payoutMinimumFor(50), 50);
});

test("an override equal to the standing rule is not a release", () => {
  assert.equal(payoutMinimumFor(200), 200);
  assert.equal(isReleased(200), false);
  assert.equal(isReleased("200.00"), false);
});

test("nonsense falls back to the rule rather than to no rule at all", () => {
  for (const v of ["", "abc", NaN, -1, "-5"]) {
    assert.equal(payoutMinimumFor(v), STANDING_PAYOUT_MIN, String(v));
    assert.equal(isReleased(v), false, String(v));
  }
});

test("cents survive", () => {
  assert.equal(payoutMinimumFor("15.9649"), 15.96);
  assert.equal(payoutMinimumFor(15.965), 15.97);
});
