import { apiRequireOwner } from "@/lib/auth/api-require-admin";
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

type FeeSeriesPoint = {
  bucket_start: string;
  bucket_end: string;
  label: string;
  usd_amount: number;
  eur_amount: number;
  usd_count: number;
  eur_count: number;
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

function resolveRange(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const fallbackPeriod = searchParams.get("period");

  const now = dayjs().utc();
  const start = fromParam ? dayjs(fromParam).utc() : null;
  const end = toParam ? dayjs(toParam).utc() : null;

  if (
    start &&
    end &&
    start.isValid() &&
    end.isValid() &&
    end.isAfter(start)
  ) {
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

function buildSeries(
  rows: FeeRow[],
  periodStartIso: string,
  periodEndIso: string,
  mode: BucketMode,
  // 1 USD in EUR. Needed INSIDE the loop: the column is USD and the EUR
  // bucket is drawn as euros.
  usdToEurRate: number
) {
  const periodStart = dayjs(periodStartIso);
  const periodEnd = dayjs(periodEndIso);
  const series: FeeSeriesPoint[] = [];

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
      usd_amount: 0,
      eur_amount: 0,
      usd_count: 0,
      eur_count: 0,
      count: 0,
    });

    cursor = bucketEnd;
  }

  for (const row of rows) {
    const createdAt = dayjs(row.created_at);
    const amount = toNumber(row.fee_amount);
    const currency = normalizeCurrency(row.currency);

    if (
      !createdAt.isValid() ||
      createdAt.isBefore(periodStart) ||
      !createdAt.isBefore(periodEnd) ||
      amount <= 0 ||
      !currency
    ) {
      continue;
    }

    const bucketIndex =
      mode === "hour"
        ? createdAt.diff(periodStart, "hour")
        : mode === "day"
          ? createdAt.diff(periodStart, "day")
          : mode === "week"
            ? Math.floor(createdAt.diff(periodStart, "day") / 7)
            : createdAt.diff(periodStart, "month");

    if (bucketIndex < 0 || bucketIndex >= series.length) {
      continue;
    }

    const point = series[bucketIndex];
    point.count += 1;

    if (currency === "usd") {
      point.usd_amount += amount;
      point.usd_count += 1;
    } else {
      // Converted: the column is USD, the bucket is drawn as EUR.
      point.eur_amount += amount * usdToEurRate;
      point.eur_count += 1;
    }
  }

  return series
    .filter((point) => point.count > 0)
    .map((point) => ({
      ...point,
      usd_amount: Number(point.usd_amount.toFixed(2)),
      eur_amount: Number(point.eur_amount.toFixed(2)),
    }));
}

export async function GET(request: NextRequest) {
  // Owner only: these are OUR profit and margin figures, not the desk's.
  const { profile, error: authError } = await apiRequireOwner();
  if (authError) return authError;

  const supabase = await createClient();
  const { start, end } = resolveRange(request);

  const periodStart = start.toISOString();
  const periodEnd = end.toISOString();
  const granularity = resolveBucketMode(start, end);

// ── THE AMOUNT COLUMNS ON top_ups ARE ALWAYS USD ──────────────────
// fee_amount is dollars whatever top_ups.currency says; `currency` is what
// the CUSTOMER PAID IN. So a $58.14 fee on a EUR-paid top-up was reported
// as €58.14 when the true figure is €50.00 — our own margin overstated by
// the whole exchange rate, 16.3% at 0.86. Same bug as the one fixed in
// app/api/stats/route.ts; this route kept its copy and read no rate at all.
//
// Fall back to 1 so an unconfigured tenant renders unconverted figures
// rather than a 500 — the same choice stats/route.ts makes.
  const { data: rateRow } = await supabase
    .from("exchange_rates")
    .select("eur")
    .eq("tenant_id", profile.tenant_id)
    .eq("is_active", true)
    .maybeSingle();
  const rawRate = toNumber((rateRow as { eur?: unknown } | null)?.eur);
  const usdToEurRate = rawRate > 0 ? rawRate : 1;

  const { data } = await supabase
    .from("top_ups")
    .select("created_at, currency, fee_amount")
    .eq("tenant_id", profile.tenant_id)
    .gte("created_at", periodStart)
    .lt("created_at", periodEnd)
    .eq("status", "completed");

  const rows = (data || []) as FeeRow[];
  const series = buildSeries(rows, periodStart, periodEnd, granularity, usdToEurRate);

  const totals = rows.reduce(
    (acc, row) => {
      const amount = toNumber(row.fee_amount);
      const currency = normalizeCurrency(row.currency);

      if (amount <= 0 || !currency) {
        return acc;
      }

      acc.count += 1;
      acc[currency].amount +=
        currency === "eur" ? amount * usdToEurRate : amount;
      acc[currency].count += 1;
      return acc;
    },
    {
      count: 0,
      usd: { amount: 0, count: 0 },
      eur: { amount: 0, count: 0 },
    }
  );

  return NextResponse.json({
    range: {
      from: periodStart,
      to: periodEnd,
    },
    granularity,
    totals: {
      count: totals.count,
      usd: {
        amount: Number(totals.usd.amount.toFixed(2)),
        count: totals.usd.count,
      },
      eur: {
        amount: Number(totals.eur.amount.toFixed(2)),
        count: totals.eur.count,
      },
    },
    series,
  });
}
