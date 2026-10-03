// ── A WISE PAYMENT TO THE SUPPLIER BECOMES A "WE SENT" LINE ──────────
//
// De eigenaar, 03-10: "alle Wise betalingen naar MUXUE moeten als wallet
// balance top-up bij Bestads ... USD->USD is correct full amount, maar EUR
// naar Muxue dan anders ... we don't need to import all, just upcoming
// payments, USD en EUR."
//
// Measured on the live Wise account the same day: the recipient is
// "MUXUE TRADE LIMITED", and a payment arrived there as EUR (we paid USD
// 1,713.83, they received EUR 1,500). Bestads then converts EUR to USD at
// ITS own rate, which we only learn from their dashboard. So:
//
//   * received in USD -> the full amount, confirmed;
//   * received in EUR -> an ESTIMATE at our rate, marked unconfirmed, for an
//     admin to replace with what Bestads actually credited. The gap against
//     our rate then shows on the line, as for a hand-entered deposit.
//
// Only payments that have actually gone out, and only from the cut-off on:
// what was paid before is already in the ledger by hand.

/** Nothing before this is imported (eigenaar: "just upcoming"). */
export const WISE_SUPPLIER_IMPORT_SINCE = "2026-10-03T00:00:00Z";

export type WiseTransferIn = {
  id: string;
  created: string; // "2026-10-03 12:00:00" or ISO
  status: string;
  targetCurrency: string;
  targetValue: number;
};

export type SupplierLineFromWise = {
  externalRef: string;
  day: string; // YYYY-MM-DD
  amount: number; // USD, rounded to the cent
  sentAmount: number;
  sentCurrency: "USD" | "EUR";
  usdConfirmed: boolean;
  note: string;
};

/** Wise writes "2026-10-03 12:00:00" (UTC, no zone). */
export function wiseTime(created: string): number {
  const s = String(created ?? "").trim();
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(" ", "T")}Z`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

/**
 * @param eurPerUsd our rate as the app stores it: 1 USD = N EUR.
 * @returns null when this payment is not to be booked.
 */
export function lineFromWiseTransfer(
  t: WiseTransferIn,
  eurPerUsd: number | null,
  since: string = WISE_SUPPLIER_IMPORT_SINCE,
): SupplierLineFromWise | null {
  if (t.status !== "outgoing_payment_sent") return null;
  const at = wiseTime(t.created);
  if (!Number.isFinite(at) || at < Date.parse(since)) return null;
  const value = Math.round(Number(t.targetValue) * 100) / 100;
  if (!(value > 0)) return null;
  const day = new Date(at).toISOString().slice(0, 10);
  const cur = String(t.targetCurrency ?? "").toUpperCase();

  if (cur === "USD") {
    return {
      externalRef: `wise:${t.id}`,
      day,
      amount: value,
      sentAmount: value,
      sentCurrency: "USD",
      usdConfirmed: true,
      note: `Wise #${t.id}`,
    };
  }
  if (cur === "EUR") {
    // No rate, no estimate -- but still booked, at zero, unconfirmed:
    // a payment that went out must not be missing from the list.
    const usd = eurPerUsd && eurPerUsd > 0 ? Math.round((value / eurPerUsd) * 100) / 100 : 0;
    return {
      externalRef: `wise:${t.id}`,
      day,
      amount: usd,
      sentAmount: value,
      sentCurrency: "EUR",
      usdConfirmed: false,
      note: `Wise #${t.id} · estimate at our rate, confirm what Bestads credited`,
    };
  }
  return null; // GBP, HKD: not a currency Bestads takes
}
