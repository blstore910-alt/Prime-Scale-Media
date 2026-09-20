/**
 * What landed on the ad account, in the ad account's own money.
 *
 * An ad account has a currency. AA-PSM0005-EU-01 is a EUR account: euros
 * go on it, euros come off it, and there is no dollar figure anywhere in
 * its life. Four screens printed one anyway.
 *
 * `top_ups.topup_amount` is the net after the fee, and the customer's
 * own RPC (`top_up_create_for_advertiser`, hand-authored on live) stores
 * it in the PAYMENT currency — which on the customer path is always the
 * account's currency, because account-topup-form forces the wallet to
 * match `selectedAccountCurrency`:
 *
 *     v_fee_amount   := round(p_amount_received * v_fee_pct / 100, 2)
 *     v_topup_amount := round(p_amount_received - v_fee_amount, 2)
 *
 * So a EUR 100 funding at 3% stores topup_amount = 97.00, and 97.00 is
 * EUR. The row's own `currency` column says so.
 *
 * Seen on production on 2026-09-20: the customer's dialog headlined
 * "Lands on the account **$111.19**" and the admin's verify queue
 * printed "**$97.00**" — two different numbers, both with a dollar sign,
 * for EUR 97.00 landing on a euro account. The number in the queue was
 * right and its symbol was wrong; the number in the dialog was a
 * conversion of a figure that never gets converted.
 *
 * The rule is one line: show `topup_amount` in the row's own currency.
 *
 * The two creators are told apart by `topup_usd`, which the customer's
 * RPC writes and neither admin path does (it is not in
 * TOPUP_INSERT_ALLOWED). So an admin-created row is rendered in dollars,
 * which is what its `topup_amount` holds, and a customer-created row in
 * the account's own currency. No guessing, and no rate applied to a
 * figure that never gets converted.
 */

export type LandedRow = {
  topup_amount?: number | string | null;
  /** Set by the CUSTOMER's RPC and by nothing else — the discriminator. */
  topup_usd?: number | string | null;
  currency?: string | null;
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * The net that landed, and the currency it is in.
 *
 * Which creator wrote the row is not a guess: `topup_usd` is in
 * TOPUP_INSERT_ALLOWED for neither admin path and is written only by
 * the customer's RPC. Present means the row is the customer's and
 * `topup_amount` is in `currency`; absent means an admin wrote it
 * through calculateTopupAmount and `topup_amount` is already dollars.
 */
export function landedOnAccount(row: LandedRow | null | undefined): {
  amount: number | null;
  currency: string;
} {
  const customerRow = num(row?.topup_usd) !== null;
  return {
    amount: num(row?.topup_amount),
    currency: customerRow
      ? String(row?.currency ?? "EUR").toUpperCase()
      : "USD",
  };
}

/**
 * Totals per currency, because a sum across currencies is not a number.
 * Returns e.g. { EUR: 194, USD: 500 }.
 */
export function sumLandedByCurrency(
  rows: readonly (LandedRow | null)[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const { amount, currency } = landedOnAccount(r);
    if (amount === null) continue;
    out[currency] = Math.round(((out[currency] ?? 0) + amount) * 100) / 100;
  }
  return out;
}
