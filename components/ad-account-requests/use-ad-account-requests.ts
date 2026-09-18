import { createClient } from "@/lib/supabase/client";
import { AdAccountRequest } from "@/lib/types/ad-account-request";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { safeIlikeTerm } from "@/lib/utils/search";

export type AdAccountRequestsQueryParams = {
  search?: string | undefined;
  sort?: string | undefined;
  status?: string | undefined;
  page?: number;
  perPage?: number;
  advertiserId?: string | undefined;
  tenantId?: string | undefined;
  requesterEmail?: string | undefined;
  enabled?: boolean;
};

function buildSortParams(sort?: string) {
  switch (sort) {
    case "oldest":
      return { column: "created_at", ascending: true };
    case "email-asc":
      return { column: "email", ascending: true };
    case "email-desc":
      return { column: "email", ascending: false };
    case "status-asc":
      return { column: "status", ascending: true };
    case "status-desc":
      return { column: "status", ascending: false };
    case "platform-asc":
      return { column: "platform", ascending: true };
    case "platform-desc":
      return { column: "platform", ascending: false };
    case "newest":
    default:
      return { column: "created_at", ascending: false };
  }
}

export default function useAdAccountRequests(
  params: AdAccountRequestsQueryParams = {},
) {
  const supabase = createClient();

  const queryKey = useMemo(
    () => [
      "ad-account-requests",
      params.search ?? "",
      params.sort ?? "newest",
      params.status ?? "all",
      params.page ?? 1,
      params.perPage ?? 10,
      params.advertiserId ?? "all",
      params.tenantId ?? "all",
      params.requesterEmail ?? "all",
    ],
    [
      params.search,
      params.sort,
      params.status,
      params.page,
      params.perPage,
      params.advertiserId,
      params.tenantId,
      params.requesterEmail,
    ],
  );

  const { data, isLoading, isError, error, refetch } = useQuery<
    { items: AdAccountRequest[]; total: number } | undefined
  >({
    queryKey,
    enabled: params.enabled ?? true,
    queryFn: async () => {
      const {
        search,
        status,
        page = 1,
        perPage = 10,
        advertiserId,
        tenantId,
        requesterEmail,
      } = params;

      // ── !inner ONLY WHILE SEARCHING ─────────────────────────────────
      //
      // postgrest-js cannot restrict parent rows by an embedded column
      // without an inner join — which is why searching the client code
      // needs one. But an inner join also DROPS every request that has
      // no advertiser row yet, and those are exactly the ones the desk
      // has to notice. So the join is inner only when a search term is
      // narrowing the list anyway, and a plain left join the rest of the
      // time.
      const searching = !!(search && search.trim() !== "");
      let query = searching
        ? supabase
            .from("ad_account_requests")
            .select(
              "*, advertiser:advertisers!inner(id, tenant_client_code, profile:user_profiles(full_name, email))",
              { count: "exact" },
            )
        : supabase
            .from("ad_account_requests")
            .select(
              "*, advertiser:advertisers(id, tenant_client_code, profile:user_profiles(full_name, email))",
              { count: "exact" },
            );

      if (advertiserId) {
        query = query.eq("advertiser_id", advertiserId);
      } else if (requesterEmail) {
        query = query.eq("email", requesterEmail);
      }

      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      if (search && search.trim() !== "") {
        // ── WHAT THE CARD ACTUALLY SHOWS ───────────────────────────────
        //
        // The placeholder says "Search requests…" and every card leads
        // with the advertiser's NAME and client code — while this matched
        // only `email`, which is the ad-account email on the request, not
        // the person's login. Searching the name or the code that is
        // printed in front of the operator returned "No account requests
        // match" on a queue that had them.
        //
        // The term also skipped safeIlikeTerm, unlike both sibling hooks,
        // so a typed % silently widened the match.
        //
        // !inner on the embed, because postgrest-js cannot restrict
        // parent rows by an embedded column without it — the invoices
        // search has been quietly broken for the same reason.
        const term = safeIlikeTerm(search.trim());
        if (term.length > 0) {
          query = query.or(
            [
              `email.ilike."*${term}*"`,
              `advertiser.tenant_client_code.ilike."*${term}*"`,
            ].join(","),
          );
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

      const results = (rows ?? []) as AdAccountRequest[];
      return { items: results, total: count ?? results.length };
    },
  });

  return {
    requests: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    isError,
    error,
    refetch,
  };
}
