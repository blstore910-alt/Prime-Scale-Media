import { strict as assert } from "node:assert";
import { test } from "node:test";

import { refundCeiling, refundFlag } from "../../lib/pure-refund.ts";

const basis = (o: Partial<Parameters<typeof refundCeiling>[0]> = {}) => ({
  paidIn: 0,
  ourFees: 0,
  spent: 0,
  alreadyRefunded: 0,
  outstandingCredit: 0,
  ...o,
});

test("the ceiling is what came in, less what is ours and what is gone", () => {
  const c = refundCeiling(
    basis({ paidIn: 1000, ourFees: 20, spent: 400, alreadyRefunded: 50 }),
  );
  assert.equal(c.max, 530);
  assert.equal(c.warning, null);
});

test("an advance we extended is not refundable — it never arrived", () => {
  // The wallet shows 500 because we fronted it. Refunding that sends
  // out money nobody ever paid us.
  const c = refundCeiling(basis({ paidIn: 500, outstandingCredit: 500 }));
  assert.equal(c.max, 0);
});

test("money sitting on an ad account IS refundable — it is not spent", () => {
  // The distinction the wallet balance cannot make. 1000 in, 100 of it
  // actually spent on ads: 900 is still the customer's, wherever it
  // happens to be sitting.
  const c = refundCeiling(basis({ paidIn: 1000, spent: 100 }));
  assert.equal(c.max, 900);
});

test("our fees come off, so we never refund our own margin", () => {
  const c = refundCeiling(basis({ paidIn: 1000, ourFees: 122.34 }));
  assert.equal(c.max, 877.66);
});

test("a negative ceiling is clamped to zero AND says why", () => {
  // Clamping without saying so is how "we paid out more than came in"
  // stays invisible.
  const c = refundCeiling(basis({ paidIn: 100, alreadyRefunded: 250 }));
  assert.equal(c.max, 0);
  assert.match(c.warning ?? "", /150\.00/);
  assert.match(c.warning ?? "", /Nothing can be refunded/);
});

test("nothing paid in means nothing to refund, and no alarm", () => {
  const c = refundCeiling(basis());
  assert.equal(c.max, 0);
  assert.equal(c.warning, null);
});

test("NaN in any input does not become a silent zero ceiling", () => {
  // Number("") is 0 but Number("abc") is NaN, and NaN - anything is
  // NaN, which formats as a blank or "NaN" on screen. Each input is
  // made safe on its own so one unreadable figure does not wipe out
  // the other four.
  const c = refundCeiling(basis({ paidIn: 1000, ourFees: NaN }));
  assert.equal(c.max, 1000);
});

test("the steps add up to the answer, so the screen can show the sum", () => {
  const c = refundCeiling(
    basis({ paidIn: 1000, ourFees: 20, spent: 400, alreadyRefunded: 50 }),
  );
  const total = c.steps.reduce(
    (t, s) => Math.round((t + (s.subtract ? -s.amount : s.amount)) * 100) / 100,
    0,
  );
  assert.equal(total, c.max);
});

test("a step worth nothing is left out, except the one that anchors it", () => {
  const c = refundCeiling(basis({ paidIn: 500 }));
  assert.equal(c.steps.length, 1);
  assert.equal(c.steps[0].label, "Paid in (completed top-ups)");
  // And it stays even at zero, so the panel never renders empty.
  const z = refundCeiling(basis());
  assert.equal(z.steps.length, 1);
});

test("rounding survives three decimal-heavy subtractions", () => {
  const c = refundCeiling(
    basis({ paidIn: 0.3, ourFees: 0.1, spent: 0.1, alreadyRefunded: 0.1 }),
  );
  assert.equal(c.max, 0);
});

test("a wallet holding more than the ceiling is flagged, not hidden", () => {
  const f = refundFlag(700, 500);
  assert.equal(f.level, "look");
  assert.match(f.note ?? "", /200\.00/);
});

test("a wallet holding less than the ceiling is normal", () => {
  // Money on an ad account: the ceiling counts it, the balance does
  // not. That is the expected shape, not a fault.
  assert.equal(refundFlag(200, 500).level, "ok");
  assert.equal(refundFlag(500, 500).level, "ok");
});
