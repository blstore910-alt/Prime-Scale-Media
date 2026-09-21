/**
 * What a customer owes on their plan right now — which invoices, in what
 * order, and how much per currency.
 *
 * ──────────────────────────────────────────────────────────────────────
 * WHY IT IS OUT HERE AND NOT IN THE COMPONENT
 *
 * All of this lived inside components/advertiser/adv-app.tsx, and the
 * per-currency reduce sat TWENTY LINES ABOVE the `const invCurrency` it
 * calls. A const arrow function is in its temporal dead zone until its
 * own line runs, so that call threw:
 *
 *     ReferenceError: Cannot access 'invCurrency' before initialization
 *
 * and Next replaced the entire customer app with "Application error: a
 * client-side exception has occurred".
 *
 * It hid because `.reduce` on an EMPTY array never calls its callback.
 * Every advertiser with nothing outstanding was fine. The first one to
 * have a single unpaid invoice could not open the app at all — not the
 * billing page, the WHOLE app, because the views are CSS-toggled and all
 * of them render.
 *
 * Out here the functions are imports, which cannot have a dead zone, and
 * the non-empty path is exercised by tests instead of by a customer.
 * ──────────────────────────────────────────────────────────────────────
 */

export interface DueInvoiceish {
  total?: number | string | null;
  currency?: string | null;
  status?: string | null;
  type?: string | null;
  created_at?: string | null;
}

/**
 * EUR or USD — the two a wallet can pay from.
 *
 * Deliberately narrowed, unlike lib/pure-invoice-currency's
 * `invoiceCurrencyCode`: this answer decides WHICH WALLET is debited,
 * and there are only two. It follows the RPC in the part that matters —
 * `upper(coalesce(currency,'EUR'))`, case-insensitive, NULL means EUR,
 * and the line items are not consulted because the RPC does not consult
 * them either.
 */
export function walletCurrencyOf(
  inv: { currency?: string | null } | null | undefined,
): "USD" | "EUR" {
  return String(inv?.currency ?? "EUR").trim().toUpperCase() === "USD"
    ? "USD"
    : "EUR";
}

/**
 * The unpaid plan invoices, OLDEST FIRST.
 *
 * Oldest first because that is the one being dunned and the one the
 * nightly collect loop takes. Sorted newest-first, the card showed a
 * customer the invoice raised yesterday while last month's sat past due.
 *
 * `subscription_adjustment` counts: the collect loop filters on
 * subscription_id and NOT on type, so a plan-change difference is
 * auto-debited exactly like a monthly fee.
 */
export function unpaidSubscriptionInvoices<T extends DueInvoiceish>(
  rows: T[] | null | undefined,
): T[] {
  return (rows ?? [])
    .filter(
      (i) =>
        i.status !== "paid" &&
        i.status !== "void" &&
        (i.type === "subscription" || i.type === "subscription_adjustment"),
    )
    .sort(
      (a, b) =>
        new Date(a.created_at ?? 0).getTime() -
        new Date(b.created_at ?? 0).getTime(),
    );
}

/**
 * Per currency, because a sum across them is not a number.
 *
 * The first version added them up with one reduce and printed the newest
 * invoice's symbol on the result: a EUR 200 invoice beside a USD 500 one
 * came out as "EUR 700.00", a figure that exists in no currency. And the
 * mixed case is not hypothetical — changing a plan to another currency is
 * exactly what produces it.
 */
export function unpaidTotalsByCurrency(
  rows: DueInvoiceish[] | null | undefined,
): Record<"USD" | "EUR", number> | Record<string, number> {
  return (rows ?? []).reduce<Record<string, number>>((acc, i) => {
    const cur = walletCurrencyOf(i);
    const add = Number(i.total);
    acc[cur] =
      Math.round(((acc[cur] ?? 0) + (Number.isFinite(add) ? add : 0)) * 100) /
      100;
    return acc;
  }, {});
}

/** "€205.00" or "€200.00 + $500.00". Empty string when nothing is owed. */
export function unpaidTotalsText(
  totals: Record<string, number>,
): string {
  return Object.entries(totals)
    .filter(([, amt]) => amt !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([cur, amt]) =>
        `${cur === "USD" ? "$" : "€"}${amt.toFixed(2)}`,
    )
    .join(" + ");
}
