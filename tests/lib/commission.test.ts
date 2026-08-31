import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  percentageCommission,
  accruesPerTopup,
} from "../../lib/commission.ts";

describe("percentageCommission", () => {
  it("10% of 500 is 50", () => {
    assert.equal(percentageCommission(500, 10), 50);
  });

  it("7.5% of 500 is 37.50", () => {
    assert.equal(percentageCommission(500, 7.5), 37.5);
  });

  it("rounds to 2 decimals", () => {
    // 333.33 * 7 = 2333.31 → 23.33
    assert.equal(percentageCommission(333.33, 7), 23.33);
  });

  it("returns 0 for non-positive amount or pct", () => {
    assert.equal(percentageCommission(0, 10), 0);
    assert.equal(percentageCommission(500, 0), 0);
    assert.equal(percentageCommission(-100, 10), 0);
    assert.equal(percentageCommission(500, -5), 0);
  });

  it("returns 0 for null/NaN inputs", () => {
    assert.equal(percentageCommission(500, null), 0);
    assert.equal(percentageCommission(500, undefined), 0);
    assert.equal(percentageCommission(NaN, 10), 0);
  });

  it("refuses a fraction slipped in where a percent is expected", () => {
    // A stored 0.1 is almost certainly a mistake (would pay 0.05 on
    // 500). It's still < 100 so it computes — but a value > 100 is
    // rejected outright as clearly wrong.
    assert.equal(percentageCommission(500, 150), 0);
  });

  it("full percent (100) pays the whole amount", () => {
    assert.equal(percentageCommission(500, 100), 500);
  });
});

describe("accruesPerTopup", () => {
  it("only percentage accrues per top-up", () => {
    assert.equal(accruesPerTopup("percentage"), true);
    assert.equal(accruesPerTopup("monthly"), false);
    assert.equal(accruesPerTopup("onetime"), false);
    assert.equal(accruesPerTopup("fixed"), false);
    assert.equal(accruesPerTopup(null), false);
  });
});
