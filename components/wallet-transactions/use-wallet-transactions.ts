import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { WalletTopupWithAdvertiser } from "@/lib/types/wallet-topup";
import { safeIlikeTerm } from "@/lib/utils/search";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { extractTopupReference } from "@/lib/payment-reference";

export type WalletTransactionsQueryParams = {
  status?: string | undefined;
  currency?: string | undefined;
  search?: string | undefined;
  page?: number;
  perPage?: number;
};

export default function useWalletTransactions(
  params: WalletTransactionsQueryParams = {},
) {
  const { profile } = useAppContext();

  const queryKey = useMemo(
    () => [
      "wallet-transactions",
      profile?.tenant_id,
      params.status ?? "all",
      params.currency ?? "all",
      params.search ?? "",
      params.page ?? 1,
      params.perPage ?? 10,
    ],
    [
      profile?.tenant_id,
      params.status,
      params.currency,
      params.search,
      params.page,
      params.perPage,
    ],
  );

  const { data, isPending, isError, error, refetch } = useQuery<
    { items: WalletTopupWithAdvertiser[]; total: number | null } | undefined
  >({
    queryKey,
    enabled: profile?.role === "admin" && !!profile?.tenant_id,
    queryFn: async () => {
      const { status, currency, search, page = 1, perPage = 10 } = params;
      const supabase = createClient();

      let query = supabase
        .from("wallet_topups")
        .select(
          // profile.id so a card can open the advertiser's own details sheet,
          // which keys on user_profiles.id.
          "*, advertiser:advertisers(tenant_client_code, profile:user_profiles(id, full_name, email))",
          { count: "exact" },
        )
        .eq("tenant_id", profile?.tenant_id)
        .order("created_at", { ascending: false });

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      if (currency && currency !== "all") {
        query = query.eq("currency", currency);
      }

      // reference_no is TEXT, zero-padded to 10 by the create RPC — so every
      // real reference starts with at least one '0'. Coercing the term with
      // Number() dropped that padding and the text comparison could never
      // match; the non-numeric branch was a deliberate match-nothing. Both
      // failed into the same empty card as "this top-up doesn't exist", on the
      // screen an admin uses to find a payment before crediting real money.
      // Text match now, same as the sibling ad-account queue.
      if (search && search.trim() !== "") {
        // ── THE REFERENCE THE CARD PRINTS, NOT THE ONE IT STORES ──────
        //
        // The card shows formatPaymentReference(clientCode, reference_no)
        // — "000005-4839" — and that is the string the customer is told
        // to write on the transfer, the one on the slip, and the one on
        // the bank statement. The column holds the bare "4839", so an
        // admin copying the reference off the card, the slip or the bank
        // got an empty queue on the screen they use before crediting
        // real money.
        //
        // extractTopupReference pulls the tail out of whichever shape
        // they pasted; when it finds nothing, the raw text is used, so a
        // partial search still behaves.
        const raw = search.trim();
        const tail = extractTopupReference(raw) ?? raw;
        const term = safeIlikeTerm(tail);
        if (term.length > 0) {
          query = query.ilike("reference_no", `%${term}%`);
        }
      }

      const start = (page - 1) * perPage;
      const end = start + perPage - 1;
      const { data: rows, error: qError, count } = await query.range(
        start,
        end,
      );
      if (qError) throw qError;

      return {
        items: (rows ?? []) as WalletTopupWithAdvertiser[],
        // ── A COUNT WE DID NOT GET IS NOT A TOTAL ────────────────
        //
        // `count ?? rows.length` reads a null header as "this page is
        // all there is". On page 1 with 12 rows that makes total 12,
        // the pager is gated on `total > perPage` and hides itself, and
        // pages 2+ become unreachable. On page 2 it is worse: null
        // count plus no rows gives total 0, the walk-back clamp bails
        // on `total <= 0`, and the admin is left on an empty card with
        // no control to get off it -- the exact dead end the pager's
        // own comment says was fixed.
        //
        // null travels instead, and the callers already handle it.
        total: count === null || count === undefined ? null : count,
      };
    },
  });

  return {
    transactions: data?.items ?? [],
    /** null = the count header never arrived. NOT zero, and not
     *  "this page is all there is" -- see the note in the query. */
    total: data?.total ?? null,
    // ── isPending, NOT isLoading ──────────────────────────────────
    //
    // react-query v5: isLoading = isPending && isFetching. A DISABLED
    // query (fetchStatus 'idle') and one PAUSED offline both report
    // isLoading FALSE, isError FALSE and data undefined -- the two
    // states where nothing has been read at all. The caller then falls
    // straight past the spinner and past the error branch into the
    // empty card, and an admin reads "No wallet topups to show" over a
    // queue holding eight of them. Nothing errors, so no toast fires
    // either. The advertiser shell was fixed for this months ago; the
    // admin queues never were.
    isLoading: isPending,
    isError,
    error,
    refetch,
  };
}
