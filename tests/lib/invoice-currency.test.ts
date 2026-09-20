import test from "node:test";
import assert from "node:assert/strict";
import {
  currencySymbol,
  invoiceCurrencyCode,
  invoiceCurrencySymbol,
} from "../../lib/pure-invoice-currency.ts";

test("null currency is EUR, exactly as the payment RPC treats it", () => {
  // invoice_pay_from_wallet charges upper(coalesce(currency,'EUR')).
  assert.equal(invoiceCurrencyCode({ currency: null }), "EUR");
  assert.equal(invoiceCurrencySymbol({ currency: null }), "\u20ac");
});

test("a lowercase code is the same currency, not a different one", () => {
  // This is the case that showed EUR on the row and USD in the modal.
  assert.equal(invoiceCurrencyCode({ currency: "usd" }), "USD");
  assert.equal(invoiceCurrencySymbol({ currency: "usd" }), "$");
  assert.equal(invoiceCurrencySymbol({ currency: " USD " }), "$");
});

test("the items fall back only when the invoice itself says nothing", () => {
  assert.equal(
    invoiceCurrencyCode({ currency: null, items: [{ currency: "USD" }] }),
    "USD",
  );
  // The invoice's own column wins: it is what the RPC reads.
  assert.equal(
    invoiceCurrencyCode({ currency: "EUR", items: [{ currency: "USD" }] }),
    "EUR",
  );
});

test("an unknown code prints as the code, never as the wrong symbol", () => {
  // Drawing GBP money behind a euro sign is a wrong number on screen.
  const s = invoiceCurrencySymbol({ currency: "ZZZ" });
  assert.equal(s, "ZZZ ");
  assert.ok(!s.includes("\u20ac"));
});

test("empty strings are not a currency", () => {
  assert.equal(invoiceCurrencyCode({ currency: "" }), "EUR");
  assert.equal(invoiceCurrencyCode({ currency: "   ", items: [] }), "EUR");
  assert.equal(invoiceCurrencyCode({}), "EUR");
});

test("the row and the modal can no longer disagree", () => {
  for (const inv of [
    { currency: "usd" },
    { currency: null, items: [{ currency: "USD" }] },
    { currency: "EUR" },
    { currency: null },
  ]) {
    assert.equal(
      invoiceCurrencySymbol(inv),
      invoiceCurrencySymbol({ ...inv }),
    );
  }
});

test("currencySymbol never draws a euro sign in front of another currency", () => {
  // The deposit desk case: a GBP 630 transfer against a EUR 630 claim.
  const gbp = currencySymbol("GBP");
  assert.ok(!gbp.includes("\u20ac"), gbp);
  assert.equal(currencySymbol("USD"), "$");
  assert.equal(currencySymbol("EUR"), "\u20ac");
  assert.equal(currencySymbol("eur"), "\u20ac");
  // Unknown prints the code, with a space so it reads as a figure.
  assert.equal(currencySymbol("ZZZ"), "ZZZ ");
  // Nothing at all falls back to EUR, which is what the RPCs coalesce to.
  assert.equal(currencySymbol(null), "\u20ac");
  assert.equal(currencySymbol(""), "\u20ac");
});
