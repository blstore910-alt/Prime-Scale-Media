/**
 * The financial report: every movement, in one shape.
 *
 * WHY A SINGLE SHAPE. The money a customer can ask about is spread across
 * seven tables — wallet top-ups, ad-account top-ups, withdrawals, fees,
 * invoices, adjustments and exchanges — each with its own column names,
 * its own idea of a date, and its own sign. A report that renders each
 * table in its own section answers "what did I do in table X", which is
 * not a question anybody has. So everything is normalised to one LINE and
 * sorted by time, and then the obvious questions become possible: what
 * did I spend in March, what did this account cost me, what did you
 * charge me in fees this year.
 *
 * THE SIGN IS FROM THE CUSTOMER'S SIDE. Positive means money arrived
 * where they can use it; negative means it left. A wallet top-up is
 * positive, funding an ad account is negative, a withdrawal coming back
 * is positive, a fee and a paid invoice are negative. This one rule is
 * what makes a running total mean anything, and it is the rule a customer
 * would use if they were writing it down themselves.
 *
 * CURRENCIES ARE NEVER ADDED TOGETHER. A total of "1500" across a $1,000
 * and a €500 movement is not a number — it is two numbers stapled
 * together. Every summary is per currency, always, even when a customer
 * only ever uses one.
 *
 * Pure: no React, no Supabase, no dates from the clock. Tested.
 */

import { csvSafe } from "@/lib/csv-safe";

export type FinanceKind =
  | "wallet_topup"
  | "account_topup"
  | "account_withdrawal"
  | "fee"
  | "invoice"
  | "adjustment"
  | "refund"
  | "precharge"
  | "exchange"
  | "commission";

export type FinanceLine = {
  id: string;
  /** ISO timestamp. */
  at: string;
  kind: FinanceKind;
  /** What happened, in the customer's words. */
  label: string;
  /** Invoice number, payment reference, whatever names it. */
  reference: string | null;
  /** The ad account, when the line belongs to one. */
  account: string | null;
  /** The other party — a referred advertiser, on an affiliate's report. */
  counterparty: string | null;
  currency: string;
  /** Signed from the customer's side: + arrived, - left. */
  amount: number;
  status: string | null;
};

export const KIND_LABELS: Record<FinanceKind, string> = {
  wallet_topup: "Wallet top-up",
  account_topup: "Ad account funding",
  account_withdrawal: "Returned from ad account",
  fee: "Fee",
  invoice: "Invoice",
  adjustment: "Adjustment",
  // A refund is money going back OUT of the wallet, to the customer's own
  // bank. Not the same event as an adjustment (a signed correction) and
  // not the same as a withdrawal (which returns money from an AD ACCOUNT
  // to the wallet), so it gets its own row in the filter rather than
  // being folded into either.
  refund: "Refund to your bank",
  precharge: "Advance",
  exchange: "Currency exchange",
  commission: "Commission",
};

/** The order they appear in a filter, grouped by what they mean. */
export const KIND_ORDER: FinanceKind[] = [
  "wallet_topup",
  "account_topup",
  "account_withdrawal",
  "fee",
  "invoice",
  "adjustment",
  "refund",
  "precharge",
  "exchange",
  "commission",
];

export type ReportFilter = {
  /** ISO date (inclusive), or null for no lower bound. */
  from?: string | null;
  /** ISO date (inclusive to the end of that day), or null. */
  to?: string | null;
  kinds?: FinanceKind[] | null;
  currencies?: string[] | null;
  /** Match on account name, case-insensitive substring. */
  account?: string | null;
  /** Free text over label, reference, account and counterparty. */
  search?: string | null;
};

function inRange(at: string, from?: string | null, to?: string | null): boolean {
  // Compared as ISO strings rather than Dates: these are already ISO, a
  // string compare is the same ordering, and it keeps this module free of
  // anything that reads the clock or a timezone.
  if (from && at < from) return false;
  // `to` is a DATE, so the whole of that day counts. Without this a
  // customer filtering "up to 18 September" loses everything that
  // happened on the 18th, which reads as missing money.
  if (to && at > `${to}T23:59:59.999Z`) return false;
  return true;
}

