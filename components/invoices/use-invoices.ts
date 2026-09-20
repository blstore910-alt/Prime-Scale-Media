import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { InvoiceWithRelations } from "@/lib/types/invoice-extended";
import { advertiserIdsMatching } from "@/lib/search-advertisers";
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
      // ── "OVERDUE" IS NOT A STATUS ──────────────────────────────────
      //
      // The only statuses anything writes are unpaid, paid and void.
      // 'refunded' exists nowhere but as an RPC's return label, and
      // overdue is a DERIVED condition: unpaid with a due date in the
      // past. So selecting Overdue always returned "No invoices", which
      // reads as "nobody is late" while past-due invoices sit under
      // Unpaid — on the screen an operator uses to find exactly those.
      if (status === "overdue") {
        query = query
          .eq("status", "unpaid")
          .not("due_date", "is", null)
          .lt("due_date", new Date().toISOString());
      } else if (status && status !== "all") {
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
          // ── IDS FIRST, BECAUSE AN EMBEDDED FILTER DOES NOT NARROW ──
          //
          // This put the filter on an embedded column over a
          // non-!inner embed. PostgREST cannot restrict PARENT rows
          // that way -- it nulls the embed on rows that do not match
          // and returns every invoice in the tenant anyway. And the
          // screen asserts the narrow reading regardless: the box is
          // filled in, the filter badge says 1 active, and the pager
          // counts the UNRESTRICTED set.
          //
          // /subscriptions puts an Invoices button on every row linking
          // to /invoices?q=<client code>, which lands exactly here. An
          // admin sees an unpaid EUR 200 row under what they believe is
          // PSM0005 and presses Mark paid -- onto somebody else's
          // invoice. Paid is one-way: paid -> unpaid is refused and a
          // paid invoice cannot be voided.
          const ids = await advertiserIdsMatching(
            supabase,
            profile?.tenant_id,
            rawTerm,
          );
          if (ids) {
            // An EMPTY array is "narrowed, and nothing matched". It must
            // stay narrow -- dropping the filter here is how the whole
            // ledger came back under one customer's code.
            query = query.in(
              "advertiser_id",
              ids.length > 0
                ? ids
                : ["00000000-0000-0000-0000-000000000000"],
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
