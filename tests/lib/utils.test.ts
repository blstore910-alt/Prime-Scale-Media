import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  generateSlug,
  getInitials,
  formatRate,
  calculateTopupAmount,
  formatCurrency,
} from "../../lib/utils-pure.ts";

test("generateSlug lowercases and dashifies", () => {
  assert.equal(generateSlug("Acme Corp"), "acme-corp");
  assert.equal(generateSlug("  Multiple    spaces  "), "multiple-spaces");
  assert.equal(generateSlug("Bjørn Ørn!"), "bjrn-rn");
  assert.equal(generateSlug("keep-dashes"), "keep-dashes");
});

test("getInitials returns first letter of each word", () => {
  assert.equal(getInitials("John Doe"), "JD");
  assert.equal(getInitials("Jane Alice Smith"), "JAS");
  assert.equal(getInitials("solo"), "s");
});

test("formatRate rounds to 8 decimals", () => {
  assert.equal(formatRate(1.234567890123), 1.23456789);
  assert.equal(formatRate(2), 2);
});

test("formatRate returns undefined for null/undefined", () => {
  assert.equal(formatRate(null), undefined);
  assert.equal(formatRate(undefined), undefined);
});

test("calculateTopupAmount USD passes through with fee", () => {
  const result = calculateTopupAmount(100, [], "USD", 5);
  assert.equal(result.amountUSD, 100);
  assert.equal(result.feeAmount, 5);
  assert.equal(result.topupAmount, 95);
});

test("calculateTopupAmount EUR uses first exchange rate", () => {
  // Rate object shape: eur is EUR-per-USD, so 100 EUR at 0.9 rate = 90 USD.
  const rates = [{ eur: 0.9, gbp: 0.8, hkd: 7.8 }] as never;
  const result = calculateTopupAmount(100, rates, "EUR", 0);
  assert.equal(result.amountUSD, 90);
  assert.equal(result.topupAmount, 90);
});

test("calculateTopupAmount returns zeros when rates undefined", () => {
  const result = calculateTopupAmount(100, undefined, "EUR", 10);
  assert.deepEqual(result, {
    topupAmount: 0,
    amountUSD: 0,
    feeAmount: 0,
  });
});

test("formatCurrency uses USD by default", () => {
  const formatted = formatCurrency(1234.5);
  // Different Node versions format slightly differently but $1,234.5 or $1,234.50 both count.
  assert.match(formatted, /\$1,234/);
});

test("formatCurrency respects EUR", () => {
  const formatted = formatCurrency(1000, "EUR");
  assert.match(formatted, /€1,000/);
});
