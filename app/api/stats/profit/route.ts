import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

type BucketMode = "hour" | "day" | "week" | "month";

type ProfitTopupRow = {
  created_at: string;
  type: string | null;
  fee_amount: number | string | null;
  amount_usd: number | string | null;
  account?: { platform?: string | null } | null;
  commissions?: Array<{ commission_amount: number | string | null }> | null;
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

function getProfitContribution(topup: ProfitTopupRow) {
  const topupType = topup.type || "";
  const feeAmount = toNumber(topup.fee_amount);
  const amountUsd = toNumber(topup.amount_usd);
  const accountPlatform = topup.account?.platform || "";
  const affiliateCommission =
    topup.commissions?.reduce((acc, commission) => {
      return acc + toNumber(commission.commission_amount);
    }, 0) || 0;

  const topupFeeContribution =
    topupType === "top-up" || topupType === "first-top-up"
      ? feeAmount * 0.9
      : 0;
  const subscriptionsAndAccountsContribution =
    topupType === "subscriptions" ||
    topupType === "subscription" ||
    topupType === "extra-ad-account"
      ? amountUsd * 0.9
      : 0;
  const euMetaPremiumFeeContribution =
    accountPlatform === "eu-meta-premium" ? amountUsd * 0.02 : 0;

  return (
    topupFeeContribution +
    subscriptionsAndAccountsContribution -
    affiliateCommission -
    euMetaPremiumFeeContribution
  );
}

function buildSeries(
  rows: ProfitTopupRow[],
  periodStartIso: string,
  periodEndIso: string,
  mode: BucketMode,
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
    if (
      !createdAt.isValid() ||
      createdAt.isBefore(periodStart) ||
      !createdAt.isBefore(periodEnd)
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
    point.profit += getProfitContribution(row);
  }

  return series
    .filter((point) => point.count > 0)
    .map((point) => ({
      ...point,
      profit: Number(point.profit.toFixed(2)),
    }));
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { start, end } = resolveRange(request);

  const periodStart = start.toISOString();
  const periodEnd = end.toISOString();
  const granularity = resolveBucketMode(start, end);

  const { data } = await supabase
    .from("top_ups")
    .select(
      "created_at, type, fee_amount, amount_usd, account:ad_accounts(platform), affiliate_commissions(commission_amount)",
    )
    .gte("created_at", periodStart)
    .lt("created_at", periodEnd)
    .eq("status", "completed");

  const rows = (data || []) as ProfitTopupRow[];
  const series = buildSeries(rows, periodStart, periodEnd, granularity);
  const totalProfit = rows.reduce((acc, topup) => {
    return acc + getProfitContribution(topup);
  }, 0);

  return NextResponse.json({
    range: {
      from: periodStart,
      to: periodEnd,
    },
    granularity,
    totals: {
      profit: Number(totalProfit.toFixed(2)),
      count: rows.length,
    },
    series,
  });
}
