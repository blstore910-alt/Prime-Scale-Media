import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { InvoiceWithRelations } from "@/lib/types/invoice-extended";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export type InvoicesQueryParams = {
  search?: string | undefined;
  page?: number;
  perPage?: number;
};

export default function useInvoices(params: InvoicesQueryParams = {}) {
  const { profile } = useAppContext();

  const queryKey = useMemo(
    () => [
      "invoices",
      profile?.tenant_id,
      params.search ?? "",
      params.page ?? 1,
      params.perPage ?? 10,
    ],
    [profile?.tenant_id, params.search, params.page, params.perPage],
  );

  const { data, isLoading, isError, error } = useQuery<
    { items: InvoiceWithRelations[]; total: number } | undefined
  >({
    queryKey,
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const { search, page = 1, perPage = 10 } = params;
      const supabase = createClient();

      let query = supabase
        .from("invoices")
        .select(
          "*, company:companies(*), advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email))",
          { count: "exact" },
        )
        .eq("tenant_id", profile?.tenant_id)
        .order("created_at", { ascending: false });

      if (search && search.trim() !== "") {
        const term = search.trim();
        const numericOnly = /^\d+$/.test(term);

        if (numericOnly) {
          query = query.eq("number", Number(term));
        } else {
          // Search by advertiser code or company name
          query = query.or(
            `advertiser.tenant_client_code.ilike.%${term}%,company.name.ilike.%${term}%`,
          );
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
