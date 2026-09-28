import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_PENDING,
  topupAgain,
  topupAgainBlocks,
  topupAgainMessage,
  topupAgainNeedsConfirm,
} from "../../lib/pure-topup-again";

const NOW = new Date("2026-09-28T12:00:00.000Z");
const minsAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString();

test("nothing waiting is fine, and says nothing", () => {
  const a = topupAgain({ pendingCreatedAt: [], now: NOW });
  assert.equal(a.kind, "fine");
  assert.equal(topupAgainMessage(a), null);
  assert.equal(topupAgainBlocks(a), false);
  assert.equal(topupAgainNeedsConfirm(a), false);
});

test("a claim from eight minutes ago is probably the same money", () => {
  const a = topupAgain({ pendingCreatedAt: [minsAgo(8)], now: NOW });
  assert.equal(a.kind, "probably-the-same");
  assert.equal(topupAgainNeedsConfirm(a), true);
  // Never a refusal: a real second transfer has to be possible.
  assert.equal(topupAgainBlocks(a), false);
  assert.match(topupAgainMessage(a)!, /8 minutes ago/);
  assert.match(topupAgainMessage(a)!, /second, separate transfer/);
});

test("just now reads as a moment, not as zero minutes", () => {
  const a = topupAgain({ pendingCreatedAt: [minsAgo(0)], now: NOW });
  assert.match(topupAgainMessage(a)!, /a moment ago/);
});

test("one minute is singular", () => {
  const a = topupAgain({ pendingCreatedAt: [minsAgo(1)], now: NOW });
  assert.match(topupAgainMessage(a)!, /1 minute ago/);
});

test("older than the window still asks, but differently", () => {
  const a = topupAgain({ pendingCreatedAt: [minsAgo(45)], now: NOW });
  assert.equal(a.kind, "several-waiting");
  assert.equal(topupAgainNeedsConfirm(a), true);
  assert.equal(topupAgainBlocks(a), false);
});

test("the ceiling refuses, and only the ceiling", () => {
  const a = topupAgain({
    pendingCreatedAt: [minsAgo(1), minsAgo(30), minsAgo(90)],
    now: NOW,
  });
  assert.equal(a.kind, "too-many");
  assert.equal(topupAgainBlocks(a), true);
  assert.equal(topupAgainNeedsConfirm(a), false);
  assert.match(topupAgainMessage(a)!, /message us/);
});

test("the ceiling sits well under the runaway guard of 15", () => {
  assert.ok(MAX_PENDING < 15);
});

test("the newest claim decides the window, not the oldest", () => {
  // An old one plus a fresh one is still "you just did this".
  const a = topupAgain({
    pendingCreatedAt: [minsAgo(200), minsAgo(2)],
    now: NOW,
  });
  assert.equal(a.kind, "probably-the-same");
  if (a.kind === "probably-the-same") assert.equal(a.minutesAgo, 2);
});

test("a clock skewed into the future is not a negative age", () => {
  const future = new Date(NOW.getTime() + 5 * 60_000).toISOString();
  const a = topupAgain({ pendingCreatedAt: [future], now: NOW });
  assert.equal(a.kind, "probably-the-same");
  if (a.kind === "probably-the-same") assert.equal(a.minutesAgo, 0);
});

test("unreadable timestamps are dropped, not counted as pending", () => {
  const a = topupAgain({
    pendingCreatedAt: [null, undefined, "not a date"],
    now: NOW,
  });
  assert.equal(a.kind, "fine");
});
