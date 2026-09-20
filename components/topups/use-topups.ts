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
  /**
   * Off means "do not run this query at all".
   *
   * A customer surface passes `enabled: !!advertiserId`, because the
   * else-branch below is `select("*")` with no advertiser and no tenant
   * predicate. Every `role='affiliate'` profile has a NULL advertiser --
   * ensure_advertiser_and_wallet refuses to make one for a non-advertiser
   * -- so a deactivated affiliate landing on /inactive took that branch
   * and was handed the tenant's whole top-up table, including
   * `top_ups.source` (which the GDPR export excludes BY NAME because it
   * can carry a supplier identifier) and `notes`, which is admin free
   * text about the customer. It rendered none of it; it was a JSON leak.
   */
  enabled?: boolean;
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
    enabled: params.enabled ?? true,
    queryFn: () => runQuery(false),
  });

  async function runQuery(skipDeletedFilter: boolean): Promise<{
    items: Topup[];
    total: number;
  }> {
    {
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

      // ── A STRUCK-OUT TOP-UP IS NOT ON THIS QUEUE ────────────────
      //
      // The dashboard badge excludes is_deleted, and so do all eight
      // /api/stats money readers -- this list did not, so a struck-out
      // pending top-up dropped off the badge and stayed here with a
      // live Verify button beside it.
      //
      // Asked for, and RETRIED WITHOUT IT on 42703: top_ups_view is
      // hand-authored on live and may not expose the column, and a
      // select naming one that does not exist throws rather than
      // degrading -- which would take this whole screen down.
      if (!skipDeletedFilter) {
        query = query.not("is_deleted", "is", true);
      }

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
      if (qError) {
        if (
          !skipDeletedFilter &&
          ((qError as { code?: string }).code === "42703" ||
            /is_deleted/i.test(String(qError.message ?? "")))
        ) {
          return runQuery(true);
        }
        throw qError;
      }

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
    }
  }

  return {
    topups: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    isError,
    error,
    refetch,
  };
}
