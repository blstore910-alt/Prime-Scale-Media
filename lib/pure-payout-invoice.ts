/**
 * THE LINES ON A PAYOUT INVOICE HAVE TO ADD UP TO ITS TOTAL.
 *
 * This is a self-billed invoice: we write it on the affiliate's behalf
 * for commission we calculated ourselves. It is a tax document, so
 * "the numbers roughly describe the transfer" is not enough — somebody
 * files it, and a document whose lines do not sum to its own total is
 * a document that cannot be filed.
 *
 * It lived inline in app/api/payouts/[payoutId]/invoice/route.ts, where
 * the only way to check it was to make a real payout, settle it, and
 * read the page. Two of the four shapes below cannot be produced on
 * this tenant today at all:
 *
 *   - a payout WITH a clawback needs a returned ad account against a
 *     top-up commission, and since 28-09 (the owner's decision, plak
 *     120) a return only claws back commission with `source = 'topup'`;
 *   - a CONVERTED payout moves real money in a second currency.
 *
 * So the arithmetic moved here, where all four shapes are cheap. The
 * route formats what this returns and nothing else.
 *
 * WHAT WENT WRONG BEFORE, and what these tests hold:
 *
 * `affiliate_payouts.amount` is ALREADY gross minus clawback — that is
 * what affiliate_payout_request_multi writes. The invoice printed that
 * net figure as line one and then subtracted the clawback AGAIN
 * underneath, while Total stayed equal to line one. Live payout #2 read
 * "commission 15,96 / settled against returned ad spend −4,04 / Total
 * 15,96". Three numbers, no sum among them.
 */

export type PayoutLineRow = {
  /** The currency the commission was earned in. */
  currency: string;
  /** NET: gross minus clawback. What the RPC stores in `amount`. */
  amount: number | string | null;
  clawback_amount?: number | string | null;
  commission_count?: number | null;
  /** The currency actually transferred; equal to `currency` if none. */
  payout_currency?: string | null;
  /** exchange_rates.eur — EUR per 1 USD, in BOTH directions. */
  fx_rate?: number | string | null;
  fx_fee_pct?: number | string | null;
  /** The conversion fee, in the DESTINATION currency. */
  fx_fee_amount?: number | string | null;
  /** The converted amount AFTER the fee. What is transferred. */
  payout_amount?: number | string | null;
};

export type PayoutInvoiceLine = {
  text: string;
  /** Signed: negative for a deduction. Format at the edge. */
  amount: number;
  currency: string;
};

/** A number out of PostgREST may be a string; a bad one is not a zero. */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Cents, so 20 - 4.04 does not land on 15.959999999999999. */
function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

function cur(v: unknown, fallback = "EUR"): string {
  const s = String(v ?? "").trim().toUpperCase();
  return s || fallback;
}

/**
 * Every line of the document, in reading order, for one transfer
 * (a transfer may carry one row per earned currency).
 */
export function payoutInvoiceLines(
  rows: readonly PayoutLineRow[],
): PayoutInvoiceLine[] {
  const out: PayoutInvoiceLine[] = [];

  for (const r of rows) {
    const src = cur(r.currency);
    const dst = cur(r.payout_currency, src);
    const claw = num(r.clawback_amount);
    const net = num(r.amount);
    const count = Number(r.commission_count) || 0;

    out.push({
      // Line one is the GROSS whenever something was held back, so that
      // line one and the deduction below it land exactly on the total.
      text: `Referral commission — ${count} ${
        count === 1 ? "commission" : "commissions"
      } in ${src}`,
      amount: claw > 0 ? cents(net + claw) : cents(net),
      currency: src,
    });

    if (claw > 0) {
      out.push({
        text: "Already settled against returned ad spend",
        amount: -cents(claw),
        currency: src,
      });
    }

    if (dst !== src) {
      const fee = num(r.fx_fee_amount);
      const paid = num(r.payout_amount);
      out.push({
        // The rate is stored one way round — EUR per 1 USD — whichever
        // direction the money goes, so the label is written that way
        // too rather than inverted for one of the two cases.
        text: `Converted to ${dst} at 1 USD = ${num(r.fx_rate).toFixed(4)} EUR`,
        amount: cents(paid + fee),
        currency: dst,
      });
      out.push({
        text: `Conversion fee ${num(r.fx_fee_pct)}%`,
        amount: -cents(fee),
        currency: dst,
      });
    }
  }

  return out;
}

/** The total per transferred currency — what the bank actually sends. */
export function payoutInvoiceTotals(
  rows: readonly PayoutLineRow[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const r of rows) {
    const dst = cur(r.payout_currency, cur(r.currency));
    // `payout_amount` is null on rows written before the conversion
    // columns existed; those were never converted, so `amount` IS what
    // was transferred.
    const paid =
      r.payout_amount === null || r.payout_amount === undefined
        ? num(r.amount)
        : num(r.payout_amount);
    totals[dst] = cents((totals[dst] ?? 0) + paid);
  }
  return totals;
}

/**
 * The closing test of this whole journey, as a function: do the lines
 * in each currency add up to that currency's total?
 *
 * A converted payout is the one case where they deliberately do NOT —
 * the earned-currency lines are the story of where the money came
 * from, and only the destination lines reach the total. So the check
 * is per currency, and a currency with no total of its own is the
 * source side of a conversion and is skipped.
 */
export function payoutInvoiceAddsUp(rows: readonly PayoutLineRow[]): boolean {
  const totals = payoutInvoiceTotals(rows);
  const sums: Record<string, number> = {};
  for (const l of payoutInvoiceLines(rows)) {
    sums[l.currency] = cents((sums[l.currency] ?? 0) + l.amount);
  }
  for (const [c, total] of Object.entries(totals)) {
    if (cents(sums[c] ?? 0) !== cents(total)) return false;
  }
  return true;
}
