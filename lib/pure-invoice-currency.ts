// ─────────────────────────────────────────────────────────────────────
// One answer to "what currency is this invoice in"
// ─────────────────────────────────────────────────────────────────────
// /invoices asked twice, two hundred lines apart, and got two answers.
// The row did CURRENCY_SYMBOLS[invoice.currency] ?? "€" -- no
// uppercasing, no fallback to the line items. The confirm modal, in the
// same file, did the uppercased version with the items fallback, and
// its comment said this had been fixed.
//
// So a hand-authored invoice with currency = "usd" showed EUR 2,000.00
// on the row, USD 2,000.00 in the modal one click later, "usd 2,000.00"
// on the PDF, and invoice_pay_from_wallet charged USD -- because it does
// upper(coalesce(currency,'EUR')). Four surfaces, three answers, on the
// figure somebody is about to confirm.
//
// This follows the RPC exactly, because the RPC is what takes the
// money: null means EUR, and the comparison is case-insensitive.
//
// An UNKNOWN code prints as the code, never as a euro sign. Drawing
// "£" money with a "€" in front of it is a wrong number on the screen;
// printing "GBP 500.00" is a true one that happens to be unstyled.
// ─────────────────────────────────────────────────────────────────────

import { CURRENCY_SYMBOLS } from "@/lib/constants";

export interface InvoiceCurrencyish {
  currency?: string | null;
  items?: { currency?: string | null }[] | null;
}

/**
 * The uppercased code the payment RPC would charge in.
 *
 * ── AND ITEMS[0] IS NOT PART OF THAT ────────────────────────────────
 *
 * This said "follows the RPC exactly" and then consulted the first line
 * item before falling back. The RPC does not look at `items` at all:
 *
 *     v_cur := upper(coalesce(v_inv.currency, 'EUR'));
 *
 * So an invoice with currency NULL, total 2000 and items[0].currency
 * 'USD' drew "$2,000.00" on the customer's Billing row, in the Pay now
 * modal ("from your USD wallet") and on the PDF they file -- and the
 * RPC debited EUR 2,000 from the EUR wallet. About 325 dollars over,
 * off a wallet no surface mentioned, and there is no undo.
 *
 * A screen that guesses better than the thing taking the money is not
 * being helpful; it is describing a payment that will not happen.
 */
export function invoiceCurrencyCode(invoice: InvoiceCurrencyish): string {
  const own = String(invoice?.currency ?? "").trim();
  if (own) return own.toUpperCase();
  return "EUR";
}

/**
 * What to draw in front of an amount, for any currency code.
 *
 * Eight screens wrote `currency === "USD" ? "$" : "€"`, which is a
 * statement that nothing else exists. Wallets are EUR/USD, so most of
 * those were harmless -- but a BANK DEPOSIT is whatever the payer sent,
 * and the top-up screen actively offers GBP and HKD transfers. A GBP
 * 630 deposit rendered as "EUR 630.00" on the desk where an admin
 * decides whether it matches a EUR 630 claim.
 *
 * An unknown code prints as the code. "GBP 630.00" is a true figure
 * that happens to be unstyled; "EUR 630.00" is a wrong one.
 */
export function currencySymbol(code: string | null | undefined): string {
  const upper = String(code ?? "").trim().toUpperCase();
  if (!upper) return (CURRENCY_SYMBOLS as Record<string, string>).EUR ?? "€";
  const symbol = (CURRENCY_SYMBOLS as Record<string, string>)[upper];
  // A trailing space, so "GBP 500.00" reads as a figure and not as a
  // typo. A symbol needs none.
  return symbol ?? `${upper} `;
}

/** What to draw in front of the amount. */
export function invoiceCurrencySymbol(invoice: InvoiceCurrencyish): string {
  return currencySymbol(invoiceCurrencyCode(invoice));
}
