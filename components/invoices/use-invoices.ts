import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { InvoiceWithRelations } from "@/lib/types/invoice-extended";
import { safeIlikeTerm } from "@/lib/utils/search";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export type InvoicesQueryParams = {
  search?: string | undefined;
  /** "all", or one of the statuses the rows actually carry. */
  status?: string | undefined;
  page?: number;
  perPage?: number;
};

export default function useInvoices(params: InvoicesQueryParams = {}) {
  const { profile } = useAppContext();
  const isAdvertiser = profile?.role === "advertiser";
  const advertiserId = profile?.advertiser?.[0]?.id ?? null;

  const queryKey = useMemo(
    () => [
      "invoices",
      profile?.tenant_id,
      isAdvertiser ? advertiserId : "admin",
      params.search ?? "",
      params.status ?? "all",
      params.page ?? 1,
      params.perPage ?? 10,
    ],
    [
      profile?.tenant_id,
      isAdvertiser,
      advertiserId,
      params.search,
      params.status,
      params.page,
      params.perPage,
    ],
  );

  const { data, isLoading, isError, error } = useQuery<
    { items: InvoiceWithRelations[]; total: number } | undefined
  >({
    queryKey,
    enabled: !!profile?.tenant_id && (!isAdvertiser || !!advertiserId),
    queryFn: async () => {
      const { search, status, page = 1, perPage = 10 } = params;
      const supabase = createClient();

      let query = supabase
        .from("invoices")
        .select(
          "*, company:companies(*), advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email))",
          { count: "exact" },
        )
        .eq("tenant_id", profile?.tenant_id)
        .order("created_at", { ascending: false });

      // P1-2 fix: advertisers see only their own invoices
      if (isAdvertiser) {
        if (!advertiserId) {
          return { items: [], total: 0 };
        }
        query = query.eq("advertiser_id", advertiserId);
      }

      // ── WHO OWES US MONEY ───────────────────────────────────────────
      //
      // The filter bar was a search box and nothing else, while every row
      // carries Paid / Unpaid / Overdue / Void / Refunded. So the one
      // question this screen exists to answer could not be asked, and an
      // operator paged through everything by hand.
      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      if (search && search.trim() !== "") {
        const rawTerm = search.trim();
        // ── THE NUMBER THE SCREEN PRINTS ───────────────────────────────
        //
        // Every surface renders invoiceNumber(invoice) — "000005-1042" —
        // including the PDF filename, and the placeholder says "Search
        // invoice no…". Pasting that failed /^\d+$/, fell to the text
        // branch, and searched client codes and company names on EMBEDDED
        // tables, which postgrest-js cannot use to restrict parent rows
        // without an inner join. The invoice was simply unfindable by the
        // one identifier everybody quotes.
        //
        // Strip the client-code prefix and match the sequence.
        const prefixed = /^\d+\s*[-–—/]\s*(\d+)$/.exec(rawTerm);
        const numericOnly = /^\d+$/.test(rawTerm);

        if (prefixed) {
          query = query.eq("number", Number(prefixed[1]));
        } else if (numericOnly) {
          query = query.eq("number", Number(rawTerm));
        } else {
          const term = safeIlikeTerm(rawTerm);
          if (term.length > 0) {
            query = query.or(
              `advertiser.tenant_client_code.ilike."*${term}*",company.name.ilike."*${term}*"`,
            );
          }
        }
      }

      const start = (page - 1) * perPage;
      const end = start + perPage - 1;
      const {
        data: rows,
        error: qError,
        count,
      } = await query.range(start, end);
      if (qError) throw qError;

      return {
        items: (rows ?? []) as InvoiceWithRelations[],
        total: count ?? (rows ?? []).length,
      };
    },
  });

  return {
    invoices: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    isError,
    error,
  };
}
