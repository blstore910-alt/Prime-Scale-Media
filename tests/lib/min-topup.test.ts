import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { effectiveMinTopup } from "../../lib/min-topup.ts";

describe("effectiveMinTopup", () => {
  it("has no minimum before the plan is active — the first payment is the one that must be easy", () => {
    assert.equal(effectiveMinTopup({ planActive: false }), 0);
    assert.equal(
      effectiveMinTopup({ planActive: false, community: "NSA" }),
      0,
    );
  });

  it("is 300 once the plan is running", () => {
    assert.equal(effectiveMinTopup({ planActive: true }), 300);
  });

  it("is 250 for NSA once the plan is running", () => {
    assert.equal(effectiveMinTopup({ planActive: true, community: "NSA" }), 250);
    assert.equal(effectiveMinTopup({ planActive: true, community: "nsa" }), 250);
    assert.equal(
      effectiveMinTopup({ planActive: true, community: "  NSA " }),
      250,
    );
  });

  it("falls back to 300 for a community with no rule of its own", () => {
    assert.equal(
      effectiveMinTopup({ planActive: true, community: "Some Other Group" }),
      300,
    );
  });

  it("lets an admin's explicit value win, including zero", () => {
    // The old `minTopup || 300` treated a deliberate 0 as unset and silently
    // put the floor back — an admin removing a minimum would find it had
    // never gone away.
    assert.equal(effectiveMinTopup({ walletMin: 0, planActive: true }), 0);
    assert.equal(effectiveMinTopup({ walletMin: 50, planActive: true }), 50);
    // …but NOT before the plan is active. Wallets are created with
    // min_topup = 300 by column default, which is indistinguishable from an
    // admin having typed it — so the stored value gets no say on the one
    // payment that must not have a floor.
    assert.equal(effectiveMinTopup({ walletMin: 1000, planActive: false }), 0);
    assert.equal(effectiveMinTopup({ walletMin: 300, planActive: false }), 0);
    assert.equal(
      effectiveMinTopup({ walletMin: "75", planActive: true, community: "NSA" }),
      75,
    );
  });

  it("ignores a nonsense override rather than trusting it", () => {
    assert.equal(effectiveMinTopup({ walletMin: -5, planActive: true }), 300);
    assert.equal(
      effectiveMinTopup({ walletMin: "abc", planActive: true }),
      300,
    );
    assert.equal(effectiveMinTopup({ walletMin: null, planActive: true }), 300);
    assert.equal(
      effectiveMinTopup({ walletMin: undefined, planActive: false }),
      0,
    );
  });
});
