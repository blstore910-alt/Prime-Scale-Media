import test from "node:test";
import assert from "node:assert/strict";
import { compactRangeLabel } from "../../lib/pure-date-range-label.ts";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

test("a whole calendar month is named, not spelled out", () => {
  assert.equal(compactRangeLabel(d(2026, 8, 1), d(2026, 8, 31)), "Aug 2026");
  // February, and a leap February -- the last day is not a constant.
  assert.equal(compactRangeLabel(d(2026, 2, 1), d(2026, 2, 28)), "Feb 2026");
  assert.equal(compactRangeLabel(d(2024, 2, 1), d(2024, 2, 29)), "Feb 2024");
});

test("a month that stops one day short is NOT called the month", () => {
  assert.equal(compactRangeLabel(d(2026, 8, 1), d(2026, 8, 30)), "1\u201330 Aug 2026");
});

test("a whole calendar year is just the year", () => {
  assert.equal(compactRangeLabel(d(2026, 1, 1), d(2026, 12, 31)), "2026");
});

test("one day is one date", () => {
  assert.equal(compactRangeLabel(d(2026, 8, 4), d(2026, 8, 4)), "4 Aug 2026");
});

test("within a year the year is printed once", () => {
  assert.equal(
    compactRangeLabel(d(2026, 8, 1), d(2026, 9, 3)),
    "1 Aug \u2013 3 Sep 2026",
  );
});

test("across years both years are printed", () => {
  assert.equal(
    compactRangeLabel(d(2026, 8, 1), d(2027, 1, 3)),
    "1 Aug 2026 \u2013 3 Jan 2027",
  );
});

test("a backwards range reads forwards", () => {
  assert.equal(compactRangeLabel(d(2026, 8, 31), d(2026, 8, 1)), "Aug 2026");
});

test("a missing or unparseable end gives nothing, never 'Invalid Date'", () => {
  assert.equal(compactRangeLabel(d(2026, 8, 1), null), "");
  assert.equal(compactRangeLabel(null, null), "");
  assert.equal(compactRangeLabel(d(2026, 8, 1), "not a date"), "");
});

test("it is shorter than what it replaced, which is the whole point", () => {
  const old = "01-08-2026 - 31-08-2026";
  assert.ok(compactRangeLabel(d(2026, 8, 1), d(2026, 8, 31)).length < old.length);
});
