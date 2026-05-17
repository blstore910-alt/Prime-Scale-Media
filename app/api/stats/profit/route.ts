import { apiRequireAdmin } from "@/lib/auth/api-require-admin";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

type CurrencyKey = "usd" | "eur";
type BucketMode = "hour" | "day" | "week" | "month";

type FeeRow = {
  created_at: string;
  currency: string | null;
  fee_amount: number | string | null;
};

type InvoiceRow = {
  created_at: string;
  currency: string | null;
  total: number | string | null;
};

type CommissionRow = {
  created_at: string;
  currency: string | null;
  amount: number | string | null;
};

type ExchangeRateRow = {
  eur: number | string | null;
};

type ProfitContributionRow = {
  created_at: string;
  currency: string | null;
  amount: number | string | null;
  direction: 1 | -1;
};

type ProfitSeriesPoint = {
  bucket_start: string;
  bucket_end: string;
  label: string;
  profit: number;
  count: number;
};

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCurrency(rawCurrency: string | null): CurrencyKey | null {
  const currency = (rawCurrency || "").trim().toLowerCase();

  if (currency === "usd") {
    return "usd";
  }

  if (currency === "eur") {
    return "eur";
  }

  return null;
}

function convertToEur(
  amount: number,
  rawCurrency: string | null,
  usdToEurRate: number,
): number {
  const currency = normalizeCurrency(rawCurrency);

  if (currency === "eur") {
    return amount;
  }

  if (currency === "usd") {
    return amount * usdToEurRate;
  }

  return 0;
}

function resolveRange(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const fallbackPeriod = searchParams.get("period");

  const now = dayjs().utc();
  const start = fromParam ? dayjs(fromParam).utc() : null;
  const end = toParam ? dayjs(toParam).utc() : null;

  if (start && end && start.isValid() && end.isValid() && end.isAfter(start)) {
    return { start, end };
  }

  if (fallbackPeriod === "year") {
    const rangeStart = now.startOf("year");
    return { start: rangeStart, end: rangeStart.add(1, "year") };
  }

  if (fallbackPeriod === "month") {
    const rangeStart = now.startOf("month");
    return { start: rangeStart, end: rangeStart.add(1, "month") };
  }

  if (fallbackPeriod === "week") {
    const rangeStart = now.startOf("week");
    return { start: rangeStart, end: rangeStart.add(1, "week") };
  }

  const rangeStart = now.startOf("day");
  return { start: rangeStart, end: rangeStart.add(1, "day") };
}

function resolveBucketMode(start: dayjs.Dayjs, end: dayjs.Dayjs): BucketMode {
  const durationHours = end.diff(start, "hour", true);
  const durationDays = end.diff(start, "day", true);

  if (durationHours <= 30) {
    return "hour";
  }

  if (durationDays <= 14) {
    return "day";
  }

  if (durationDays <= 120) {
    return "week";
  }

  return "month";
}

function getBucketIndex(
  createdAt: dayjs.Dayjs,
  periodStart: dayjs.Dayjs,
  mode: BucketMode,
) {
  if (mode === "hour") {
    return createdAt.diff(periodStart, "hour");
  }

  if (mode === "day") {
    return createdAt.diff(periodStart, "day");
  }

  if (mode === "week") {
    return Math.floor(createdAt.diff(periodStart, "day") / 7);
  }

  return createdAt.diff(periodStart, "month");
}

function buildSeries(
  rows: ProfitContributionRow[],
  periodStartIso: string,
  periodEndIso: string,
  mode: BucketMode,
  usdToEurRate: number,
) {
  const periodStart = dayjs(periodStartIso);
  const periodEnd = dayjs(periodEndIso);
  const series: ProfitSeriesPoint[] = [];

  let cursor = periodStart;

  while (cursor.isBefore(periodEnd)) {
    const nextCursor =
      mode === "hour"
        ? cursor.add(1, "hour")
        : mode === "day"
          ? cursor.add(1, "day")
          : mode === "week"
            ? cursor.add(7, "day")
            : cursor.add(1, "month");
    const bucketEnd = nextCursor.isAfter(periodEnd) ? periodEnd : nextCursor;

    series.push({
      bucket_start: cursor.toISOString(),
      bucket_end: bucketEnd.toISOString(),
      label:
        mode === "hour"
          ? cursor.format("HH:00")
          : mode === "day"
            ? cursor.format("DD MMM")
            : mode === "week"
              ? cursor.format("DD MMM")
              : cursor.format("MMM YYYY"),
      profit: 0,
      count: 0,
    });

    cursor = bucketEnd;
  }

  for (const row of rows) {
    const createdAt = dayjs(row.created_at);
    const amount = toNumber(row.amount);

    if (
      !createdAt.isValid() ||
      createdAt.isBefore(periodStart) ||
      !createdAt.isBefore(periodEnd) ||
      amount <= 0 ||
      !normalizeCurrency(row.currency)
    ) {
      continue;
    }

    const bucketIndex = getBucketIndex(createdAt, periodStart, mode);

    if (bucketIndex < 0 || bucketIndex >= series.length) {
      continue;
    }

    const point = series[bucketIndex];
    point.count += 1;
    point.profit += row.direction * convertToEur(amount, row.currency, usdToEurRate);
  }

  return series
    .filter((point) => point.count > 0)
    .map((point) => ({
      ...point,
      profit: Number(point.profit.toFixed(2)),
    }));
}

