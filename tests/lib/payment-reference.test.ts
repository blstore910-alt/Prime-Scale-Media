import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clientCodeDigits,
  extractTopupReference,
  formatPaymentReference,
} from "../../lib/payment-reference.ts";

describe("formatPaymentReference", () => {
  it("puts the client code in front, letters stripped", () => {
    assert.equal(formatPaymentReference("PSM2020", 4839), "2020-4839");
    assert.equal(formatPaymentReference("PSM000005", "117"), "000005-117");
  });

  it("falls back to the bare reference when the code is unknown", () => {
    // An unprefixed reference still matches; a missing one does not.
    assert.equal(formatPaymentReference(null, 4839), "4839");
    assert.equal(formatPaymentReference("", 4839), "4839");
    assert.equal(formatPaymentReference("PSM", 4839), "4839");
  });

  it("is empty when there is no reference to show", () => {
    assert.equal(formatPaymentReference("PSM2020", null), "");
    assert.equal(formatPaymentReference("PSM2020", ""), "");
  });

  it("keeps leading zeros — the code is an identifier, not a number", () => {
    assert.equal(clientCodeDigits("PSM000005"), "000005");
  });
});

describe("extractTopupReference", () => {
  it("reads our own composed form and takes the SECOND half", () => {
    // The whole point. Under the old longest-run rule the six-digit client
    // code won and the payment was matched against the wrong number.
    assert.equal(extractTopupReference("000005-4839"), "4839");
    assert.equal(extractTopupReference("2020-4839"), "4839");
    assert.equal(extractTopupReference("payment 000123 - 998877 thanks"), "998877");
  });

  it("still handles a bare reference wrapped in bank text", () => {
    assert.equal(extractTopupReference("PSM-TOPUP 1483181337"), "1483181337");
    assert.equal(extractTopupReference("ref 1483181337"), "1483181337");
    assert.equal(extractTopupReference("1483181337"), "1483181337");
  });

  it("does not read a short-short pair as composed", () => {
    // "12-2026" is a date; neither half is a plausible reference, and the
    // second half is only 4 digits after a 2-digit first half, which the
    // pattern requires 3+ for.
    assert.equal(extractTopupReference("12-2026"), "2026");
  });

  it("prefers the composed form even when a longer run sits elsewhere", () => {
    assert.equal(
      extractTopupReference("IBAN NL91ABNA0417164300 ref 000005-4839"),
      "4839",
    );
  });

  it("returns null when there is nothing usable", () => {
    assert.equal(extractTopupReference(null), null);
    assert.equal(extractTopupReference(""), null);
    assert.equal(extractTopupReference("thanks!"), null);
    assert.equal(extractTopupReference("12 34"), null);
  });
});
