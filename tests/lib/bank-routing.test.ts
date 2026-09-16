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
    assert.deepEqual(
      banksForAccountTypes(["hk-meta-premium", "eu-meta-psm"]),
      ["turlit", "muxue"],
    );
  });

  it("is empty for an advertiser with no accounts — 'cannot tell', not 'none'", () => {
    assert.deepEqual(banksForAccountTypes([]), []);
  });

  it("does not guess for a type whose routing has never been stated", () => {
    // eu-meta-premium and hk-meta-business-green are real seeded types that
    // no bank option mentions. Guessing would send real money to the wrong
    // company, so they narrow nothing.
    assert.deepEqual(banksForAccountTypes(["eu-meta-premium"]), []);
    assert.deepEqual(
      banksForAccountTypes(["hk-meta-business-green", "eu-meta-psm"]),
      ["turlit"],
    );
  });

  it("ignores case and junk without throwing", () => {
    assert.deepEqual(banksForAccountTypes(["EU-Meta-PSM"]), ["turlit"]);
    assert.deepEqual(
      banksForAccountTypes([""] as string[]),
      [],
    );
  });
});
