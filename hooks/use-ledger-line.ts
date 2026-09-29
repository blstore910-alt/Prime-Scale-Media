"use client";

import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import type { LedgerLine } from "@/hooks/use-ledger";

/**
 * EVERYTHING BEHIND ONE MOVEMENT.
 *
 * The owner, 29-09: "named and detailed everything, max max details,
 * click details click details, anders hebben we niks aan ledger."
 *
 * A ledger row on the list is four things: when, how much, from what
 * to what, and a one-word source. That is the index. This is the
 * entry: click a row and you get the customer by name, the staff
 * member who did it by name, the exact record it came from with its
 * own figures, and the reason if one was given.
 *
 * ── HOW THE SOURCE RECORD IS FOUND ────────────────────────────────
 *
 * `wallet_ledger.source` is the name of whatever caused the movement —
 * an explicit hint if the RPC set one, otherwise the calling
 * function's own name, which plak 126 reads off the stack. `source_id`
 * is the row it acted on, when the RPC bothered to say.
 *
 * So the lookup is: map the source name to a table, then fetch that
 * one row. A source we do not recognise is not an error — it is a
 * movement whose cause we recorded without a name, and the panel says
 * exactly that instead of showing an empty box.
 */

/** Which table a source name points into, and what to show from it. */
const SOURCE_TABLES: Record<
  string,
  { table: string; columns: string; what: string }
> = {
  // Wallet top-ups — money in.
  topup_verify: {
    table: "wallet_topups",
    columns: "id, reference_no, amount, currency, status, notes, created_at",
    what: "Wallet top-up",
  },
  topup_reversal: {
    table: "wallet_topups",
    columns: "id, reference_no, amount, currency, status, rejection_reason, created_at",
    what: "Top-up reversed",
  },
  _wallet_topup_balance_sync: {
    table: "wallet_topups",
    columns: "id, reference_no, amount, currency, status, notes, created_at",
    what: "Wallet top-up",
  },
  wise_record_and_settle: {
    table: "wallet_topups",
    columns: "id, reference_no, amount, currency, status, notes, created_at",
    what: "Bank deposit settled",
  },

  // Ad-account funding — money out of the wallet, with our fee on it.
  adaccount_fund: {
    table: "top_ups",
    columns: "id, number, topup_amount, fee_amount, currency, status, created_at",
    what: "Ad-account funding",
  },
  top_up_create_for_advertiser: {
    table: "top_ups",
    columns: "id, number, topup_amount, fee_amount, currency, status, created_at",
    what: "Ad-account funding",
  },

  // Requests.
  ad_account_request_create_paid: {
    table: "ad_account_requests",
    columns: "id, status, created_at",
    what: "Ad-account request fee",
  },
  ad_account_request_reject_refund: {
    table: "ad_account_requests",
    columns: "id, status, created_at",
    what: "Request fee refunded",
  },

  // Money back off an ad account.
  ad_account_withdrawal_approve: {
    table: "ad_account_withdrawals",
    columns: "id, amount, currency, status, created_at",
    what: "Money back off an ad account",
  },
  ad_account_withdrawal_settle: {
    table: "ad_account_withdrawals",
    columns: "id, amount, currency, status, created_at",
    what: "Withdrawal settled",
  },

  // Invoices.
  invoice_pay: {
    table: "invoices",
    columns: "id, number, total, currency, status, type, created_at",
    what: "Invoice paid from the wallet",
  },
  invoice_pay_from_wallet: {
    table: "invoices",
    columns: "id, number, total, currency, status, type, created_at",
    what: "Invoice paid from the wallet",
  },
  change_subscription_amount: {
    table: "invoices",
    columns: "id, number, total, currency, status, type, created_at",
    what: "Subscription changed",
  },

  // The rest.
  wallet_exchange: {
    table: "wallet_exchanges",
    columns: "id, from_amount, to_amount, rate, created_at",
    what: "Currency exchange",
  },
  wallet_admin_adjust: {
    table: "wallet_adjustments",
    columns: "id, amount, currency, status, created_at",
    what: "Admin correction",
  },
  wallet_adjustment_approve: {
    table: "wallet_adjustments",
    columns: "id, amount, currency, status, created_at",
    what: "Adjustment approved",
  },
  wallet_refund_approve: {
    table: "wallet_refunds",
    columns: "id, amount, currency, status, created_at",
    what: "Wallet refund",
  },
  wallet_precharge_create: {
    table: "wallet_precharges",
    columns: "id, amount, currency, status, created_at",
    what: "Advance credit given",
  },
  wallet_precharge_settle: {
    table: "wallet_precharges",
    columns: "id, amount, currency, status, created_at",
    what: "Advance credit settled",
  },
  wallet_precharge_cancel: {
    table: "wallet_precharges",
    columns: "id, amount, currency, status, created_at",
    what: "Advance credit cancelled",
  },
};

/** A friendly sentence for a source, whether or not we can look it up. */
export function describeSource(source: string): string {
  const known = SOURCE_TABLES[source];
  if (known) return known.what;
  if (source === "opening") return "Opening balance";
  if (source === "unknown") return "Cause not recorded";
  // A function name we have not mapped yet. Still more useful than the
  // raw token: strip the leading underscore and the snake case.
  return source.replace(/^_+/, "").replace(/_/g, " ");
}

export type LineDetail = {
  /** What kind of thing caused it, in words. */
  what: string;
  /** The table we looked in, so a figure can be traced by hand. */
  table: string | null;
  /** The row itself, or null if there was nothing to look up. */
  record: Record<string, unknown> | null;
  /** Why there is no record — so the panel never shows a blank box. */
  why: string | null;
};

export function useLedgerLineDetail(line: LedgerLine | null) {
  return useQuery<LineDetail>({
    queryKey: ["ledger-line", line?.id ?? ""],
    enabled: !!line,
    staleTime: 60_000,
    queryFn: async () => {
      const l = line!;
      const what = describeSource(l.source);
      const map = SOURCE_TABLES[l.source];

      if (l.source === "opening") {
        return {
          what,
          table: null,
          record: null,
          why: "This is the balance the wallet held when the ledger was switched on. It is the starting point, not a movement — there is no record behind it, and there is not meant to be.",
        };
      }
      if (!map) {
        return {
          what,
          table: null,
          record: null,
          why: `We know this movement happened and we know the balance before and after it, but nothing told us which record caused it. The source reads "${l.source}". That is a gap in the bookkeeping, not in the money.`,
        };
      }
      if (!l.source_id) {
        return {
          what,
          table: map.table,
          record: null,
          why: `We know this was a ${map.what.toLowerCase()}, but the function that moved the money did not say which row. Look in ${map.table} around ${new Date(l.occurred_at).toLocaleString()}.`,
        };
      }

      const supabase = createClient();
      const { data, error } = await supabase
        .from(map.table)
        .select(map.columns)
        .eq("id", l.source_id)
        .maybeSingle();

      if (error) {
        return {
          what,
          table: map.table,
          record: null,
          why: `We could not read the record in ${map.table}. This is not "there is none" — reload.`,
        };
      }
      if (!data) {
        return {
          what,
          table: map.table,
          record: null,
          why: `The movement names a row in ${map.table} that is no longer there. The money moved; the paperwork behind it has gone.`,
        };
      }
      return {
        what,
        table: map.table,
        record: data as unknown as Record<string, unknown>,
        why: null,
      };
    },
  });
}
