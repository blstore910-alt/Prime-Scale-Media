import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { banksForAccountTypes } from "../../lib/bank-routing.ts";

describe("banksForAccountTypes", () => {
  it("routes an EU-PSM advertiser to one bank, so nothing is asked", () => {
    assert.deepEqual(banksForAccountTypes(["eu-meta-psm"]), ["turlit"]);
  });

  it("groups several TURLIT families into the same single destination", () => {
    assert.deepEqual(
      banksForAccountTypes(["google", "tiktok", "eu-meta-psm"]),
      ["turlit"],
    );
  });

  it("returns every bank an advertiser genuinely spans, in display order", () => {
    // GH is the only family that does not come to our own bank.
    assert.deepEqual(
      banksForAccountTypes(["eu-meta-psm-gh", "eu-meta-psm"]),
      ["turlit", "zanel"],
    );
  });

  it("routes the Hong Kong families to our own bank, not to MUXUE", () => {
    assert.deepEqual(banksForAccountTypes(["hk-meta-premium"]), ["turlit"]);
    assert.deepEqual(banksForAccountTypes(["hk-meta-business"]), ["turlit"]);
    assert.deepEqual(
      banksForAccountTypes(["hk-meta-business-green"]),
      ["turlit"],
    );
  });

  it("is empty for an advertiser with no accounts — 'cannot tell', not 'none'", () => {
    assert.deepEqual(banksForAccountTypes([]), []);
  });

  it("does not guess for a type whose routing has never been stated", () => {
    // eu-meta-premium is a real seeded type whose routing nobody has ever
    // stated, and so is any type added on the admin screen tomorrow.
    // Guessing would send real money to the wrong company.
    assert.deepEqual(banksForAccountTypes(["eu-meta-premium"]), []);
    assert.deepEqual(banksForAccountTypes(["something-new"]), []);
  });

  it("ignores case and junk without throwing", () => {
    assert.deepEqual(banksForAccountTypes(["EU-Meta-PSM"]), ["turlit"]);
    assert.deepEqual(
      banksForAccountTypes([""] as string[]),
      [],
    );
  });
});
