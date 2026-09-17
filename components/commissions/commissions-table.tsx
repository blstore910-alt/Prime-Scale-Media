"use client";

import TablePagination from "@/components/ui/table-pagination";
import { useAppContext } from "@/context/app-provider";
import { COMMISSION_TYPE_LABELS, CURRENCY_SYMBOLS } from "@/lib/constants";
import { Commission } from "@/lib/types/commission";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { Loader2, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DateRange } from "react-day-picker";
import CommissionStatusAction from "./commission-status-action";
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

const formatAmount = (value: number | string | null | undefined) => {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const loadingRow = (colSpan: number) => (
  <tr>
    <td colSpan={colSpan} style={{ textAlign: "center", padding: 28 }}>
      <Loader2 className="animate-spin" style={{ display: "inline" }} />
    </td>
  </tr>
);

const stateRow = (colSpan: number, msg: string, danger = false) => (
  <tr>
    <td
      colSpan={colSpan}
      style={{
        textAlign: "center",
        padding: 28,
        color: danger ? "var(--danger)" : "var(--txt-2)",
      }}
    >
      {msg}
    </td>
  </tr>
);

// Super-admin Referral Commissions ledger, ported to the PSM mockup look.
// Reuses the real useCommissions data hook, the URL-synced filters
// (currency / type / sort / date range / search), pagination and the
// CommissionStatusAction confirm dialog — presentation only, no new
// mutations or dropped columns/filters.
export default function CommissionsTable() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useAppContext();
  const isAdmin = profile?.role === "admin";

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

  const colCount = isAdmin ? 7 : 5;

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="phead">
        <div>
          <h1>Commissions</h1>
          <p>View all commission earnings from affiliate referrals.</p>
        </div>
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client code, name, or email…"
          />
        </label>
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
      </div>

      <div className="card" style={{ padding: "16px 8px 8px" }}>
        <div className="tblwrap">
          <table className="tbl wide">
            <thead>
              <tr>
                <th style={{ paddingLeft: 14 }}>Advertiser</th>
                {isAdmin && <th>Affiliate</th>}
                <th className="r">Commission</th>
                <th>Commission Type</th>
                <th>Status</th>
                <th className="r">Date</th>
                {isAdmin && <th className="r">Action</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? loadingRow(colCount)
                : isError
                  ? stateRow(
                      colCount,
                      (error as Error)?.message ??
                        "Failed to load commissions.",
                      true,
                    )
                  : commissions.length
                    ? commissions.map((commission: Commission) => {
                        const currencySymbol =
                          CURRENCY_SYMBOLS[
                            commission.currency as keyof typeof CURRENCY_SYMBOLS
                          ] ?? "$";
                        const paid =
                          (commission.status ?? "").toLowerCase() === "paid";
                        return (
                          <tr key={commission.id}>
                            <td data-label="Advertiser">
                              <div style={{ fontWeight: 700 }}>
                                {commission.referred_advertiser_name || "—"}
                              </div>
                              <div
                                className="muted mono"
                                style={{ fontSize: ".78rem" }}
                              >
                                {commission.referred_advertiser_tenant_client_code ||
                                  "—"}
                              </div>
                            </td>
                            {isAdmin && (
                              <td data-label="Affiliate">
                                <div style={{ fontWeight: 600 }}>
                                  {commission.affiliate_advertiser_name || "—"}
                                </div>
                                <div
                                  className="muted mono"
                                  style={{ fontSize: ".78rem" }}
                                >
                                  {commission.affiliate_advertiser_tenant_client_code ||
                                    "—"}
                                </div>
                              </td>
                            )}
                            <td
                              data-label="Commission"
                              className="r mono"
                              style={{ fontWeight: 700, color: "#0e8f66" }}
                            >
                              {currencySymbol}
                              {formatAmount(commission.amount)}
                            </td>
                            <td data-label="Commission Type">
                              <span
                                className="badge info"
                                style={{ textTransform: "capitalize" }}
                              >
                                {COMMISSION_TYPE_LABELS[commission.type] ??
                                  commission.type}
                              </span>
                            </td>
                            <td data-label="Status">
                              <span
                                className={`badge ${paid ? "ok" : "pend"}`}
                                style={{ textTransform: "capitalize" }}
                              >
                                {commission.status || "—"}
                              </span>
                            </td>
                            <td data-label="Date" className="r muted">
                              {formatDate(commission.created_at)}
                            </td>
                            {isAdmin && (
                              <td data-label="Action" className="r">
                                <CommissionStatusAction
                                  commissionId={commission.id}
                                  status={commission.status}
                                />
                              </td>
                            )}
                          </tr>
                        );
                      })
                    : stateRow(colCount, "No commissions found.")}
            </tbody>
          </table>
        </div>
        <div style={{ padding: 12 }}>
          <TablePagination
            total={total}
            page={page}
            perPage={perPage}
            onPageChange={(p) => setPage(p)}
          />
        </div>
      </div>
    </div>
  );
}
