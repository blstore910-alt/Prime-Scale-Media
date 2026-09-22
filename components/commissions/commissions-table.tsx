"use client";

import TablePagination from "@/components/ui/table-pagination";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAppContext } from "@/context/app-provider";
import { COMMISSION_TYPE_LABELS, CURRENCY_SYMBOLS } from "@/lib/constants";
import { Commission } from "@/lib/types/commission";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { Loader2, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DateRange } from "react-day-picker";
import CommissionsFilters from "./commissions-filters";
import useCommissions from "./use-commissions";
import { emptyRow } from "@/components/ui/empty-row";

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

  // Total clawed back in this tenant, per currency. Read here because
  // referral_clawbacks had no reader anywhere in the app -- see the
  // banner below for what that cost.
  const clawbackQuery = useQuery<{ eur: number; usd: number } | null>({
    queryKey: ["referral-clawback-totals", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("referral_clawbacks")
        .select("amount, currency")
        .eq("tenant_id", profile!.tenant_id);
      if (error) {
        // The table arrived in a migration that is pasted by hand, so a
        // missing relation is "not on this database yet" and stays
        // quiet. Anything else is a failed read and must say so.
        const code = (error as { code?: string }).code ?? "";
        if (code === "42P01" || code === "42703") return null;
        throw error;
      }
      let eur = 0;
      let usd = 0;
      for (const r of data ?? []) {
        const row = r as { amount?: unknown; currency?: unknown };
        const n = Number(row.amount) || 0;
        if (String(row.currency ?? "EUR").toUpperCase() === "USD") usd += n;
        else eur += n;
      }
      return { eur, usd };
    },
  });
  const clawbacks = (() => {
    const d = clawbackQuery.data;
    const total = (d?.eur ?? 0) + (d?.usd ?? 0);
    const parts: string[] = [];
    if (d?.eur) parts.push(formatCurrency(d.eur, "EUR"));
    if (d?.usd) parts.push(formatCurrency(d.usd, "USD"));
    return {
      total,
      label: parts.join(" and "),
      unknown: clawbackQuery.isError,
    };
  })();
  const isAdmin = profile?.role === "admin";

  const initialCurrency = searchParams?.get("currency") ?? "all";
  const initialCommissionType = searchParams?.get("commissionType") ?? "all";
  const initialSort = searchParams?.get("sort") ?? "newest";
  const initialQ = searchParams?.get("q") ?? "";
  const initialStartDate = searchParams?.get("startDate");
  const initialEndDate = searchParams?.get("endDate");
  const initialPage = parseInt(searchParams?.get("page") ?? "1", 10) || 1;
  // ── CLAMPED ──────────────────────────────────────────────────────
  //
  // ?perPage=5000 asks PostgREST for .range(0,4999) and gets its 1,000
  // -- while Math.ceil(total / 5000) is 1, so TablePagination returns
  // null and the screen shows a thousand rows with NO pager, no row
  // count and no notice. Somebody works the list to the bottom and
  // reports the ledger settled with two thousand rows untouched.
  const initialPerPage = Math.min(
    100,
    Math.max(5, parseInt(searchParams?.get("perPage") ?? "10", 10) || 10),
  );
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
    // ── A CALENDAR DATE IS NOT AN INSTANT ──────────────────────────
    //
    // `dayjs(picked).utc().startOf("day")` converts the local midnight
    // to UTC FIRST and then truncates — so in any UTC+ zone it lands on
    // the previous day. Picking 15 Sep in a CEST browser produced
    // from = 14 Sep 00:00Z, to = 15 Sep 00:00Z: the whole of the 14th,
    // and none of the 15th. A commission created on the 15th at 10:00
    // UTC was excluded and one from the 14th was included, so the owner
    // reconciling a payout read "nothing earned on the 15th".
    //
    // Take the Y-M-D the person actually picked and build the UTC
    // instant from those digits.
    createdFrom: hasDateRange
      ? dayjs.utc(dayjs(dateRange?.from).format("YYYY-MM-DD")).toISOString()
      : undefined,
    createdTo: hasDateRange
      ? dayjs
          .utc(dayjs(dateRange?.to).format("YYYY-MM-DD"))
          .add(1, "day")
          .toISOString()
      : undefined,
    page,
    perPage,
  });

  // One fewer for the admin since the per-row Mark Paid column went.
  const colCount = isAdmin ? 6 : 5;

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="phead">
        <div>
          <h1>Commissions</h1>
          <p>Earnings from referrals.</p>
        </div>
      </div>

      {/* ── WHAT HAS ALREADY BEEN TAKEN BACK ──────────────────────────
          A clawback writes referral_clawbacks and decrements
          referral_links.earnings_*. It never touches a
          referral_commissions row -- deliberately -- and
          referral_clawbacks had ZERO reads anywhere in this app.

          So: affiliate on 10%, customer funds EUR 10,000, ten EUR 100
          rows accrue. The customer takes an approved EUR 4,000 refund
          and EUR 400 is clawed back. This screen still lists ten green
          EUR 100 rows, each with a live Mark Paid. The owner pays
          EUR 1,000 against a EUR 600 liability -- and paid -> unpaid is
          refused, so it cannot be unwound here.

          The rows are not netted, because a clawback is not tied to any
          one of them. The figure is stated instead, above the button. */}
      {clawbacks.total > 0 ? (
        <div className="card" style={{ padding: "12px 14px", marginTop: 10 }}>
          <span style={{ fontWeight: 600, color: "var(--warn)" }}>
            {clawbacks.label} has been clawed back and is NOT reflected in
            the rows below.
          </span>
          <div
            className="muted"
            style={{ fontSize: ".86rem", marginTop: 4 }}
          >
            A clawback reduces what an affiliate is owed without changing
            any commission row. Take it off the unpaid rows below before
            you pay. (The Earnings column on /affiliates is a lifetime
            total — it does not go down when you pay, so it is not what
            is owed.)
          </div>
        </div>
      ) : clawbacks.unknown ? (
        <div className="card" style={{ padding: "12px 14px", marginTop: 10 }}>
          <span className="muted">
            We couldn&apos;t check for clawbacks, so these rows may
            overstate what is owed. That is not the same as there being
            none.
          </span>
        </div>
      ) : null}

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search commissions…"
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

      <div className="card" style={{ padding: 0 }}>
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
                          </tr>
                        );
                      })
                    : emptyRow(colCount, {
                        noun: "commissions",
                        search: debouncedSearch,
                        // Compared against NO FILTER, not against the
                        // value the URL arrived with. Landing on
                        // ?currency=EUR would otherwise count as unfiltered
                        // — which is the exact blindness this replaces.
                        filtered:
                          currency !== "all" ||
                          commissionType !== "all" ||
                          !!dateRange?.from,
                        onClear: () => {
                          setSearch("");
                          setCurrency("all");
                          setCommissionType("all");
                          setDateRange(undefined);
                        },
                      })}
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
