import { createClient } from "@/lib/supabase/client";
import { safeIlikeTerm } from "@/lib/utils/search";
import { Commission } from "@/lib/types/commission";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export type CommissionsQueryParams = {
  currency?: string;
  commissionType?: string;
  search?: string;
  sort?: string;
  createdFrom?: string;
  createdTo?: string;
  page?: number;
  perPage?: number;
};

function buildSortParams(sort?: string) {
  switch (sort) {
    case "commission-desc":
      return { column: "amount", ascending: false };
    case "commission-asc":
      return { column: "amount", ascending: true };
    case "oldest":
      return { column: "created_at", ascending: true };
    case "newest":
    default:
      return { column: "created_at", ascending: false };
  }
}

export default function useCommissions(params: CommissionsQueryParams = {}) {
  const supabase = createClient();

  const queryKey = useMemo(
    () => [
      "commissions",
      params.currency ?? "all",
      params.commissionType ?? "all",
      params.search ?? "",
      params.sort ?? "newest",
      params.createdFrom ?? "",
      params.createdTo ?? "",
      params.page ?? 1,
      params.perPage ?? 10,
    ],
    [
      params.currency,
      params.commissionType,
      params.search,
      params.sort,
      params.createdFrom,
      params.createdTo,
      params.page,
      params.perPage,
    ],
  );

  const { data, isLoading, isError, error } = useQuery<
    { items: Commission[]; total: number | null } | undefined
  >({
    queryKey,
    queryFn: async () => {
      const {
        currency,
        commissionType,
        search,
        createdFrom,
        createdTo,
        page = 1,
        perPage = 10,
      } = params;

      // ── NOT `*`. THAT VIEW CARRIES OUR BUYING PRICE. ─────────────
      //
      // `referral_commissions_with_details` has `supplier_cost` and
      // `supplier_fee_pct` on it — what WE pay, and therefore our
      // margin. `select("*")` hands both to whoever opens
      // /commissions, and the screen renders eleven fields of which
      // neither is one.
      //
      // The identical bug was found this morning in
      // components/admin/users/user-affiliates.tsx, on the same view,
      // and fixed there. This was the second caller and it was
      // missed. So: the column list is the one in
      // lib/types/commission.ts, and nothing beyond it.
      //
      // A `*` is not shorter to read, it is only shorter to type, and
      // it silently picks up every column somebody adds to the view
      // later.
      let query = supabase
        .from("referral_commissions_with_details")
        .select(
          "idx, id, created_at, referral_link_id, tenant_id, type, amount, " +
            "currency, status, topup_id, subscription_id, " +
            "subscription_invoice_id, " +
            "affiliate_advertiser_tenant_client_code, " +
            "affiliate_advertiser_email, affiliate_advertiser_name, " +
            "referred_advertiser_tenant_client_code, " +
            "referred_advertiser_email, referred_advertiser_name",
          { count: "exact" },
        );

      if (currency && currency !== "all") {
        query = query.eq("currency", currency);
      }

      if (commissionType && commissionType !== "all") {
        // The accrual writes `pct`; older rows say `percentage`. Picking
        // "Percentage" found nothing while the EUR 4.85 row was on screen.
        query =
          commissionType === "percentage"
            ? query.in("type", ["pct", "percentage"])
            : query.eq("type", commissionType);
      }

      if (search && search.trim() !== "") {
        // Sanitise before it enters the PostgREST .or() DSL — a raw
        // comma/paren would break out of the ilike value into the
        // filter tree. Quote the term so the wildcards still apply.
        const s = safeIlikeTerm(search);
        if (s) {
          query = query.or(
            `referred_advertiser_tenant_client_code.ilike."%${s}%",referred_advertiser_name.ilike."%${s}%",referred_advertiser_email.ilike."%${s}%",affiliate_advertiser_tenant_client_code.ilike."%${s}%",affiliate_advertiser_name.ilike."%${s}%",affiliate_advertiser_email.ilike."%${s}%"`,
          );
        }
      }

      if (createdFrom && createdTo) {
        query = query.gte("created_at", createdFrom).lt("created_at", createdTo);
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

      return {
        items: (rows ?? []) as unknown as Commission[],
        // A missing count header is not "one page". Falling back to the
        // length of THIS page makes totalPages 1, and TablePagination
        // renders nothing at all below that -- ten rows, no pager, and a
        // ledger the owner reconciles from as though it were complete.
        // null means unknown; the caller decides what to say.
        total:
          typeof count === "number" && Number.isFinite(count) ? count : null,
      };
    },
  });

  return {
    commissions: data?.items ?? [],
    // null, not 0. The queryFn three lines up works the unknown case
    // out correctly and this threw it away again -- so a missing
    // content-range header hid the pager and clamped a bookmarked
    // ?page=3 silently back to 1.
    total: data?.total ?? null,
    isLoading,
    isError,
    error,
  };
}
