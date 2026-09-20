import { createClient } from "@/lib/supabase/client";
import { Topup } from "@/lib/types/topup";
import { safeIlikeTerm } from "@/lib/utils/search";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export type TopupsQueryParams = {
  /**
   * WHOSE TOP-UPS. Absent on the admin screen, which is meant to see the
   * tenant's; present on any customer-facing surface, which is not.
   *
   * This query reads top_ups_view with no tenant and no advertiser
   * predicate — it relies entirely on the view carrying row-level
   * security through, and the view is owner-semantics until the pending
   * fix lands. /inactive rendered this table to a signed-in customer, so
   * "the view will sort it out" was the only thing between them and
   * every tenant's payments.
   *
   * A customer surface says whose rows it wants. Belt as well as braces.
   */
  advertiserId?: string | null;
  type?: string | undefined;
  source?: string | undefined;
  status?: string | undefined;
  search?: string | undefined;
  sort?: string | undefined;
  page?: number;
  perPage?: number;
};

function buildSortParams(sort?: string) {
  switch (sort) {
    case "amount-desc":
      return { column: "amount_received", ascending: false };
    case "amount-asc":
      return { column: "amount_received", ascending: true };
    case "amount-usd-desc":
      return { column: "amount_usd", ascending: false };
    case "amount-usd-asc":
      return { column: "amount_usd", ascending: true };
    case "fee-desc":
      return { column: "fee", ascending: false };
    case "fee-asc":
      return { column: "fee", ascending: true };
    case "account-asc":
      return { column: "account_name", ascending: true };
    case "account-desc":
      return { column: "account_name", ascending: false };
    case "number-asc":
      return { column: "number", ascending: true };
    case "number-desc":
      return { column: "number", ascending: false };
    case "oldest":
      return { column: "created_at", ascending: true };
    case "newest":
    default:
      return { column: "created_at", ascending: false };
  }
}

export default function useTopups(params: TopupsQueryParams = {}) {
  const supabase = createClient();

  const queryKey = useMemo(
    () => [
      "top-ups",
      // In the key as well as the deps: two surfaces sharing one cache
      // entry is how a customer ends up looking at the admin result.
      params.advertiserId ?? "all-advertisers",
      params.type ?? "all",
      params.source ?? "all",
      params.status ?? "all",
      params.search ?? "",
      params.sort ?? "newest",
      params.page ?? 1,
      params.perPage ?? 10,
    ],
    [
      params.advertiserId,
      params.type,
      params.source,
      params.status,
      params.search,
      params.sort,
      params.page,
      params.perPage,
    ]
  );

  const { data, isLoading, isError, error, refetch } = useQuery<
    { items: Topup[]; total: number } | undefined
  >({
    queryKey,
    queryFn: async () => {
      const {
        advertiserId,
        type,
        source,
        status,
        search,
        page = 1,
        perPage = 10,
      } = params;

      // A customer gets the columns their own row renderer uses, not the
      // whole view. top_ups.source can carry a supplier identifier — the
      // GDPR export excludes it by name for exactly that reason — and
      // notes is admin free text about them.
      //
      // Two literal selects rather than one conditional string, because
      // postgrest-js infers the row type from the literal and a ternary
      // gives it a union it cannot parse.
      let query = advertiserId
        ? supabase
            .from("top_ups_view")
            .select(
              "id, created_at, number, type, status, currency, amount_received, amount_usd, topup_amount, fee, fee_amount, account_name, tenant_client_code",
              { count: "exact" },
            )
            .eq("advertiser_id", advertiserId)
        : supabase.from("top_ups_view").select(`*`, { count: "exact" });

      if (type && type !== "all") {
        query = query.eq("type", type);
      }
      if (source && source !== "all") {
        query = query.eq("source", source);
      }
      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      if (search && search.trim() !== "") {
        const rawTerm = search.trim();
        const term = safeIlikeTerm(rawTerm);
        const orPatterns: string[] = [];

        if (term.length > 0) {
          // ── A MISS READS AS AN EMPTY QUEUE ────────────────────────
          //
          // This matched the client code and the top-up number and
          // nothing else, under a box labelled "Search top-ups…" and
          // above an empty state that says "No ad-account topups to
          // show." So an admin who types the advertiser's name, or the
          // ad account's, is told there is nothing waiting on them —
          // on the screen whose whole job is to say what is.
          //
          // top_ups_view is a VIEW with flat columns, so account_name
          // is searchable directly.
          orPatterns.push(`tenant_client_code.ilike."*${term}*"`);
          orPatterns.push(`account_name.ilike."*${term}*"`);
        }

        if (!isNaN(Number(rawTerm))) {
          orPatterns.push(`number.eq.${Number(rawTerm)}`);
        }

        if (orPatterns.length > 0) {
          query = query.or(orPatterns.join(","));
        }
      }

      const { column, ascending } = buildSortParams(params.sort);

      query = query.order(column, { ascending });

      const start = (page - 1) * perPage;
      const end = start + perPage - 1;
      const {
        data: rows,
        error: qError,
        count,
      } = await query.range(start, end);
      if (qError) throw qError;

      const results = (rows ?? []) as Topup[];

      if (column && column.includes("account_name")) {
        results.sort((a, b) => {
          const aName = a.account?.name ?? "";
          const bName = b.account?.name ?? "";
          if (aName < bName) return ascending ? -1 : 1;
          if (aName > bName) return ascending ? 1 : -1;
          return 0;
        });
      }

      return { items: results, total: count ?? results.length };
    },
  });

  return {
    topups: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    isError,
    error,
    refetch,
  };
}
