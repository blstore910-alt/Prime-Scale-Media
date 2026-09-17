import { describe, it, test } from "node:test";
import assert from "node:assert/strict";
import { banksForAccountTypes, bankForTypeSlug } from "../../lib/bank-routing.ts";

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

// ── Slug spelling ────────────────────────────────────────────────────
// The seed migration writes `hk-meta-premium`; a type created through the
// settings UI is slugified from its label and comes out `meta-hk-premium`.
// Both are the same type, and on the live tenant it was the second spelling
// throughout — so nothing routed at all.
test("a type slug matches whatever order its words are in", () => {
  assert.equal(bankForTypeSlug("hk-meta-premium"), "turlit");
  assert.equal(bankForTypeSlug("meta-hk-premium"), "turlit");
  assert.equal(bankForTypeSlug("meta-hk-business"), "turlit");
  assert.equal(bankForTypeSlug("meta-hk-business-green"), "turlit");
  assert.equal(bankForTypeSlug("eu-meta-psm"), "turlit");
  assert.equal(bankForTypeSlug("meta-eu-psm"), "turlit");
});

test("GH is its own destination in either spelling", () => {
  assert.equal(bankForTypeSlug("eu-meta-psm-gh"), "zanel");
  assert.equal(bankForTypeSlug("meta-eu-psm-gh"), "zanel");
});

test("GH is not confused with plain PSM", () => {
  // Same words plus one. A sloppier match would collapse these and send GH
  // money to the wrong company.
  assert.notEqual(bankForTypeSlug("meta-eu-psm-gh"), bankForTypeSlug("meta-eu-psm"));
});

test("an unstated type stays unstated", () => {
  // Meta-EU-Premium is a real seeded type that no bank option mentions.
  assert.equal(bankForTypeSlug("meta-eu-premium"), null);
  assert.equal(bankForTypeSlug("something-new"), null);
  assert.equal(bankForTypeSlug(""), null);
  assert.equal(bankForTypeSlug(null), null);
});

test("both spellings reach the same beneficiary through the list helper", () => {
  assert.deepEqual(banksForAccountTypes(["meta-hk-premium"]), ["turlit"]);
  assert.deepEqual(banksForAccountTypes(["meta-eu-psm-gh"]), ["zanel"]);
  assert.deepEqual(
    banksForAccountTypes(["meta-hk-premium", "meta-eu-psm-gh"]),
    ["turlit", "zanel"],
  );
  // Unknown narrows nothing.
  assert.deepEqual(banksForAccountTypes(["meta-eu-premium"]), []);
});
