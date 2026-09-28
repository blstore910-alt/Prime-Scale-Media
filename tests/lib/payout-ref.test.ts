import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  payoutGroupKey,
  payoutRef,
  payoutSequence,
} from "../../lib/pure-payout-ref.ts";

/**
 * The owner: "hun mogen niet zien tenant payouts alleen per affiliate."
 * The house number leaks how many payouts everyone else got; these hold
 * the partner's own series in its place.
 */

const AT = (s: string) => `2026-09-${s}T10:00:00.000Z`;

test("the live case: the house calls it #4, the partner's own is 2", () => {
  // Measured 28-09: payouts #1 and #2 belong to PSM0005, #3 and #4 to
  // PSM0008. PSM0008's own list is only #3 and #4.
  const rows = [
    { id: "p3", requested_at: AT("28") },
    { id: "p4", requested_at: `2026-09-28T19:18:00.000Z` },
  ];
  const seq = payoutSequence(rows);
  assert.equal(seq.get("p3"), 1);
  assert.equal(seq.get("p4"), 2);
  assert.equal(payoutRef("PSM0008", seq.get("p4")), "PSM0008-02");
});

test("oldest first, whatever order the rows arrive in", () => {
  // The card fetches newest-first; the sequence must not follow that.
  const newestFirst = [
    { id: "c", requested_at: AT("27") },
    { id: "b", requested_at: AT("22") },
    { id: "a", requested_at: AT("14") },
  ];
  const seq = payoutSequence(newestFirst);
  assert.deepEqual(
    [seq.get("a"), seq.get("b"), seq.get("c")],
    [1, 2, 3],
  );
});

test("a two-currency request is ONE transfer with ONE number", () => {
  const rows = [
    { id: "eur", group_id: "g1", requested_at: AT("10") },
    { id: "usd", group_id: "g1", requested_at: AT("10") },
    { id: "later", requested_at: AT("20") },
  ];
  const seq = payoutSequence(rows);
  assert.equal(seq.size, 2);
  assert.equal(seq.get("g1"), 1);
  assert.equal(seq.get("later"), 2);
  assert.equal(payoutGroupKey(rows[0]), payoutGroupKey(rows[1]));
});

test("a group takes the time of its EARLIEST row", () => {
  const rows = [
    { id: "solo", requested_at: "2026-09-10T09:00:00.000Z" },
    { id: "b", group_id: "g", requested_at: "2026-09-10T12:00:00.000Z" },
    { id: "a", group_id: "g", requested_at: "2026-09-10T08:00:00.000Z" },
  ];
  const seq = payoutSequence(rows);
  assert.equal(seq.get("g"), 1, "the group started before the solo one");
  assert.equal(seq.get("solo"), 2);
});

test("a refused payout keeps its number — the series does not renumber", () => {
  // The affiliate still holds the sent-back one in their list. If #1 were
  // handed to the next request, two different requests would carry the
  // same reference.
  const rows = [
    { id: "rejected", requested_at: AT("10") },
    { id: "paid", requested_at: AT("11") },
  ];
  const seq = payoutSequence(rows);
  assert.equal(seq.get("rejected"), 1);
  assert.equal(seq.get("paid"), 2);
});

test("created_at stands in when requested_at is missing", () => {
  const seq = payoutSequence([
    { id: "b", created_at: AT("20") },
    { id: "a", created_at: AT("10") },
  ]);
  assert.deepEqual([seq.get("a"), seq.get("b")], [1, 2]);
});

test("identical timestamps still give a stable answer", () => {
  const same = AT("10");
  const one = payoutSequence([
    { id: "zz", requested_at: same },
    { id: "aa", requested_at: same },
  ]);
  const two = payoutSequence([
    { id: "aa", requested_at: same },
    { id: "zz", requested_at: same },
  ]);
  assert.equal(one.get("aa"), two.get("aa"));
  assert.equal(one.get("zz"), two.get("zz"));
});

test("an unparseable date does not throw and does not jump to the front twice", () => {
  const seq = payoutSequence([
    { id: "broken", requested_at: "not a date" },
    { id: "real", requested_at: AT("10") },
  ]);
  assert.equal(seq.size, 2);
  assert.equal(seq.get("broken"), 1);
  assert.equal(seq.get("real"), 2);
});

test("the reference is padded to two digits, and keeps growing past 99", () => {
  assert.equal(payoutRef("PSM0008", 1), "PSM0008-01");
  assert.equal(payoutRef("PSM0008", 9), "PSM0008-09");
  assert.equal(payoutRef("PSM0008", 12), "PSM0008-12");
  assert.equal(payoutRef("PSM0008", 100), "PSM0008-100");
});

test("a lowercase or padded client code still gives one series", () => {
  assert.equal(payoutRef(" psm0008 ", 2), "PSM0008-02");
});

test("no client code means no reference, not a bare house number", () => {
  assert.equal(payoutRef(null, 2), null);
  assert.equal(payoutRef("", 2), null);
  assert.equal(payoutRef("   ", 2), null);
});

test("no sequence means no reference", () => {
  assert.equal(payoutRef("PSM0008", null), null);
  assert.equal(payoutRef("PSM0008", 0), null);
  assert.equal(payoutRef("PSM0008", Number.NaN), null);
});

test("an empty history has an empty sequence", () => {
  assert.equal(payoutSequence([]).size, 0);
});
