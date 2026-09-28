import { describe, it, test } from "node:test";
import assert from "node:assert/strict";
import {
  bankDestination,
  bankForTypeSlug,
  bankGroupFromStored,
  banksForAccountTypes,
} from "../../lib/bank-routing.ts";

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

// ── THE BANK A CUSTOMER GETS BEFORE THEY HOLD ANYTHING ──────────────
//
// The owner, 28-09: "bij aanmelding iedereen wallet topup naar turlit
// behalve GH mensen naar zanel". The rules above derive the bank from
// the accounts somebody HOLDS; these cover the customer who holds none
// yet, which is the transfer they have least basis to doubt.

test("a brand-new customer with nothing assigned goes to TURLIT, and we say so", () => {
  const d = bankDestination({ accountTypeSlugs: [], accountsUnknown: false });
  assert.equal(d.group, "turlit");
  assert.equal(d.from, "default");
  assert.deepEqual(d.fork, []);
});

test("a GH customer assigned at the invite goes to ZANEL from day one", () => {
  const d = bankDestination({
    accountTypeSlugs: [],
    accountsUnknown: false,
    assigned: "zanel",
  });
  assert.equal(d.group, "zanel");
  assert.equal(d.from, "assigned");
});

test("their own accounts beat what was assigned", () => {
  // Once they hold something, the money already goes somewhere and that
  // is the stronger fact. In practice the two agree; when they do not,
  // the account wins.
  const d = bankDestination({
    accountTypeSlugs: ["eu-meta-psm"],
    accountsUnknown: false,
    assigned: "zanel",
  });
  assert.equal(d.group, "turlit");
  assert.equal(d.from, "accounts");
});

test("a GH account routes to ZANEL whether or not anything was assigned", () => {
  for (const assigned of [undefined, "turlit", "zanel"]) {
    const d = bankDestination({
      accountTypeSlugs: ["eu-meta-psm-gh"],
      accountsUnknown: false,
      assigned,
    });
    assert.equal(d.group, "zanel");
    assert.equal(d.from, "accounts");
  }
});

test("both families at once is a fork, and assigning does not settle it", () => {
  const d = bankDestination({
    accountTypeSlugs: ["eu-meta-psm", "eu-meta-psm-gh"],
    accountsUnknown: false,
    assigned: "turlit",
  });
  assert.deepEqual(d.fork, ["turlit", "zanel"]);
  assert.equal(d.from, "accounts");
});

test("a FAILED read of the accounts is not an empty list", () => {
  // "could not read" must not become "holds nothing", or somebody whose
  // accounts route to ZANEL is quietly shown TURLIT.
  const d = bankDestination({
    accountTypeSlugs: ["eu-meta-psm-gh"],
    accountsUnknown: true,
    assigned: "zanel",
  });
  assert.equal(d.group, "zanel");
  assert.equal(d.from, "assigned", "the unread accounts were not used");
});

test("an unreadable account list with nothing assigned still names its default", () => {
  const d = bankDestination({ accountTypeSlugs: [], accountsUnknown: true });
  assert.equal(d.group, "turlit");
  assert.equal(d.from, "default");
});

test("a stored value nobody recognises is null, never a guess", () => {
  assert.equal(bankGroupFromStored("muxue"), null, "muxue is retired");
  assert.equal(bankGroupFromStored("ZANEL"), "zanel");
  assert.equal(bankGroupFromStored("  turlit "), "turlit");
  assert.equal(bankGroupFromStored("barclays"), null);
  assert.equal(bankGroupFromStored(""), null);
  assert.equal(bankGroupFromStored(null), null);
  assert.equal(bankGroupFromStored(undefined), null);
});

test("an unrecognised assignment falls to the default, not to nothing", () => {
  const d = bankDestination({
    accountTypeSlugs: [],
    accountsUnknown: false,
    assigned: "muxue",
  });
  assert.equal(d.group, "turlit");
  assert.equal(d.from, "default");
});
