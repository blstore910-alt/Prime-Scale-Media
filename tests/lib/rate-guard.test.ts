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

import { RATE_STALE_HOURS, rateAge } from "../../lib/pure-rate-guard";

const NOW = new Date("2026-09-27T12:00:00Z");
const ago = (mins: number) =>
  new Date(NOW.getTime() - mins * 60000).toISOString();

test("a fresh rate reads as fresh and is not flagged", () => {
  assert.equal(rateAge(ago(0), NOW).text, "updated just now");
  assert.equal(rateAge(ago(14), NOW).text, "updated 14 minutes ago");
  assert.equal(rateAge(ago(14), NOW).stale, false);
});

test("one of something is singular", () => {
  assert.equal(rateAge(ago(1), NOW).text, "updated 1 minute ago");
  assert.equal(rateAge(ago(60), NOW).text, "updated 1 hour ago");
});

/**
 * The state this exists for. On 27-09 the hourly job ran once and
 * stopped, and the rate sat there looking exactly like a fresh one.
 */
test("a job that stopped becomes visible", () => {
  const justUnder = rateAge(ago(RATE_STALE_HOURS * 60 - 1), NOW);
  const justOver = rateAge(ago(RATE_STALE_HOURS * 60 + 1), NOW);
  assert.equal(justUnder.stale, false);
  assert.equal(justOver.stale, true);
});

test("the ten-day case reads in days", () => {
  const v = rateAge(ago(10 * 24 * 60), NOW);
  assert.equal(v.text, "updated 10 days ago");
  assert.equal(v.stale, true);
});

test("nothing to date says nothing, rather than guessing", () => {
  for (const v of [null, undefined, "", "not a date"]) {
    const r = rateAge(v as string, NOW);
    assert.equal(r.text, null);
    assert.equal(r.stale, false);
  }
});

test("a clock that disagrees is unknown, not fresh", () => {
  const future = new Date(NOW.getTime() + 60 * 60000).toISOString();
  assert.equal(rateAge(future, NOW).text, null);
  assert.equal(rateAge(future, NOW).stale, false);
});
