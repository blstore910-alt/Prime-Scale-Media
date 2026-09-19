"use client";

import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

/**
 * Has this top-up already been advanced?
 *
 * WHY THIS EXISTS. An advance credits the wallet BEFORE the payment
 * clears, and the balance trigger settles it when the top-up is verified:
 * the verify credits +amount and the settlement takes the same amount
 * back out. Net movement, zero.
 *
 * Nothing on the verify screen said so. A precharged card is byte for
 * byte identical to an un-precharged one — same Verify, same Reject, same
 * Precharge button — and the confirmation reads "this credits exactly the
 * figure below" with "Yes, credit EUR 1,000". The admin presses it, the
 * balance does not move, they conclude it failed, and they reach for a
 * manual adjustment or an undo-and-reverify. The customer ends up EUR
 * 1,000 ahead on a EUR 1,000 payment.
 *
 * The admin manual asserts the opposite in as many words: "The amount and
 * currency shown are what will be credited."
 *
 * Read-only, admin-scoped by RLS, and keyed on the ids already on screen.
 */
export type OutstandingPrecharge = {
  topupId: string;
  /** What is still to settle, in the advance's own currency. */
  outstanding: number;
  currency: string;
};

export function useOutstandingPrecharges(topupIds: string[]) {
  // A stable key, so the query does not refire on every render just
  // because the caller built a new array.
  const key = [...topupIds].sort().join(",");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["outstanding-precharges", key],
    enabled: topupIds.length > 0,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_precharges")
        .select("source_wallet_topup_id, outstanding, currency, status")
        .in("source_wallet_topup_id", topupIds)
        .eq("status", "outstanding");
      // ── source_wallet_topup_id COMES FROM A MIGRATION ───────────────
      //
      // 20260831280000 adds it, and the migrations README says in plain
      // words that the live database is not in the state that folder
      // describes. A column that is not there yet does not degrade — it
      // throws — and the two screens that read this hook then show "we
      // could not check whether this top-up was already advanced" on
      // EVERY deposit, for ever. A permanent false alarm on the verify
      // desk is worse than the gap it warns about.
      //
      // So: if the column is missing, there are no advances to report and
      // the desk is not nagged. The feature stays dark until the
      // migration lands, which is the rule in CLAUDE.md.
      if (error) {
        const msg = `${(error as { code?: string }).code ?? ""} ${error.message ?? ""}`;
        if (/42703|does not exist|schema cache|PGRST/i.test(msg)) {
          return {} as Record<string, OutstandingPrecharge>;
        }
        throw error;
      }
      const byTopup: Record<string, OutstandingPrecharge> = {};
      for (const row of data ?? []) {
        const id = String(
          (row as { source_wallet_topup_id?: unknown }).source_wallet_topup_id ??
            "",
        );
        if (!id) continue;
        const r = row as { outstanding?: unknown; currency?: unknown };
        byTopup[id] = {
          topupId: id,
          outstanding: Number(r.outstanding) || 0,
          currency: String(r.currency ?? "EUR").toUpperCase(),
        };
      }
      return byTopup;
    },
  });

  return {
    /** topup id -> the advance still outstanding against it. */
    precharges: data ?? {},
    isLoading,
    // An unreadable answer is NOT "no advance". The whole point of this
    // hook is to stop an admin crediting on a wrong assumption, so the
    // screen has to be able to say it could not check.
    isError,
  };
}
