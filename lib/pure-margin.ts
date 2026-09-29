/**
 * WHICH MONEY IS OURS.
 *
 * ── WHY THIS IS A FILE AND NOT THREE LINES IN A HOOK ──────────────
 *
 * 29-09: the "what we keep" panel was written, and the first thing it
 * did on real data was overstate the margin by EUR 1,762.70 — it said
 * we had kept EUR 1,885.04 when the figure is EUR 122.34. Fifteen
 * times too big, on the one screen that answers "are we making
 * anything".
 *
 * It did that by summing every PAID invoice. The paid invoices on the
 * real tenant are:
 *
 *   wallet_topup      6  EUR 1,165.00
 *   ad_account_topup  8  EUR   597.70
 *   subscription      5  EUR   180.00
 *
 * A `wallet_topup` invoice is a customer putting money into their own
 * wallet. It is theirs on the way in and theirs on the way out, it is
 * already counted as "credited to wallets" on the other panel, and
 * adding it here counts the same money twice and calls the second time
 * profit.
 *
 * An `ad_account_topup` invoice is gross ad spend. The supplier takes
 * almost all of it. What is ours is the FEE inside it, which comes
 * from `top_ups.fee_amount` and is its own line — so adding the gross
 * both inflates the total and double-counts the fee.
 *
 * The rule is one sentence: money is ours only if the customer is
 * paying us FOR something, not paying us to PASS IT ON. Every new
 * invoice type has to be placed on one side of that line, which is why
 * an unknown type is not silently treated as income.
 */

/** What an invoice contributes to the margin. */
export type MoneyKind =
  /** Ours. Adds to what we keep. */
  | "income"
  /** Passed through to a customer's wallet or a supplier. Adds nothing. */
  | "through"
  /** We owe it out. Subtracts. */
  | "cost";

/**
 * Where a paid invoice belongs.
 *
 * An unrecognised type returns "through", not "income". Getting this
 * wrong in the cautious direction understates the margin, which is
 * visible and annoying; the other way it overstates it, which is
 * invisible and is what happened.
 */
export function invoiceMoneyKind(type: string | null | undefined): MoneyKind {
  switch ((type ?? "").trim().toLowerCase()) {
    // Ours: the customer is buying something from us.
    case "subscription":
    case "fee":
    case "service":
      return "income";

    // Not ours: we are the route, not the destination.
    case "wallet_topup":
    case "ad_account_topup":
    case "topup":
    case "refund":
      return "through";

    default:
      return "through";
  }
}

/** True for the types we have actually thought about. */
export function isKnownInvoiceType(type: string | null | undefined): boolean {
  return [
    "subscription",
    "fee",
    "service",
    "wallet_topup",
    "ad_account_topup",
    "topup",
    "refund",
  ].includes((type ?? "").trim().toLowerCase());
}

/** A line as the margin panel holds it. */
export type MarginInput = {
  amount: number;
  kind: MoneyKind;
};

/**
 * What we keep: income minus cost. Pass-through touches nothing.
 *
 * Rounded at every step, because these are sums of `numeric` values
 * that PostgREST hands over as strings and JS adds as floats — three
 * additions is enough to produce 122.33999999999999.
 */
export function whatWeKeep(lines: MarginInput[]): number {
  let total = 0;
  for (const l of lines) {
    if (l.kind === "income") total = Math.round((total + l.amount) * 100) / 100;
    else if (l.kind === "cost") total = Math.round((total - l.amount) * 100) / 100;
  }
  return total;
}
