import { apiRequireAdmin } from "@/lib/auth/api-require-admin";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { pageAllRowsTolerant } from "@/lib/page-all-rows";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

type CurrencyKey = "usd" | "eur";
type BucketMode = "hour" | "day" | "week" | "month";

type TopupRow = {
  created_at: string;
  /** When an admin verified it. Absent on the created_at fallback read. */
  verified_at?: string | null;
  currency: string | null;
  topup_amount: number | string | null;
};

type TopupSeriesPoint = {
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
  rows: TopupRow[],
  periodStartIso: string,
  periodEndIso: string,
  mode: BucketMode,
  // 1 USD in EUR. Needed INSIDE the loop, because the amount column is
  // USD and the EUR bucket is drawn as euros.
  usdToEurRate: number
) {
  const periodStart = dayjs(periodStartIso);
  const periodEnd = dayjs(periodEndIso);
  const series: TopupSeriesPoint[] = [];

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
    const amount = toNumber(row.topup_amount);
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
  const { profile, error: authError } = await apiRequireAdmin();
  if (authError) return authError;

  const supabase = await createClient();
  const { start, end } = resolveRange(request);

  const periodStart = start.toISOString();
  const periodEnd = end.toISOString();
  const granularity = resolveBucketMode(start, end);

// ── THE AMOUNT COLUMNS ON top_ups ARE ALWAYS USD ──────────────────────
// topup_amount, amount_usd and fee_amount are dollars whatever
// top_ups.currency says; `currency` is what the CUSTOMER PAID IN. So a
// €1,000 top-up at 5% stores topup_amount = 1104.65 USD, and adding that
// straight into a bucket rendered under a € sign overstates it by the
// whole exchange rate — 16.3% at 0.86. This is the same bug that was
// found and fixed in app/api/stats/route.ts; these two routes kept their
// copy of it and never read a rate at all.
//
// Fall back to 1 so an unconfigured tenant renders its own figures
// unconverted rather than a 500 — the same choice stats/route.ts makes.
  const { data: rateRow, error: rateError } = await supabase
    .from("exchange_rates")
    .select("eur")
    .eq("tenant_id", profile.tenant_id)
    .eq("is_active", true)
    .maybeSingle();
  // A RATE WE COULD NOT READ IS NOT A RATE OF 1.
  //
  // topup_amount is always USD, so at a rate of 1 the EUR bucket becomes
  // raw dollars printed under a euro sign — overstated by the whole
  // exchange rate, about 16% at 0.86. A brand-new tenant with NO rate row
  // is a different thing entirely and still falls back to 1, because
  // there is nothing to convert yet; an unreadable one is an error.
  if (rateError) {
    return NextResponse.json(
      { error: "Failed to load the exchange rate." },
      { status: 500 },
    );
  }
  const rawRate = toNumber((rateRow as { eur?: unknown } | null)?.eur);
  // ── NO ACTIVE RATE IS NOT A RATE OF 1 ─────────────────────────────
  //
  // Falling back to 1 was justified as "a brand-new tenant has no rate
  // row yet". But upsertExchangeRate stands the current row DOWN first,
  // in a separate statement, and its own comment says a failed second
  // write "leaves the tenant with NO active row" — so no-row is also the
  // transient, and potentially stuck, state of a live tenant. During it
  // the USD columns (topup_amount, fee_amount, amount_usd are always
  // dollars) print unconverted under a euro sign: at 0.86 that overstates
  // EUR volume, fee revenue and profit by about 16%, silently, on the
  // owner's own dashboard.
  //
  // A tenant that genuinely has no rate has no non-USD money to convert
  // either, so refusing costs them nothing and tells them what to fix.
  if (!(rawRate > 0)) {
    return NextResponse.json(
      {
        error:
          "There is no active exchange rate, so top-up figures cannot be converted. Set the rate in Settings -> Finance.",
      },
      { status: 409 },
    );
  }
  const usdToEurRate = rawRate;
  // AN ERROR IS NOT AN EMPTY PERIOD.
  //
  // This discarded `error`, so an RLS refusal or a dropped read became
  // `data = null` -> `[]` -> a total of zero, returned with a 200. The
  // batch endpoint only checks `res.ok`, so the dataset reports
  // isError:false and the card's own "failed to load" branch is never
  // reached: the dashboard prints a confident zero for a period nobody
  // could read. On a financial dashboard that is not a degraded
  // experience, it is a wrong answer.

  // PAGED, like the summary route. PostgREST stops at 1,000 rows and this
  // one feeds the admin dashboard's top-ups card, so past the thousandth
  // completed top-up in the selected period the figure was quietly short
  // with nothing to say so.
  //
  // The (created_at, id) order matters: a bulk top-up inserts up to 200
  // rows sharing one now(), and Postgres gives no stable order among
  // ties — without the tiebreaker a row on a page boundary can be counted
  // twice or skipped.
  const paged = await pageAllRowsTolerant<TopupRow>(
    (from, to) =>
    supabase
      .from("top_ups")
      .select("created_at, verified_at, currency, topup_amount")
      .eq("tenant_id", profile.tenant_id)
      // ── DATED BY WHEN THE MONEY ARRIVED ──────────────────────────
      // This gates on status = completed and then dated the row by
      // when the CUSTOMER filed it. A top-up filed on the 30th and
      // verified on the 2nd counted in the wrong month, and last
      // month's card grew days after the owner had read it. The
      // fallback read below keeps created_at, so a database without
      // verified_at still answers instead of throwing.
      .or(
        `and(verified_at.gte.${periodStart},verified_at.lt.${periodEnd}),` +
          `and(verified_at.is.null,created_at.gte.${periodStart},created_at.lt.${periodEnd})`,
      )
      .eq("status", "completed")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      // A DELETED TOP-UP IS NOT REVENUE. `is_deleted` is the only way
      // to strike out a COMPLETED top-up — updateTopupAsAdmin refuses
      // completed -> anything and the reject RPC applies to pending rows
      // only — and it was honoured in one reader out of thirteen. So a
      // struck-out EUR 10,000 top-up went on contributing its fee and
      // its dollars to every figure on this dashboard, and to the
      // customer's own statement of account.
      //
      // `.not(x, "is", true)` and not `.neq(x, true)`: neq on a nullable
      // column drops the NULL rows, which is nearly all of them.
      .not("is_deleted", "is", true)
      .range(from, to),
    // Fallback: the same read without the filter, for a
    // database where that column has not been added yet.
    (from, to) =>
    supabase
      .from("top_ups")
      .select("created_at, currency, topup_amount")
      .eq("tenant_id", profile.tenant_id)
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd)
      .eq("status", "completed")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  
  );
  if (paged.error) {
    return NextResponse.json(
      { error: "Failed to load top-up stats." },
      { status: 500 },
    );
  }

  // Re-date each row to when it was verified; everything downstream
  // reads `created_at`. The fallback read has no verified_at, so those
  // rows keep the date they already had.
  const rows = paged.rows.map((row) => ({
    ...row,
    created_at: row.verified_at ?? row.created_at,
  }));
  const series = buildSeries(rows, periodStart, periodEnd, granularity, usdToEurRate);

  const totals = rows.reduce(
    (acc, row) => {
      const amount = toNumber(row.topup_amount);
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
