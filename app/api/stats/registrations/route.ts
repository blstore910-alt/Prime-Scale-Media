import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

type BucketMode = "hour" | "day" | "week" | "month";

type RegistrationRow = {
  created_at: string;
};

type RegistrationSeriesPoint = {
  bucket_start: string;
  bucket_end: string;
  label: string;
  advertisers_count: number;
  affiliates_count: number;
  count: number;
};

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
  advertisers: RegistrationRow[],
  affiliates: RegistrationRow[],
  periodStartIso: string,
  periodEndIso: string,
  mode: BucketMode
) {
  const periodStart = dayjs(periodStartIso);
  const periodEnd = dayjs(periodEndIso);
  const series: RegistrationSeriesPoint[] = [];

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
      advertisers_count: 0,
      affiliates_count: 0,
      count: 0,
    });

    cursor = bucketEnd;
  }

  const bucketIndexOf = (createdAtIso: string) => {
    const createdAt = dayjs(createdAtIso);
    if (
      !createdAt.isValid() ||
      createdAt.isBefore(periodStart) ||
      !createdAt.isBefore(periodEnd)
    ) {
      return -1;
    }

    return mode === "hour"
      ? createdAt.diff(periodStart, "hour")
      : mode === "day"
        ? createdAt.diff(periodStart, "day")
        : mode === "week"
          ? Math.floor(createdAt.diff(periodStart, "day") / 7)
          : createdAt.diff(periodStart, "month");
  };

  for (const advertiser of advertisers) {
    const index = bucketIndexOf(advertiser.created_at);
    if (index < 0 || index >= series.length) {
      continue;
    }
    series[index].advertisers_count += 1;
    series[index].count += 1;
  }

  for (const affiliate of affiliates) {
    const index = bucketIndexOf(affiliate.created_at);
    if (index < 0 || index >= series.length) {
      continue;
    }
    series[index].affiliates_count += 1;
    series[index].count += 1;
  }

  return series.filter((point) => point.count > 0);
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { start, end } = resolveRange(request);

  const periodStart = start.toISOString();
  const periodEnd = end.toISOString();
  const granularity = resolveBucketMode(start, end);

  const [advertisersResult, affiliatesResult] = await Promise.all([
    supabase
      .from("advertisers")
      .select("created_at")
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd),
    supabase
      .from("affiliates")
      .select("created_at")
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd),
  ]);

  const advertisers = (advertisersResult.data || []) as RegistrationRow[];
  const affiliates = (affiliatesResult.data || []) as RegistrationRow[];

  const series = buildSeries(
    advertisers,
    affiliates,
    periodStart,
    periodEnd,
    granularity
  );

  return NextResponse.json({
    range: {
      from: periodStart,
      to: periodEnd,
    },
    granularity,
    totals: {
      advertisers: advertisers.length,
      affiliates: affiliates.length,
    },
    series,
  });
}
