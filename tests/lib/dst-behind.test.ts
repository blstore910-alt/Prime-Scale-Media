import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dstBehind, type DstRow } from "../../lib/pure-dst-behind";

const A = "aaaa";
const B = "bbbb";
// 27 September 2026, the day this was written and the day the live data
// was measured on.
const TODAY = new Date(2026, 8, 27);

const row = (id: string, start: string, end: string): DstRow => ({
  advertiser_id: id,
  period_start: start,
  period_end: end,
});

describe("dstBehind", () => {
  it("finds the customer who is exactly a week behind", () => {
    // The live case: one line, 14-20 Sep, and it is the 27th.
    const out = dstBehind([row(A, "2026-09-14", "2026-09-20")], TODAY);
    assert.equal(out.length, 1);
    assert.equal(out[0].daysBehind, 7);
    assert.equal(out[0].weeksMissing, 1);
    assert.equal(out[0].nextPeriodStart, "2026-09-21");
    // Yesterday, NOT today. The owner: "altijd -1 dag want vandaag kan
    // nog niet klaar" -- the supplier has not finished billing today, so
    // a base typed for it is a guess somebody has to correct.
    assert.equal(out[0].nextPeriodEnd, "2026-09-26");
    assert.equal(out[0].periodDays, 6);
  });

  it("a 13-day gap is offered as 13 days, not as one week", () => {
    // The owner: "als iemand dus 13 dagen behind is vult die dst voor 13
    // dagen." Filling a 13-day gap with a 7-day week silently leaves six
    // days behind, and nobody would notice until the next time.
    const out = dstBehind([row(A, "2026-09-08", "2026-09-14")], TODAY);
    assert.equal(out[0].daysBehind, 13);
    assert.equal(out[0].nextPeriodStart, "2026-09-15");
    assert.equal(out[0].nextPeriodEnd, "2026-09-26");
    assert.equal(out[0].periodDays, 12);
  });

  it("never offers a period that ends today", () => {
    for (const end of ["2026-09-20", "2026-09-14", "2026-08-01"]) {
      const out = dstBehind([row(A, "2026-01-01", end)], TODAY);
      assert.ok(out[0].nextPeriodEnd < "2026-09-27", end);
    }
  });

  it("leaves alone a customer whose last week only just ended", () => {
    // Six days is this week, not a missed one.
    const out = dstBehind([row(A, "2026-09-15", "2026-09-21")], TODAY);
    assert.deepEqual(out, []);
  });

  it("still says how many whole weeks, because that is the sentence", () => {
    // weeksMissing is what a person reads ("three weeks behind"); the
    // period that gets ENTERED is the whole gap, ending yesterday.
    const out = dstBehind([row(A, "2026-09-01", "2026-09-07")], TODAY);
    assert.equal(out[0].daysBehind, 20);
    assert.equal(out[0].weeksMissing, 2);
    assert.equal(out[0].periodDays, 19);
  });

  it("takes the LATEST week per customer, not the first row it meets", () => {
    const out = dstBehind(
      [
        row(A, "2026-09-14", "2026-09-20"),
        row(A, "2026-08-31", "2026-09-06"),
        row(A, "2026-09-07", "2026-09-13"),
      ],
      TODAY,
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].lastPeriodEnd, "2026-09-20");
  });

  it("sorts worst first", () => {
    const out = dstBehind(
      [row(A, "2026-09-14", "2026-09-20"), row(B, "2026-08-24", "2026-08-30")],
      TODAY,
    );
    assert.deepEqual(
      out.map((x) => x.advertiserId),
      [B, A],
    );
  });

  it("a customer with no DST line at all is not behind", () => {
    // There is no "subject to DST" flag, so somebody who has never been
    // given a line is not late -- they are not on this list. Inventing
    // them would put every customer on the screen.
    assert.deepEqual(dstBehind([], TODAY), []);
    assert.deepEqual(dstBehind(null, TODAY), []);
    assert.deepEqual(dstBehind(undefined, TODAY), []);
  });

  it("skips a row whose date cannot be read rather than trusting it", () => {
    const out = dstBehind(
      [row(A, "2026-09-14", "2026-09-20"), row(A, "", "not-a-date")],
      TODAY,
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].lastPeriodEnd, "2026-09-20");
  });

  it("skips a row with no advertiser", () => {
    const out = dstBehind([row("", "2026-01-01", "2026-01-07")], TODAY);
    assert.deepEqual(out, []);
  });

  it("counts in the reader's own clock, not UTC", () => {
    // "2026-09-20" through the Date constructor is UTC midnight, which
    // is the evening of the 19th in any western timezone -- a whole day
    // of error in a figure whose only job is counting days. Late in the
    // evening must give the same answer as the morning of the same day.
    const morning = dstBehind([row(A, "2026-09-14", "2026-09-20")], new Date(2026, 8, 27, 7, 0));
    const evening = dstBehind([row(A, "2026-09-14", "2026-09-20")], new Date(2026, 8, 27, 23, 30));
    assert.equal(morning[0].daysBehind, evening[0].daysBehind);
  });

  it("honours a different threshold", () => {
    const rows = [row(A, "2026-09-15", "2026-09-21")];
    assert.deepEqual(dstBehind(rows, TODAY), []);
    assert.equal(dstBehind(rows, TODAY, 5).length, 1);
  });
});
