import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { AdAccountRequest } from "@/lib/types/ad-account-request";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { safeIlikeTerm } from "@/lib/utils/search";
import { advertiserIdsMatching } from "@/lib/search-advertisers";

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
  const { profile } = useAppContext();

  const queryKey = useMemo(
    () => [
      "ad-account-requests",
      params.search ?? "",
      params.sort ?? "newest",
      params.status ?? "all",
      params.page ?? 1,
      params.perPage ?? 10,
      params.advertiserId ?? "all",
      params.tenantId ?? profile?.tenant_id ?? "all",
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
      profile?.tenant_id,
      params.requesterEmail,
    ],
  );

  const effectiveTenantId = params.tenantId ?? profile?.tenant_id ?? undefined;

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

      // The caller's tenant, or the session's. Neither admin caller
      // passes one, so this predicate was simply absent for them and the
      // search that depends on it could not resolve anything.
      if (effectiveTenantId) {
        query = query.eq("tenant_id", effectiveTenantId);
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
        // ── THE EMBEDDED ARM WORKS HERE, BECAUSE THIS ONE IS !inner ─
        //
        // Unlike /invoices, this hook switches the embed to
        // `advertisers!inner` whenever there is a search term, and
        // PostgREST CAN restrict parents through a top-level or= with
        // an inner join. Replacing it with an ids-only arm -- and then
        // resolving those ids against a tenantId neither admin caller
        // passes -- broke a search that was working.
        //
        // So: keep it, and add the ids as a SECOND arm. That covers a
        // customer's own name and email as well as the client code, and
        // it survives the !inner dropping requests whose advertiser_id
        // is NULL, which the comment above calls exactly the ones the
        // desk has to notice.
        const term = safeIlikeTerm(search.trim());
        // Caught, not thrown. This is a SECOND arm on a search box --
        // if it fails, the email arm still works. Letting it reject
        // takes the entire Requests queue to isError, which is the
        // identical "blast radius went from one column to the page"
        // fault fixed in affiliate-table in the same commit.
        let ids: string[] | null = null;
        try {
          ids = await advertiserIdsMatching(
            supabase,
            effectiveTenantId,
            search.trim(),
          );
        } catch {
          ids = null;
        }
        const orParts: string[] = [];
        if (term.length > 0) {
          orParts.push(`email.ilike."*${term}*"`);
          orParts.push(`advertiser.tenant_client_code.ilike."*${term}*"`);
        }
        if (ids && ids.length > 0) {
          orParts.push(`advertiser_id.in.(${ids.join(",")})`);
        }
        if (orParts.length > 0) {
          query = query.or(orParts.join(","));
        } else {
          // safeIlikeTerm can strip a term to nothing -- typing %, _, (
          // or a comma -- and an unfiltered queue under a filled search
          // box is the fault this whole change is about. Stay narrow.
          query = query.eq(
            "advertiser_id",
            "00000000-0000-0000-0000-000000000000",
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
