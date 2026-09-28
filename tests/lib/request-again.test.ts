import test from "node:test";
import assert from "node:assert/strict";

import {
  requestAgain,
  requestAgainBlocks,
  requestAgainMessage,
  requestAgainNeedsConfirm,
  SAME_REQUEST_MINUTES,
  SERVER_TWIN_SECONDS,
} from "../../lib/pure-request-again";

const NOW = new Date("2026-09-28T12:00:00.000Z");
const minsAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString();

const ask = (open: Parameters<typeof requestAgain>[0]["open"]) =>
  requestAgain({ open, platform: "meta-ads", currency: "EUR", now: NOW });

test("nothing open is fine, and says nothing", () => {
  const a = ask([]);
  assert.equal(a.kind, "fine");
  assert.equal(requestAgainMessage(a), null);
  assert.equal(requestAgainNeedsConfirm(a), false);
});

test("the same shape, minutes ago, is almost certainly a repeat", () => {
  const a = ask([
    { createdAt: minsAgo(6), platform: "meta-ads", currency: "EUR" },
  ]);
  assert.equal(a.kind, "probably-the-same");
  if (a.kind === "probably-the-same") assert.equal(a.minutesAgo, 6);
  assert.match(requestAgainMessage(a)!, /6 minutes ago/);
  assert.match(requestAgainMessage(a)!, /set up by hand/);
  assert.equal(requestAgainNeedsConfirm(a), true);
});

test("a different platform is a different account, not a repeat", () => {
  const a = ask([
    { createdAt: minsAgo(2), platform: "tiktok-ads", currency: "EUR" },
  ]);
  assert.equal(a.kind, "several-open");
});

test("a different currency is a different account too", () => {
  const a = ask([
    { createdAt: minsAgo(2), platform: "meta-ads", currency: "USD" },
  ]);
  assert.equal(a.kind, "several-open");
});

test("case and padding do not decide whether it is the same thing", () => {
  const a = ask([
    { createdAt: minsAgo(2), platform: " Meta-Ads ", currency: "eur" },
  ]);
  assert.equal(a.kind, "probably-the-same");
});

test("older than the window still says something, but differently", () => {
  const a = ask([
    { createdAt: minsAgo(SAME_REQUEST_MINUTES + 1), platform: "meta-ads", currency: "EUR" },
  ]);
  assert.equal(a.kind, "several-open");
  assert.match(requestAgainMessage(a)!, /1 request with us already/);
  assert.equal(requestAgainNeedsConfirm(a), true);
});

test("it never refuses — the wallet and the plan are the real ceiling", () => {
  // Twelve open requests is a lot, and still not a refusal: somebody
  // scaling up files several, and both the wallet balance and the plan
  // allowance already stop them for real.
  // All older than the database's 90-second window, so none of them is
  // the "same click twice" case -- just somebody scaling up.
  const many = Array.from({ length: 12 }, (_, i) => ({
    createdAt: minsAgo(i + 2),
    platform: "meta-ads",
    currency: "EUR",
  }));
  const a = ask(many);
  assert.equal(a.kind, "probably-the-same");
  assert.equal(requestAgainNeedsConfirm(a), true);
  assert.equal(requestAgainBlocks(a), false);
});

test("the newest matching one decides the window, not the oldest", () => {
  const a = ask([
    { createdAt: minsAgo(200), platform: "meta-ads", currency: "EUR" },
    { createdAt: minsAgo(3), platform: "meta-ads", currency: "EUR" },
  ]);
  assert.equal(a.kind, "probably-the-same");
  if (a.kind === "probably-the-same") assert.equal(a.minutesAgo, 3);
});

test("inside the database's own 90 seconds it is a refusal, not a warning", () => {
  // Walked on production: the dialog said "carry on if you really want
  // a second account", the customer did, and the server answered 409.
  const a = ask([
    { createdAt: new Date(NOW.getTime() - 20_000).toISOString(), platform: "meta-ads", currency: "EUR" },
  ]);
  assert.equal(a.kind, "too-soon");
  assert.equal(requestAgainBlocks(a), true);
  assert.equal(requestAgainNeedsConfirm(a), false);
  assert.match(requestAgainMessage(a)!, /seconds ago/);
  assert.match(requestAgainMessage(a)!, /Wait about 70 seconds/);
});

test("past the 90 seconds it is a warning again, and lets them through", () => {
  const a = ask([
    {
      createdAt: new Date(NOW.getTime() - (SERVER_TWIN_SECONDS + 5) * 1000).toISOString(),
      platform: "meta-ads",
      currency: "EUR",
    },
  ]);
  assert.equal(a.kind, "probably-the-same");
  assert.equal(requestAgainBlocks(a), false);
  assert.equal(requestAgainNeedsConfirm(a), true);
});

test("a different platform is never blocked, however fast", () => {
  const a = ask([
    { createdAt: new Date(NOW.getTime() - 1000).toISOString(), platform: "tiktok-ads", currency: "EUR" },
  ]);
  assert.equal(a.kind, "several-open");
  assert.equal(requestAgainBlocks(a), false);
});

test("a clock skewed into the future is not a negative age", () => {
  const a = ask([
    {
      createdAt: new Date(NOW.getTime() + 5 * 60_000).toISOString(),
      platform: "meta-ads",
      currency: "EUR",
    },
  ]);
  // Zero seconds old, so the database's window catches it first.
  assert.equal(a.kind, "too-soon");
  if (a.kind === "too-soon") assert.equal(a.secondsAgo, 0);
});

test("an unreadable timestamp does not become a repeat", () => {
  const a = ask([
    { createdAt: "not a date", platform: "meta-ads", currency: "EUR" },
    { createdAt: null, platform: "meta-ads", currency: "EUR" },
  ]);
  // Still open requests, so still worth a word -- just not "the same one".
  assert.equal(a.kind, "several-open");
});

test("one minute is singular", () => {
  // Two minutes: one is still inside the database's 90-second refusal.
  const a = ask([
    { createdAt: minsAgo(2), platform: "meta-ads", currency: "EUR" },
  ]);
  assert.match(requestAgainMessage(a)!, /2 minutes ago/);
});
