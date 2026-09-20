import assert from "node:assert/strict";
import test from "node:test";

import { formatCurrency } from "../../lib/utils-pure.ts";

// The three live call sites that pass an unvalidated code straight
// through: readonly-topup-row (which renders on /inactive, the only
// screen a deactivated customer has left), verify-topup-dialog, and
// notification-dialog. top_ups.currency is a free string the server
// never validates, so every one of these is reachable.

test("the ordinary cases are unchanged", () => {
  assert.equal(formatCurrency(1234.5, "EUR"), "€1,234.50");
  assert.equal(formatCurrency(1234.5, "USD"), "$1,234.50");
  assert.equal(formatCurrency(0, "USD"), "$0.00");
  // Lower case is what a hand-authored row often carries.
  assert.equal(formatCurrency(10, "eur"), "€10.00");
});

test("a blank code prints the number, not a wrong symbol", () => {
  // This is the case `?? "EUR"` does not catch, because "" is not null,
  // and the case that used to throw a RangeError.
  assert.equal(formatCurrency(1234.5, ""), "1,234.50");
  assert.equal(formatCurrency(1234.5, "   "), "1,234.50");
});

test("a code that is not a currency prints the code beside the number", () => {
  // Three letters, so it looks like a code and is not one. Printing it
  // is honest; a euro sign on it would not be.
  const out = formatCurrency(1234.5, "XYZ");
  assert.ok(out.includes("1,234.50"), out);
  assert.ok(out.includes("XYZ"), out);
});

test("nothing throws, whatever the row carries", () => {
  for (const code of ["", " ", "E", "EURO", "12", "€", "e u r", "null"]) {
    assert.doesNotThrow(
      () => formatCurrency(99, code),
      `formatCurrency threw on ${JSON.stringify(code)}`,
    );
  }
  // And a broken amount is a zero, not NaN on a money screen.
  assert.equal(formatCurrency(Number.NaN, "EUR"), "€0.00");
});