export async function GET(request: NextRequest) {
  const { profile, error: authError } = await apiRequireAdmin();
  if (authError) return authError;

  const supabase = await createClient();
  const { start, end } = resolveRange(request);

  const periodStart = start.toISOString();
  const periodEnd = end.toISOString();
  const granularity = resolveBucketMode(start, end);

  const [
    feesResult,
    subscriptionInvoicesResult,
    manualInvoicesResult,
    referralCommissionsResult,
    exchangeRateResult,
  ] = await Promise.all([
    supabase
      .from("top_ups")
      .select("created_at, currency, fee_amount")
      .eq("tenant_id", profile.tenant_id)
      .eq("status", "completed")
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd),
    supabase
      .from("invoices")
      .select("created_at, currency, total")
      .eq("tenant_id", profile.tenant_id)
      .eq("type", "subscription")
      .eq("status", "paid")
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd),
    supabase
      .from("invoices")
      .select("created_at, currency, total")
      .eq("tenant_id", profile.tenant_id)
      .eq("type", "manual_invoice")
      .eq("status", "paid")
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd),
    supabase
      .from("referral_commissions")
      .select("created_at, currency, amount")
      .eq("tenant_id", profile.tenant_id)
      .eq("status", "paid")
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd),
    supabase
      .from("exchange_rates")
      .select("eur")
      .eq("tenant_id", profile.tenant_id)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  const errors = [
    feesResult.error,
    subscriptionInvoicesResult.error,
    manualInvoicesResult.error,
    referralCommissionsResult.error,
    exchangeRateResult.error,
  ].filter(Boolean);

  const activeExchangeRate = exchangeRateResult.data as ExchangeRateRow | null;
  const usdToEurRate = toNumber(activeExchangeRate?.eur);

  if (errors.length > 0 || !activeExchangeRate || usdToEurRate <= 0) {
    return NextResponse.json(
      { error: "Failed to load profit stats." },
      { status: 500 },
    );
  }

  const fees = (feesResult.data || []) as FeeRow[];
  const subscriptionInvoices = (subscriptionInvoicesResult.data ||
    []) as InvoiceRow[];
  const manualInvoices = (manualInvoicesResult.data || []) as InvoiceRow[];
  const referralCommissions = (referralCommissionsResult.data ||
    []) as CommissionRow[];

  const rows: ProfitContributionRow[] = [
    ...fees.map((row) => ({
      created_at: row.created_at,
      currency: row.currency,
      amount: row.fee_amount,
      direction: 1 as const,
    })),
    ...subscriptionInvoices.map((row) => ({
      created_at: row.created_at,
      currency: row.currency,
      amount: row.total,
      direction: 1 as const,
    })),
    ...manualInvoices.map((row) => ({
      created_at: row.created_at,
      currency: row.currency,
      amount: row.total,
      direction: 1 as const,
    })),
    ...referralCommissions.map((row) => ({
      created_at: row.created_at,
      currency: row.currency,
      amount: row.amount,
      direction: -1 as const,
    })),
  ];

  const series = buildSeries(
    rows,
    periodStart,
    periodEnd,
    granularity,
    usdToEurRate,
  );
  const totals = rows.reduce(
    (acc, row) => {
      const amount = toNumber(row.amount);

      if (amount <= 0 || !normalizeCurrency(row.currency)) {
        return acc;
      }

      acc.count += 1;
      acc.profit +=
        row.direction * convertToEur(amount, row.currency, usdToEurRate);
      return acc;
    },
    { profit: 0, count: 0 },
  );

  return NextResponse.json({
    range: {
      from: periodStart,
      to: periodEnd,
    },
    granularity,
    totals: {
      profit: Number(totals.profit.toFixed(2)),
      count: totals.count,
    },
    series,
  });
}