export function filterLines(
  lines: FinanceLine[],
  f: ReportFilter = {},
): FinanceLine[] {
  const kinds = f.kinds && f.kinds.length ? new Set(f.kinds) : null;
  const currencies =
    f.currencies && f.currencies.length
      ? new Set(f.currencies.map((c) => c.toUpperCase()))
      : null;
  const acct = (f.account ?? "").trim().toLowerCase();
  const q = (f.search ?? "").trim().toLowerCase();

  return lines.filter((l) => {
    if (!inRange(l.at, f.from, f.to)) return false;
    if (kinds && !kinds.has(l.kind)) return false;
    if (currencies && !currencies.has(l.currency.toUpperCase())) return false;
    if (acct && !(l.account ?? "").toLowerCase().includes(acct)) return false;
    if (q) {
      const hay = [l.label, l.reference, l.account, l.counterparty]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export type CurrencyTotals = {
  currency: string;
  /** Everything positive. */
  in: number;
  /** Everything negative, as a POSITIVE number — "what left". */
  out: number;
  net: number;
  count: number;
  byKind: Partial<Record<FinanceKind, number>>;
};

/** Money is rounded at the last possible moment, and only here. */
function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function summarise(lines: FinanceLine[]): CurrencyTotals[] {
  const map = new Map<string, CurrencyTotals>();
  for (const l of lines) {
    const cur = (l.currency || "EUR").toUpperCase();
    let t = map.get(cur);
    if (!t) {
      t = { currency: cur, in: 0, out: 0, net: 0, count: 0, byKind: {} };
      map.set(cur, t);
    }
    const a = Number(l.amount) || 0;
    if (a >= 0) t.in += a;
    else t.out += -a;
    t.net += a;
    t.count += 1;
    // Accumulate RAW here and round with the rest below. Rounding
    // every row made the per-kind subtotals disagree with the net
    // they are part of: three sub-cent "fee" lines summed to a
    // byKind of 3000.03 under a net of 3000.02, on the customer's
    // own financial statement. The header already says money is
    // "rounded at the last possible moment, and only here" -- this
    // line was the exception to its own rule.
    t.byKind[l.kind] = (t.byKind[l.kind] ?? 0) + a;
  }
  return [...map.values()]
    .map((t) => ({
      ...t,
      in: r2(t.in),
      out: r2(t.out),
      net: r2(t.net),
      byKind: Object.fromEntries(
        Object.entries(t.byKind).map(([k, v]) => [k, r2(Number(v) || 0)]),
      ) as typeof t.byKind,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Newest first — a report is read from today backwards. */
export function sortLines(lines: FinanceLine[]): FinanceLine[] {
  return [...lines].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

const CSV_HEADER = [
  "Date",
  "Type",
  "Description",
  "Reference",
  "Ad account",
  "Counterparty",
  "Currency",
  "Amount",
  "Status",
];

/** Quote and escape. Used by both cell kinds below. */
function quote(s: string): string {
  // Quote when the value contains anything that would end a field, and
  // double any quote inside it. A company name with a comma in it has
  // silently split a row in every export that forgot this.
  return /["\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * A field whose text came from a person - a company name, a reference, a
 * note. Excel and Sheets evaluate a cell starting with = + - @ as a
 * FORMULA, so this is where csvSafe belongs.
 */
function cell(v: unknown): string {
  return quote(String(csvSafe(v ?? "")));
}

/**
 * A field WE generated: the date, the currency code, the amount.
 *
 * Deliberately NOT run through csvSafe, and that is the whole reason
 * there are two functions. csvSafe prefixes anything starting with `-`,
 * so every negative amount came out as '-1234.50 - text, not a number,
 * in the one column a financial report exists to be summed on. Every
 * outgoing line in the file would have been unaddable, and it would have
 * looked fine until somebody tried to total it.
 *
 * There is no injection risk here because none of these values is
 * user-controlled: an ISO timestamp, a three-letter code, and the output
 * of toFixed(2).
 */
function own(v: unknown): string {
  return quote(String(v ?? ""));
}

/**
 * What the screen knows that the file did not say.
 *
 * The report shows two warnings -- "these totals are incomplete, we
 * couldn't read X" and "showing the most recent movements" -- and the
 * CSV emitted nine columns and nothing else. So a report that lost the
 * wallet_topups source exported a file with NO income rows at all and
 * nothing saying so, and the customer handed it to a bookkeeper.
 *
 * The audit export already does this right: a -PARTIAL filename plus a
 * header. A CSV has no headers, so it goes in the file, above the
 * column row, as comment lines -- which every spreadsheet imports as
 * text rather than dropping.
 */
export interface CsvCaveats {
  /** Sources that could not be read, e.g. ["wallet_topups"]. */
  failed?: string[];
  /** True when the history was cut short. */
  truncated?: boolean;
  /** Human description of the filters applied, e.g. "1 Aug - 31 Aug". */
  filters?: string;
}

export function toCsv(lines: FinanceLine[], caveats?: CsvCaveats): string {
  const rows: string[] = [];
  if (caveats?.filters) {
    rows.push(own("# Filtered: " + caveats.filters));
  }
  if (caveats?.failed?.length) {
    rows.push(
      own(
        "# INCOMPLETE: we could not read " +
          caveats.failed.join(", ") +
          ". Rows from those sources are MISSING from this file.",
      ),
    );
  }
  if (caveats?.truncated) {
    rows.push(
      own("# PARTIAL: only the most recent movements are included."),
    );
  }
  rows.push(CSV_HEADER.map(own).join(","));
  for (const l of lines) {
    rows.push(
      [
        own(l.at),
        own(KIND_LABELS[l.kind] ?? l.kind),
        cell(l.label),
        cell(l.reference ?? ""),
        cell(l.account ?? ""),
        cell(l.counterparty ?? ""),
        own(l.currency),
        // Two decimals, dot-separated, unquoted: a spreadsheet has to be
        // able to sum this column without the reader fixing it first.
        own((Number(l.amount) || 0).toFixed(2)),
        own(l.status ?? ""),
      ].join(","),
    );
  }
  // A trailing newline: some tools drop the last row without it.
  return rows.join("\n") + "\n";
}

/** The currencies present, for building the filter from the data itself. */
export function currenciesIn(lines: FinanceLine[]): string[] {
  return [...new Set(lines.map((l) => (l.currency || "EUR").toUpperCase()))]
    .sort();
}

/** The ad accounts present, likewise. */
export function accountsIn(lines: FinanceLine[]): string[] {
  return [...new Set(lines.map((l) => l.account).filter(Boolean) as string[])]
    .sort();
}
