"use client";

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
import { Commission } from "@/lib/types/commission";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DateRange } from "react-day-picker";
import { useMediaQuery } from "usehooks-ts";
import CommissionCard from "./commission-card";
import CommissionRow from "./commission-row";
import CommissionsFilters from "./commissions-filters";
import useCommissions from "./use-commissions";

dayjs.extend(utc);

function parseDateParam(value: string | null): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function formatDateParam(date: Date): string {
  return dayjs(date).format("YYYY-MM-DD");
}

export default function CommissionsTable() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useAppContext();
  const isAdmin = profile?.role === "admin";
  const isTabletScreen = useMediaQuery("(min-width: 768px)");

  const initialCurrency = searchParams?.get("currency") ?? "all";
  const initialCommissionType = searchParams?.get("commissionType") ?? "all";
  const initialSort = searchParams?.get("sort") ?? "newest";
  const initialQ = searchParams?.get("q") ?? "";
  const initialStartDate = searchParams?.get("startDate");
  const initialEndDate = searchParams?.get("endDate");
  const initialPage = parseInt(searchParams?.get("page") ?? "1", 10) || 1;
  const initialPerPage =
    parseInt(searchParams?.get("perPage") ?? "10", 10) || 10;
  const initialFrom = parseDateParam(initialStartDate);
  const initialTo = parseDateParam(initialEndDate);

  const [currency, setCurrency] = useState(initialCurrency);
  const [commissionType, setCommissionType] = useState(initialCommissionType);
  const [sort, setSort] = useState(initialSort);
  const [search, setSearch] = useState(initialQ);
  const [debouncedSearch, setDebouncedSearch] = useState(initialQ);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    initialFrom && initialTo ? { from: initialFrom, to: initialTo } : undefined,
  );
  const [page, setPage] = useState<number>(initialPage);
  const [perPage] = useState<number>(initialPerPage);
  const dateRangeFromTime = dateRange?.from?.getTime();
  const dateRangeToTime = dateRange?.to?.getTime();

  useEffect(() => {
    const params = new URLSearchParams(Array.from(searchParams ?? []));
    if (currency && currency !== "all") params.set("currency", currency);
    else params.delete("currency");
    if (commissionType && commissionType !== "all")
      params.set("commissionType", commissionType);
    else params.delete("commissionType");
    if (sort && sort !== "newest") params.set("sort", sort);
    else params.delete("sort");
    if (debouncedSearch && debouncedSearch.trim() !== "")
      params.set("q", debouncedSearch.trim());
    else params.delete("q");
    if (dateRange?.from && dateRange?.to) {
      params.set("startDate", formatDateParam(dateRange.from));
      params.set("endDate", formatDateParam(dateRange.to));
    } else {
      params.delete("startDate");
      params.delete("endDate");
    }
    if (page && page > 1) params.set("page", String(page));
    else params.delete("page");
    if (perPage && perPage !== 10) params.set("perPage", String(perPage));
    else params.delete("perPage");

    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currency,
    commissionType,
    sort,
    debouncedSearch,
    dateRangeFromTime,
    dateRangeToTime,
    page,
    perPage,
  ]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    currency,
    commissionType,
    dateRangeFromTime,
    dateRangeToTime,
  ]);

  const hasDateRange = Boolean(dateRange?.from && dateRange?.to);
  const { commissions, total, isLoading, isError, error } = useCommissions({
    currency: currency === "all" ? undefined : currency,
    commissionType: commissionType === "all" ? undefined : commissionType,
    sort,
    search: debouncedSearch,
    createdFrom: hasDateRange
      ? dayjs(dateRange?.from).utc().startOf("day").toISOString()
      : undefined,
    createdTo: hasDateRange
      ? dayjs(dateRange?.to).utc().startOf("day").add(1, "day").toISOString()
      : undefined,
    page,
    perPage,
  });

  const adminColCount = 7;
  const advertiserColCount = 5;
  const colCount = isAdmin ? adminColCount : advertiserColCount;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Commissions</h2>
          <p className="text-sm text-muted-foreground">
            View all commission earnings from affiliate referrals.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isTabletScreen && (
            <CommissionsFilters
              currency={currency}
              setCurrency={(v) => setCurrency(v)}
              commissionType={commissionType}
              setCommissionType={(v) => setCommissionType(v)}
              sort={sort}
              setSort={(v) => setSort(v)}
              dateRange={dateRange}
              setDateRange={(v) => setDateRange(v)}
            />
          )}
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search client code, name, or email..."
              className="pl-8"
            />
          </div>
          {!isTabletScreen && (
            <CommissionsFilters
              currency={currency}
              setCurrency={(v) => setCurrency(v)}
              commissionType={commissionType}
              setCommissionType={(v) => setCommissionType(v)}
              sort={sort}
              setSort={(v) => setSort(v)}
              dateRange={dateRange}
              setDateRange={(v) => setDateRange(v)}
            />
          )}
        </div>
      </div>

      {isTabletScreen ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead>Advertiser</TableHead>
                {isAdmin && (
                  <>
                    <TableHead>Affiliate</TableHead>
                  </>
                )}
                <TableHead>Commission</TableHead>

                <TableHead>Commission Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                {isAdmin ? <TableHead className="text-right">Action</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <TableRow key={idx} className="animate-pulse">
                    {Array.from({ length: colCount }).map((__, cellIdx) => (
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
                      <p className="font-medium">Failed to load commissions.</p>
                      <p className="mt-2 text-sm">
                        {(error as Error)?.message ?? String(error)}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : commissions.length ? (
                commissions.map((commission: Commission) => (
                  <CommissionRow
                    key={commission.id}
                    commission={commission}
                    isAdmin={!!isAdmin}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={colCount}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No commissions found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="h-28 rounded-md bg-muted animate-pulse"
              />
            ))
          ) : isError ? (
            <div className="text-center text-destructive py-8">
              <p className="font-medium">Failed to load commissions.</p>
              <p className="mt-2 text-sm">
                {(error as Error)?.message ?? String(error)}
              </p>
            </div>
          ) : commissions.length ? (
            commissions.map((commission: Commission) => (
              <CommissionCard
                key={commission.id}
                commission={commission}
                isAdmin={!!isAdmin}
              />
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No commissions found.
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
