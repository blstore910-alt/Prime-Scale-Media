"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TablePagination from "@/components/ui/table-pagination";
import { useAppContext } from "@/context/app-provider";
import { formatCurrency, getURL } from "@/lib/utils";
import { Copy, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import AffiliateCommissionsDialog from "./affiliate-commissions-dialog";
import { formatNumber } from "./format";
import { MyReferral } from "./types";
import useMyReferrals from "./use-my-referrals";
import { toast } from "sonner";
import { COMMISSION_TYPE_LABELS } from "@/lib/constants";
import { Badge } from "../ui/badge";

const EMPTY_VALUE = "N/A";

const formatValue = (value: number | string | null | undefined) => {
  if (value == null) return EMPTY_VALUE;
  return formatNumber(value);
};

const formatPercent = (value: number | string | null | undefined) => {
  if (value == null) return EMPTY_VALUE;
  return `${formatNumber(value)}%`;
};

const getCommissionDisplay = (referral: MyReferral) => {
  const type = referral.commission_type ?? "";
  return {
    typeLabel: COMMISSION_TYPE_LABELS[type] || EMPTY_VALUE,
    monthly:
      type === "monthly" || type === "monthly_pct"
        ? formatValue(referral.commission_monthly)
        : EMPTY_VALUE,
    onetime:
      type === "onetime" || type === "onetime_pct"
        ? formatValue(referral.commission_onetime)
        : EMPTY_VALUE,
    recurring:
      type === "monthly_pct" || type === "onetime_pct"
        ? formatPercent(referral.commission_pct)
        : EMPTY_VALUE,
  };
};

export default function MyAffiliatesTable() {
  const { profile } = useAppContext();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isTabletScreen = useMediaQuery("(min-width: 768px)");

  const initialQ = searchParams?.get("q") ?? "";
  const initialPage = parseInt(searchParams?.get("page") ?? "1", 10) || 1;
  const initialPerPage =
    parseInt(searchParams?.get("perPage") ?? "10", 10) || 10;

  const [search, setSearch] = useState(initialQ);
  const [debouncedSearch, setDebouncedSearch] = useState(initialQ);
  const [page, setPage] = useState(initialPage);
  const [perPage] = useState(initialPerPage);
  const [selectedReferral, setSelectedReferral] = useState<MyReferral | null>(
    null,
  );

  const advertiserId =
    profile?.role === "advertiser" ? profile.advertiser?.[0]?.id : undefined;
  const tenantId = profile?.tenant_id;
  const tenantSlug = profile?.tenant?.slug;
  const referralCode = profile?.advertiser?.[0]?.tenant_client_code;
  const isAffiliate = Boolean(advertiserId && tenantId);
  const isAffiliateLoading = false;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    const params = new URLSearchParams(Array.from(searchParams ?? []));

    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
    else params.delete("q");

    if (page > 1) params.set("page", String(page));
    else params.delete("page");

    if (perPage !== 10) params.set("perPage", String(perPage));
    else params.delete("perPage");

    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, page, perPage]);

  const shouldFetchReferrals = Boolean(advertiserId && tenantId);

  const { referrals, total, isLoading, isError, error } = useMyReferrals({
    affiliateAdvertiserId: advertiserId,
    tenantId,
    search: debouncedSearch,
    page,
    perPage,
    enabled: shouldFetchReferrals,
  });

  const colCount = 8;
  const pageDescription = useMemo(() => {
    if (!isAffiliate)
      return "You do not have any referred advertisers yet. Once advertisers are linked to you, they will appear here.";
    return "Track your referred advertisers and review topup commissions.";
  }, [isAffiliate]);

  const referralLink = useMemo(() => {
    if (!tenantSlug || !referralCode) return "";
    const baseUrl = getURL().replace(/\/$/, "");
    const url = new URL(`${baseUrl}/auth/sign-up`);
    url.searchParams.set("t", tenantSlug);
    url.searchParams.set("ref", referralCode);
    return url.toString();
  }, [tenantSlug, referralCode]);

  const handleCopyReferral = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      toast.success("Referral link copied.");
    } catch (error) {
      toast.error("Failed to copy referral link.", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Your referral link</p>
            <p className="text-xs text-muted-foreground">
              Share this link to track new advertisers.
            </p>
          </div>
          <div className="flex w-full flex-1 items-center gap-2 sm:max-w-xl">
            <Input
              value={referralLink || "Referral link unavailable"}
              readOnly
              className="truncate"
            />
            <Button
              variant="outline"
              onClick={handleCopyReferral}
              disabled={!referralLink}
              aria-label="Copy referral link"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            My Referrals
          </h2>
          <p className="text-sm text-muted-foreground">{pageDescription}</p>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search advertiser email or name..."
            className="pl-8"
            disabled={isAffiliateLoading || !isAffiliate}
          />
        </div>
      </div>

      {isAffiliateLoading ? (
        isTabletScreen ? (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted">
                <TableRow>
                  <TableHead>Advertiser</TableHead>
                  <TableHead>Commission Type</TableHead>
                  <TableHead>Commission One-time</TableHead>
                  <TableHead>Commission Monthly</TableHead>
                  <TableHead>Commission Recurring</TableHead>
                  <TableHead>USD Earnings</TableHead>
                  <TableHead>EUR Earnings</TableHead>
                  <TableHead className="w-[140px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, idx) => (
                  <TableRow key={idx} className="animate-pulse">
                    {Array.from({ length: colCount }).map((__, cellIdx) => (
                      <LoaderCell key={cellIdx} />
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid gap-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="h-32 rounded-lg border bg-muted/30 animate-pulse"
              />
            ))}
          </div>
        )
      ) : !isAffiliate ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          You have no affiliated advertisers yet.
        </div>
      ) : (
        <>
          {isTabletScreen ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead>Advertiser</TableHead>
                    <TableHead>Commission Type</TableHead>
                    <TableHead>Commission One-time</TableHead>
                    <TableHead>Commission Monthly</TableHead>
                    <TableHead>Commission Recurring</TableHead>
                    <TableHead>USD Earnings</TableHead>
                    <TableHead>EUR Earnings</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, idx) => (
                      <TableRow key={idx} className="animate-pulse">
                        {Array.from({ length: colCount }).map((__, cellIdx) => (
                          <LoaderCell key={cellIdx} />
                        ))}
                      </TableRow>
                    ))
                  ) : isError ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-8 text-center text-destructive"
                      >
                        {(error as Error)?.message ??
                          "Failed to load affiliates."}
                      </TableCell>
                    </TableRow>
                  ) : referrals.length ? (
                    referrals.map((referral) => {
                      const commission = getCommissionDisplay(referral);
                      return (
                        <TableRow key={referral.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <Badge variant={"outline"}>
                                {referral.referred_advertiser_tenant_client_code ||
                                  EMPTY_VALUE}
                              </Badge>
                              <span className="font-medium">
                                {referral.referred_advertiser_name ||
                                  EMPTY_VALUE}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>{commission.typeLabel}</TableCell>
                          <TableCell className="font-mono font-semibold">
                            {commission.onetime}
                          </TableCell>
                          <TableCell className="font-mono font-semibold">
                            {commission.monthly}
                          </TableCell>
                          <TableCell className="font-mono font-semibold">
                            {commission.recurring}
                          </TableCell>
                          <TableCell className="font-mono font-semibold">
                            {formatCurrency(
                              referral.earnings_usd as number,
                              "USD",
                            )}
                          </TableCell>
                          <TableCell className="font-mono font-semibold">
                            {formatCurrency(
                              referral.earnings_eur as number,
                              "EUR",
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedReferral(referral)}
                            >
                              View Earnings
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-8 text-center text-muted-foreground"
                      >
                        No affiliated advertisers found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          ) : isLoading ? (
            <div className="grid gap-3">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-36 rounded-lg border bg-muted/30 animate-pulse"
                />
              ))}
            </div>
          ) : isError ? (
            <div className="rounded-lg border p-6 text-center text-destructive">
              {(error as Error)?.message ?? "Failed to load affiliates."}
            </div>
          ) : referrals.length ? (
            <div className="grid gap-3">
              {referrals.map((referral) => (
                <MyAffiliateCard
                  key={referral.id}
                  referral={referral}
                  onViewEarnings={() => setSelectedReferral(referral)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              No affiliated advertisers found.
            </div>
          )}

          {total > perPage ? (
            <div className="p-4">
              <TablePagination
                total={total}
                page={page}
                perPage={perPage}
                onPageChange={(nextPage) => setPage(nextPage)}
              />
            </div>
          ) : null}
        </>
      )}

      <AffiliateCommissionsDialog
        open={!!selectedReferral}
        referral={selectedReferral}
        onOpenChange={(open) => {
          if (!open) setSelectedReferral(null);
        }}
      />
    </div>
  );
}

function LoaderCell() {
  return (
    <TableCell>
      <div className="h-4 w-16 rounded bg-muted" />
    </TableCell>
  );
}

function MyAffiliateCard({
  referral,
  onViewEarnings,
}: {
  referral: MyReferral;
  onViewEarnings: () => void;
}) {
  const commission = getCommissionDisplay(referral);
  return (
    <Card className="p-1.5 rounded-lg">
      <CardContent className="p-2.5 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] leading-tight text-muted-foreground truncate">
              {referral.referred_advertiser_tenant_client_code || EMPTY_VALUE}
            </p>
            <CardTitle className="text-sm leading-tight truncate">
              {referral.referred_advertiser_name || "Unknown Advertiser"}
            </CardTitle>
            <p className="text-[11px] leading-tight text-muted-foreground truncate">
              {referral.referred_advertiser_email || EMPTY_VALUE}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <DetailItem label="Commission Type" value={commission.typeLabel} />
          <DetailItem
            label="Commission One-time"
            value={commission.onetime}
            mono
          />
          <DetailItem
            label="Commission Monthly"
            value={commission.monthly}
            mono
          />
          <DetailItem
            label="Commission Recurring"
            value={commission.recurring}
            mono
          />
          <DetailItem
            label="USD Earnings"
            value={formatCurrency(referral.earnings_usd as number, "USD")}
            mono
          />
          <DetailItem
            label="EUR Earnings"
            value={formatCurrency(referral.earnings_eur as number, "EUR")}
          />
        </div>

        <div className="pt-2 border-t">
          <Button
            className="w-full h-8"
            size="sm"
            variant="outline"
            onClick={onViewEarnings}
          >
            View Earnings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailItem({
  label,
  value,
  className,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] leading-tight text-muted-foreground">
        {label}
      </span>
      <span
        className={`${mono ? "font-mono font-bold" : "font-medium"} text-sm leading-tight ${className ?? ""}`}
      >
        {value}
      </span>
    </div>
  );
}
