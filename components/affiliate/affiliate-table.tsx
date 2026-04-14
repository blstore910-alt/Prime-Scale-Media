"use client";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import TablePagination from "@/components/ui/table-pagination";
import { useMediaQuery } from "usehooks-ts";
import AffiliateTableRow, {
  ReferralLinkRow,
} from "@/components/affiliate/affiliate-table-row";
import { formatCurrency } from "@/lib/utils";

const EMPTY_VALUE = "N/A";

export default function AffiliatesTable() {
  const { profile } = useAppContext();
  const isAdmin = profile?.role === "admin";
  const isTabletScreen = useMediaQuery("(min-width: 768px)");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialPage = parseInt(searchParams?.get("page") ?? "1", 10) || 1;
  const initialPerPage =
    parseInt(searchParams?.get("perPage") ?? "10", 10) || 10;
  const [page, setPage] = useState<number>(initialPage);
  const [perPage] = useState<number>(initialPerPage);
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

  const {
    data: referralLinksData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["referral-links-with-details", tenantId, page, perPage],
    enabled: !!tenantId && isAdmin,
    queryFn: async () => {
      if (!tenantId) return { items: [], total: 0 };
      const start = (page - 1) * perPage;
      const end = start + perPage - 1;
      const supabase = createClient();
      const { data, error, count } = await supabase
        .from("referral_links_with_details")
        .select("*", { count: "exact" })
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .range(start, end);

      if (error) throw error;
      return { items: (data ?? []) as ReferralLinkRow[], total: count ?? 0 };
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
    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, perPage]);

  const colCount = 8;
  const loadingState = isLoading || (!!tenantId && !referralLinksData);

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="text-sm text-muted-foreground">
        You do not have access to this page.
      </div>
    );
  }

  return (
    <>
      {isTabletScreen ? (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead>Advertiser</TableHead>
                <TableHead>Affiliate</TableHead>
                <TableHead>Commission Type</TableHead>
                <TableHead>Commission Monthly</TableHead>
                <TableHead>Commission One-time</TableHead>
                <TableHead>Commission Recurring</TableHead>
                <TableHead>Earnings USD</TableHead>
                <TableHead>Earnings EUR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingState ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <TableRow key={idx} className="animate-pulse">
                    {Array.from({ length: colCount }).map((_, cellIdx) => (
                      <LoaderCell key={cellIdx} />
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell
                    colSpan={colCount}
                    className="text-center text-destructive py-8"
                  >
                    <div role="alert" aria-live="assertive">
                      <p className="font-medium">
                        Failed to load referral links.
                      </p>
                      <p className="mt-2 text-sm">
                        {(error as Error)?.message ?? String(error)}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : referralLinks.length ? (
                referralLinks.map((referral) => (
                  <AffiliateTableRow
                    key={referral.id}
                    referral={referral}
                    formatNumber={formatNumber}
                    formatPercent={formatPercent}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={colCount}
                    className="text-center py-6 text-sm text-muted-foreground"
                  >
                    No referral links found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div>
          {!loadingState && !isError && referralLinks.length ? (
            <div className="grid gap-4">
              {referralLinks.map((referral) => (
                <ReferralLinkCard
                  key={referral.id}
                  referral={referral}
                  formatNumber={formatNumber}
                  formatPercent={formatPercent}
                />
              ))}
            </div>
          ) : loadingState ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
            </div>
          ) : isError ? (
            <div className="mt-4 flex items-center gap-2 text-destructive">
              <span>{(error as Error)?.message ?? String(error)}</span>
            </div>
          ) : (
            <div className="mt-4 text-center py-6 text-sm text-muted-foreground">
              No referral links found
            </div>
          )}
        </div>
      )}
      <div className="p-4">
        <TablePagination
          total={total}
          page={page}
          perPage={perPage}
          onPageChange={(p) => setPage(p)}
        />
      </div>
    </>
  );
}

function ReferralLinkCard({
  referral,
  formatNumber,

  formatPercent,
}: {
  referral: ReferralLinkRow;
  formatNumber: (value: number | null | undefined) => string;

  formatPercent: (value: number | null | undefined) => string;
}) {
  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Advertiser
        </p>
        <div>
          <p className="text-sm font-medium">
            {referral.referred_advertiser_name || EMPTY_VALUE}
          </p>
          <p className="text-xs text-muted-foreground">
            {referral.referred_advertiser_email || EMPTY_VALUE}
          </p>
          <p className="text-xs text-muted-foreground">
            {referral.referred_advertiser_tenant_client_code || EMPTY_VALUE}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Affiliate
        </p>
        <div>
          <p className="text-sm font-medium">
            {referral.affiliate_advertiser_name || EMPTY_VALUE}
          </p>
          <p className="text-xs text-muted-foreground">
            {referral.affiliate_advertiser_email || EMPTY_VALUE}
          </p>
          <p className="text-xs text-muted-foreground">
            {referral.affiliate_advertiser_tenant_client_code || EMPTY_VALUE}
          </p>
        </div>
      </div>
      <div className="grid gap-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Commission Type</span>
          <span>{referral.commission_type || EMPTY_VALUE}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Commission Monthly</span>
          <span>{formatNumber(referral.commission_monthly)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Commission One-time</span>
          <span>{formatNumber(referral.commission_onetime)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Commission Recurring</span>
          <span>{formatPercent(referral.commission_pct)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Earnings USD</span>
          <span>{formatCurrency(referral.earnings_usd as number, "USD")}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Earnings EUR</span>
          <span>{formatCurrency(referral.earnings_eur as number, "EUR")}</span>
        </div>
      </div>
    </div>
  );
}

function LoaderCell() {
  return (
    <TableCell>
      <div className="h-4 bg-muted rounded w-8" />
    </TableCell>
  );
}
