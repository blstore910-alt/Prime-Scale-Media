import { strict as assert } from "node:assert";
import { test } from "node:test";
import { describeRange, rangeToDates } from "../../lib/pure-finance-range.ts";

/**
 * The period presets on the financial report.
 *
 * These decide which rows are totalled, so an off-by-one here is a wrong
 * figure on a page whose whole job is to be right. Fixed "today" in every
 * case — a date test that reads the clock passes for 364 days a year.
 */
const TUE_2026_09_15 = new Date(2026, 8, 15);

test("last 7 days covers seven days, not eight", () => {
  const r = rangeToDates("7d", TUE_2026_09_15);
  assert.equal(r.from, "2026-09-09");
  assert.equal(r.to, "2026-09-15");
});

test("last 30 days covers thirty", () => {
  const r = rangeToDates("30d", TUE_2026_09_15);
  assert.equal(r.from, "2026-08-17");
  assert.equal(r.to, "2026-09-15");
});

test("this month starts on the first", () => {
  const r = rangeToDates("mtd", TUE_2026_09_15);
  assert.equal(r.from, "2026-09-01");
  assert.equal(r.to, "2026-09-15");
});

test("last month is the whole of it", () => {
  const r = rangeToDates("lastm", TUE_2026_09_15);
  assert.equal(r.from, "2026-08-01");
  assert.equal(r.to, "2026-08-31");
});

test("last month in March lands on 28 or 29 February by itself", () => {
  assert.equal(rangeToDates("lastm", new Date(2026, 2, 10)).to, "2026-02-28");
  assert.equal(rangeToDates("lastm", new Date(2028, 2, 10)).to, "2028-02-29");
});

test("last month in January goes back a year", () => {
  const r = rangeToDates("lastm", new Date(2026, 0, 7));
  assert.equal(r.from, "2025-12-01");
  assert.equal(r.to, "2025-12-31");
});

test("all time and custom leave the dates alone", () => {
  assert.deepEqual(rangeToDates("all", TUE_2026_09_15), { from: "", to: "" });
  assert.deepEqual(rangeToDates("custom", TUE_2026_09_15), { from: "", to: "" });
});

test("a date near midnight is not shifted into the previous day", () => {
  // The bug this guards: toISOString() converts to UTC first, so 1 Sept
  // 00:30 in Amsterdam becomes 31 August. On a report where the boundary
  // of a month IS the question, that is a whole month of rows.
  const justAfterMidnight = new Date(2026, 8, 1, 0, 30);
  assert.equal(rangeToDates("mtd", justAfterMidnight).to, "2026-09-01");
});

test("the range is described the shortest way that is still true", () => {
  assert.equal(describeRange("", ""), "All time");
  assert.equal(describeRange("2026-09-01", "2026-09-19"), "1 – 19 Sep 2026");
  assert.equal(describeRange("2026-08-01", "2026-09-19"), "1 Aug – 19 Sep 2026");
  assert.equal(describeRange("2025-12-01", "2026-01-31"), "1 Dec 2025 – 31 Jan 2026");
  assert.equal(describeRange("2026-09-19", "2026-09-19"), "19 Sep 2026");
  assert.equal(describeRange("2026-09-01", ""), "From 1 Sep 2026");
  assert.equal(describeRange("", "2026-09-30"), "Up to 30 Sep 2026");
});
