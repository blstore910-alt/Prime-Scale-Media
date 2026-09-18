"use client";

import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

/**
 * The bank deposit that belongs to a pending top-up.
 *
 * An admin pressing Verify is saying "this money arrived". Until now the
 * screen gave them nothing to say it with: the card showed what the CUSTOMER
 * claimed — amount, reference, date filed — and the confirmation repeated
 * the same four facts back. The one thing that turns a claim into a fact,
 * the matching deposit sitting in the Wise feed further down the very same
 * page, was never brought next to it.
 *
 * So the admin either scrolled down and compared by eye, or credited real
 * money on the customer's word. This puts the deposit on the card.
 *
 * Read-only, and RLS covers it.
 */
export type MatchedDeposit = {
  topupId: string;
  amountCents: number;
  currency: string;
  senderName: string | null;
  reference: string | null;
  receivedAt: string;
  status: string;
};

export function useMatchedDeposits(topupIds: Array<string | null | undefined>) {
  const ids = Array.from(new Set(topupIds.filter((v): v is string => !!v)));
  ids.sort();

  const { data, isError, isLoading } = useQuery({
    // The sorted id list IS the key, so the query refetches when the page
    // of top-ups changes and not on every render.
    queryKey: ["matched-deposits", ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wise_incoming_transfers")
        .select(
          "suggested_topup_id, amount_cents, currency, sender_name, reference, created_at, status",
        )
        .in("suggested_topup_id", ids)
        // A deposit somebody deliberately put aside is not evidence for
        // anything. Without this, archiving one still painted the green
        // "Matched with a bank deposit" strip on the top-up card and
        // flipped the credit dialog's lead to "a bank deposit matching
        // this claim has arrived".
        .is("archived_at", null);
      if (error) throw error;

      const out: Record<string, MatchedDeposit> = {};
      for (const row of data ?? []) {
        const r = row as {
          suggested_topup_id: string | null;
          amount_cents: number;
          currency: string;
          sender_name: string | null;
          reference: string | null;
          created_at: string;
          status: string;
        };
        if (!r.suggested_topup_id) continue;
        // One top-up should never have two, but if it does, the newest wins
        // — and the card says "matched", not "matched to exactly one", so a
        // silent pick here is honest.
        const prev = out[r.suggested_topup_id];
        if (prev && prev.receivedAt >= r.created_at) continue;
        out[r.suggested_topup_id] = {
          topupId: r.suggested_topup_id,
          amountCents: Math.round(Number(r.amount_cents ?? 0)),
          currency: String(r.currency ?? ""),
          senderName: r.sender_name,
          reference: r.reference,
          receivedAt: r.created_at,
          status: String(r.status ?? ""),
        };
      }
      return out;
    },
  });

  // A FAILED READ IS NOT "no deposit matched". The card's two states are
  // "the money is here" and "nothing has arrived for this yet", and the
  // second one is the state that tells an admin to go and check the slip.
  // Reporting an unreadable feed as the second one would quietly turn a
  // broken query into a reason to trust the customer's word.
  // LOADING IS ITS OWN STATE. While the query is in flight byTopup is
  // empty, and an empty result renders as the amber "no bank deposit
  // matched this yet — only the customer's word so far". That is the
  // sentence that tells an admin not to trust the claim, and it was being
  // shown on first paint, on every page change and on every window
  // refocus, a beat before it turned green. Four states, not three.
  return { byTopup: data ?? {}, isError, isLoading: ids.length > 0 && isLoading };
}
