import { test } from "node:test";
import assert from "node:assert/strict";

import { MAX_RATE_MOVE_PCT, rateMoveVerdict } from "../../lib/pure-rate-guard";

/** The tenant's real rate on 27-09-2026. */
const LIVE = 0.872361;

test("an ordinary hourly move goes through", () => {
  for (const next of [0.8725, 0.8720, 0.8735, 0.8712]) {
    const v = rateMoveVerdict(LIVE, next);
    assert.equal(v.ok, true, `${next} should pass`);
  }
});

/**
 * The case the old `0 < rate < 1000` check could not see. 1/0.872361 is
 * 1.1463 — a perfectly plausible-looking number that makes every
 * conversion in the app about a third wrong.
 */
test("an inverted rate is refused", () => {
  const v = rateMoveVerdict(LIVE, 1 / LIVE);
  assert.equal(v.ok, false);
  assert.match(v.reason!, /moved/);
  assert.ok(v.movePct! > 30);
});

test("nonsense is refused before anything is compared", () => {
  for (const next of [0, -1, 1000, 5000, NaN, null, undefined, "abc"]) {
    const v = rateMoveVerdict(LIVE, next as number);
    assert.equal(v.ok, false, String(next));
    assert.match(v.reason!, /not a usable rate/);
  }
});

test("the first rate ever is taken, because there is nothing to compare", () => {
  for (const prev of [null, undefined, 0, NaN]) {
    const v = rateMoveVerdict(prev as number, LIVE);
    assert.equal(v.ok, true, String(prev));
    assert.equal(v.movePct, null);
  }
});

test("the band is a limit, not a suggestion", () => {
  const justUnder = LIVE * (1 + (MAX_RATE_MOVE_PCT - 0.1) / 100);
  const justOver = LIVE * (1 + (MAX_RATE_MOVE_PCT + 0.1) / 100);
  assert.equal(rateMoveVerdict(LIVE, justUnder).ok, true);
  assert.equal(rateMoveVerdict(LIVE, justOver).ok, false);
});

test("it cuts both ways — a collapse is refused too", () => {
  assert.equal(rateMoveVerdict(LIVE, LIVE * 0.5).ok, false);
  assert.equal(rateMoveVerdict(LIVE, LIVE * 2).ok, false);
});

/**
 * Refusing must leave the old rate in place, so the verdict has to be
 * usable as a plain boolean without the caller having to remember which
 * way round it is.
 */
test("a refusal carries a sentence a human can act on", () => {
  const v = rateMoveVerdict(LIVE, 1 / LIVE);
  assert.equal(v.ok, false);
  assert.ok(v.reason!.includes("0.872361"));
  assert.ok(v.reason!.length > 20);
});
