import { strict as assert } from "node:assert";
import { test } from "node:test";

import { invoiceTypeLabel } from "../../lib/invoice-type";

test("the monthly plan is called the monthly plan", () => {
  assert.equal(invoiceTypeLabel("subscription"), "Monthly plan");
  assert.equal(invoiceTypeLabel("subscription_adjustment"), "Plan change");
  assert.equal(invoiceTypeLabel("manual_invoice"), "One-off charge");
});

test("a top-up reads the same whichever slug the row carries", () => {
  // Both spellings exist in this codebase; they must not read differently
  // on a customer's billing page.
  assert.equal(invoiceTypeLabel("wallet_topup"), "Wallet top-up");
  assert.equal(invoiceTypeLabel("topup"), "Wallet top-up");
});

test("an unknown type reads as itself, not as Other", () => {
  // A type added in SQL before anybody names it here must still be
  // legible on the page — a bucket label would hide it.
  assert.equal(invoiceTypeLabel("dst_tax"), "Dst tax");
  assert.equal(invoiceTypeLabel("some-new-thing"), "Some new thing");
});

test("no type at all is an invoice, not a dash or an empty cell", () => {
  assert.equal(invoiceTypeLabel(null), "Invoice");
  assert.equal(invoiceTypeLabel(undefined), "Invoice");
  assert.equal(invoiceTypeLabel("   "), "Invoice");
});

test("case and padding in the slug do not matter", () => {
  assert.equal(invoiceTypeLabel(" Subscription "), "Monthly plan");
  assert.equal(invoiceTypeLabel("SUBSCRIPTION"), "Monthly plan");
});
