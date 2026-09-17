"use client";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { safeIlikeTerm } from "@/lib/utils/search";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import TablePagination from "@/components/ui/table-pagination";
import AffiliateTableRow, {
  ReferralLinkRow,
} from "@/components/affiliate/affiliate-table-row";
import { formatCurrency } from "@/lib/utils";

const EMPTY_VALUE = "N/A";

// Super-admin Referral Links list, ported to the mockup look. Reuses the
// real referral_links_with_details query (+ live status merge), search,
// URL-synced pagination, and the approve/reject control — presentation
// only, no new mutations.
export default function AffiliatesTable() {
  const { profile } = useAppContext();
  const isAdmin = profile?.role === "admin";
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialPage = parseInt(searchParams?.get("page") ?? "1", 10) || 1;
  const initialPerPage =
    parseInt(searchParams?.get("perPage") ?? "10", 10) || 10;
  const initialSearch = searchParams?.get("search") ?? "";
  const [page, setPage] = useState<number>(initialPage);
  const [perPage] = useState<number>(initialPerPage);
  const [search, setSearch] = useState<string>(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState<string>(initialSearch);
  const tenantId = profile?.tenant_id ?? null;

  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }),
    [],
  );

  const formatNumber = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return EMPTY_VALUE;
    return numberFormatter.format(value);
  };

  const formatPercent = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return EMPTY_VALUE;
    return `${numberFormatter.format(value)}%`;
  };

  const formatCommissionAmount = (
    value: number | null | undefined,
    currency: string | null | undefined,
  ) => {
    if (value == null || Number.isNaN(value)) return EMPTY_VALUE;
    const currencyCode = currency?.toUpperCase();

    if (!currencyCode) return formatNumber(value);

    try {
      return formatCurrency(value, currencyCode);
    } catch {
      return `${currencyCode} ${formatNumber(value)}`;
    }
  };

  const {
    data: referralLinksData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["referral-links-with-details", tenantId, page, perPage, debouncedSearch],
    enabled: !!tenantId && isAdmin,
    queryFn: async () => {
      if (!tenantId) return { items: [], total: 0 };
      const start = (page - 1) * perPage;
      const end = start + perPage - 1;
      const supabase = createClient();

      let query = supabase
        .from("referral_links_with_details")
        .select("*", { count: "exact" })
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      // Apply search filter on affiliate fields (sanitised — raw
      // commas/parens would break out of the PostgREST .or() DSL).
      if (debouncedSearch.trim()) {
        const s = safeIlikeTerm(debouncedSearch);
        if (s) {
          query = query.or(
            `affiliate_advertiser_name.ilike."*${s}*",affiliate_advertiser_email.ilike."*${s}*",affiliate_advertiser_tenant_client_code.ilike."*${s}*"`
          );
        }
      }

      const { data, error, count } = await query.range(start, end);

      if (error) throw error;
      const rows = (data ?? []) as ReferralLinkRow[];

      // The details VIEW is hand-authored and may not expose the
      // status column added to referral_links. Fetch statuses
      // directly and merge so the approve/reject control always has
      // the real value (defaults to 'active' if the column is
      // genuinely absent on an older DB).
      const ids = rows.map((r) => r.id).filter(Boolean);
      if (ids.length > 0) {
        const { data: statusRows } = await supabase
          .from("referral_links")
          .select("id, status")
          .in("id", ids);
        const byId = new Map(
          (statusRows ?? []).map((s: { id: string; status: string | null }) => [
            s.id,
            s.status,
          ]),
        );
        for (const r of rows) {
          if (byId.has(r.id)) r.status = byId.get(r.id) ?? r.status ?? "active";
        }
      }

      return { items: rows, total: count ?? 0 };
    },
  });

  const referralLinks = referralLinksData?.items ?? [];
  const total = referralLinksData?.total ?? 0;

  useEffect(() => {
    const params = new URLSearchParams(Array.from(searchParams ?? []));
    if (page && page > 1) params.set("page", String(page));
    else params.delete("page");
    if (perPage && perPage !== 10) params.set("perPage", String(perPage));
    else params.delete("perPage");
    if (search) params.set("search", search);
    else params.delete("search");
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, perPage, search]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to first page on search
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadingState = isLoading || (!!tenantId && !referralLinksData);

  if (!profile) {
    return (
      <div className="psmview">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="psmview">
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            You do not have access to this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="phead">
        <div>
          <h1>Referral Links</h1>
          <p>Approve links, review commissions.</p>
        </div>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            placeholder="Search affiliate…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      {loadingState ? (
        <p className="muted">Loading…</p>
      ) : isError ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Failed to load referral links.{" "}
            {(error as Error)?.message ?? String(error)}
          </p>
        </div>
      ) : referralLinks.length ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="tblwrap">
            <table className="tbl wide">
              <thead>
                <tr>
                  <th>Advertiser</th>
                  <th>Affiliate</th>
                  <th>Commission Type</th>
                  <th className="r">Commission Monthly</th>
                  <th className="r">Commission One-time</th>
                  <th className="r">Commission Recurring</th>
                  <th className="r">Earnings USD</th>
                  <th className="r">Earnings EUR</th>
                  <th className="r">Status</th>
                </tr>
              </thead>
              <tbody>
                {referralLinks.map((referral) => (
                  <AffiliateTableRow
                    key={referral.id}
                    referral={referral}
                    formatCommissionAmount={formatCommissionAmount}
                    formatPercent={formatPercent}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No referral links found.
          </p>
        </div>
      )}

      {!loadingState && !isError && total > 0 && (
        <TablePagination
          total={total}
          page={page}
          perPage={perPage}
          onPageChange={(p) => setPage(p)}
        />
      )}
    </div>
  );
}
