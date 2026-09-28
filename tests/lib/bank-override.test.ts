import { test } from "node:test";
import assert from "node:assert/strict";

import { bankOverrideFor, type FlatBankRow } from "../../lib/pure-bank-override";
import { bankForTypeSlug } from "../../lib/bank-routing";

const turlitEur: FlatBankRow = {
  slug: "eu-meta-psm",
  currency: "EUR",
  is_active: true,
  label: "TURLIT LLC — EUR (Wise BE)",
  beneficiary: "TURLIT LLC",
  account_no: "BE86967511906550",
  swift_bic: "TRWIBEB1XXX",
  bank_name: "Wise",
  bank_address: null,
  routing_no: null,
  notes: null,
};

test("nothing stored means the built-in answers, and that is normal", () => {
  assert.deepEqual(bankOverrideFor([], "turlit", "EUR"), {
    override: null,
    reason: "none",
  });
  assert.equal(bankOverrideFor(null, "turlit", "EUR").reason, "none");
  assert.equal(bankOverrideFor(undefined, "turlit", "EUR").reason, "none");
});

test("a stored row for this group and currency is used", () => {
  const r = bankOverrideFor([turlitEur], "turlit", "EUR");
  assert.equal(r.reason, null);
  assert.equal(r.override!.account_no, "BE86967511906550");
  assert.equal(r.override!.beneficiary, "TURLIT LLC");
});

test("currency is matched, case and all", () => {
  assert.equal(bankOverrideFor([turlitEur], "turlit", "eur").reason, null);
  assert.equal(bankOverrideFor([turlitEur], "turlit", "USD").reason, "none");
});

test("a row belonging to another bank group is not borrowed", () => {
  // eu-meta-psm-gh routes to zanel, not turlit.
  const gh = { ...turlitEur, slug: "eu-meta-psm-gh" };
  assert.equal(bankOverrideFor([gh], "turlit", "EUR").reason, "none");
  assert.equal(bankOverrideFor([gh], "zanel", "EUR").reason, null);
});

test("an inactive row is not a destination", () => {
  assert.equal(
    bankOverrideFor([{ ...turlitEur, is_active: false }], "turlit", "EUR").reason,
    "none",
  );
});

test("a row with no account number is absent, not an instruction to pay into a blank", () => {
  for (const blank of ["", "   ", null, undefined]) {
    const r = bankOverrideFor(
      [{ ...turlitEur, account_no: blank as string }],
      "turlit",
      "EUR",
    );
    assert.equal(r.reason, "none", String(blank));
  }
});

/**
 * The one that matters. Several ad-account types route to one bank
 * group, so several rows can answer the same question. When they
 * disagree we do not know which is right — and the dialog's own
 * comments record four occasions on which picking anyway sent a real
 * transfer to the wrong legal entity.
 */
test("two rows that disagree fall back rather than pick one", () => {
  const other = {
    ...turlitEur,
    slug: "google",
    account_no: "BE00000000000000",
  };
  const r = bankOverrideFor([turlitEur, other], "turlit", "EUR");
  assert.equal(r.override, null);
  assert.equal(r.reason, "disagree");
});

test("two rows that agree are one answer, not a conflict", () => {
  const same = { ...turlitEur, slug: "google" };
  const r = bankOverrideFor([turlitEur, same], "turlit", "EUR");
  assert.equal(r.reason, null);
  assert.equal(r.override!.account_no, "BE86967511906550");
});

test("whitespace is not a disagreement", () => {
  const padded = { ...turlitEur, slug: "google", account_no: "  BE86967511906550 " };
  assert.equal(bankOverrideFor([turlitEur, padded], "turlit", "EUR").reason, null);
});

test("a row with no slug cannot be routed and is ignored", () => {
  assert.equal(
    bankOverrideFor([{ ...turlitEur, slug: null }], "turlit", "EUR").reason,
    "none",
  );
});

test("a difference in a NON-money field is not a conflict", () => {
  // Notes and the address do not decide where the money lands.
  const other = { ...turlitEur, slug: "google", notes: "ask for a reference" };
  assert.equal(bankOverrideFor([turlitEur, other], "turlit", "EUR").reason, null);
});

test("a slug spelled the other way round still overrides", () => {
  // The seed writes `hk-meta-premium`; a type created through
  // /settings/ad-account-types is slugified from its label into
  // `meta-hk-premium`. bank-routing.ts matches on the set of words for
  // exactly that reason, and this resolver used a raw map lookup -- so
  // routing sent the customer to TURLIT while the override quietly
  // failed and the BUILT-IN details were shown. The owner is told in
  // bold on /settings/banks that what they save replaces those details.
  const r = bankOverrideFor(
    [{ ...turlitEur, slug: "meta-hk-premium" }],
    "turlit",
    "EUR",
  );
  assert.equal(r.reason, null);
  assert.equal(r.override!.account_no, "BE86967511906550");
});

test("routing and the override agree on every mapped slug", () => {
  // The two must never drift again: if bankForTypeSlug routes a slug to
  // a group, an active row on that slug must be able to override it.
  for (const slug of [
    "eu-meta-psm",
    "hk-meta-premium",
    "hk-meta-business",
    "eu-meta-psm-gh",
    "google",
    "tiktok",
    // …and the same names written the other way round.
    "meta-hk-premium",
    "meta-eu-psm-gh",
  ]) {
    const group = bankForTypeSlug(slug);
    assert.ok(group, `${slug} routes nowhere`);
    const r = bankOverrideFor([{ ...turlitEur, slug }], group!, "EUR");
    assert.equal(
      r.reason,
      null,
      `${slug} routes to ${group} but could not be overridden`,
    );
  }
});
