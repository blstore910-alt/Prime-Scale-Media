import { apiRequireAdmin } from "@/lib/auth/api-require-admin";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { pageAllRowsTolerant } from "@/lib/page-all-rows";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

type CurrencyKey = "usd" | "eur";
type BucketMode = "hour" | "day" | "week" | "month";

type InvoiceRow = {
  created_at: string;
  /** When the money actually arrived. Null on rows older than the column. */
  paid_at?: string | null;
  currency: string | null;
  total: number | string | null;
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
  rows: InvoiceRow[],
  periodStartIso: string,
  periodEndIso: string,
  mode: BucketMode
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
    const amount = toNumber(row.total);
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
      point.eur_amount += amount;
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
  // AN ERROR IS NOT AN EMPTY PERIOD.
  //
  // This discarded `error`, so an RLS refusal or a dropped read became
  // `data = null` -> `[]` -> a total of zero, returned with a 200. The
  // batch endpoint only checks `res.ok`, so the dataset reports
  // isError:false and the card's own "failed to load" branch is never
  // reached: the dashboard prints a confident zero for a period nobody
  // could read. On a financial dashboard that is not a degraded
  // experience, it is a wrong answer.

  // ── EVERY ROW, NOT THE FIRST THOUSAND ─────────────────────────────
  //
  // PostgREST caps a response at 1,000 rows, so an unpaged sum is right
  // until the thousand-and-first row exists and silently a fraction of
  // the truth for ever after — no error, no warning, a smaller number.
  // There was no .order() either, so WHICH thousand came back was
  // unspecified and changed between refreshes. lib/page-all-rows.ts
  // exists for this and names two earlier incidents; two of the seven
  // stats routes got it and five did not.
  // A COLUMN THE LIVE TABLE MAY NOT HAVE. `invoices` is hand-authored
  // on production and created by no migration in this repo, so naming
  // paid_at in the select AND the filter would 500 this card for ever
  // if it is absent -- instead of leaving it on created_at, which is
  // what it did before. The top-up routes already page tolerantly; this
  // one did not.
  const paged = await pageAllRowsTolerant<InvoiceRow>(
    (from, to) =>
supabase
      .from("invoices")
      .select("created_at, paid_at, currency, total")
      .eq("tenant_id", profile.tenant_id)
      // an extra ad account is invoiced as ad_account_fee, not manual_invoice:
        // the total-profit tile was fixed for exactly this and the card
        // beside it never was, so 20 paid EUR 50 invoices read as zero.
        .in("type", ["ad_account_fee"])
      .eq("status", "paid")
      // Dated by when it was PAID, not when it was raised — see the
      // note above the reducer. paid_at is null on rows that predate
      // the column, and those keep their created_at.
      .or(
        `and(paid_at.gte."${periodStart}",paid_at.lt."${periodEnd}"),` +
          `and(paid_at.is.null,created_at.gte."${periodStart}",created_at.lt."${periodEnd}")`,
      )
      .order("created_at", { ascending: true })
      // A unique tiebreaker: rows created in the same transaction
      // share one now(), and Postgres gives no stable order among
      // ties — so a row on a page boundary could be counted twice
      // or skipped, and which it is changes between requests.
      .order("id", { ascending: true })
            .range(from, to),
    (from, to) =>
supabase
      .from("invoices")
      .select("created_at, currency, total")
      .eq("tenant_id", profile.tenant_id)
      // an extra ad account is invoiced as ad_account_fee, not manual_invoice:
        // the total-profit tile was fixed for exactly this and the card
        // beside it never was, so 20 paid EUR 50 invoices read as zero.
        .in("type", ["ad_account_fee"])
      .eq("status", "paid")
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd)
      .order("created_at", { ascending: true })
      // A unique tiebreaker: rows created in the same transaction
      // share one now(), and Postgres gives no stable order among
      // ties — so a row on a page boundary could be counted twice
      // or skipped, and which it is changes between requests.
      .order("id", { ascending: true })
            .range(from, to),
  );
  const readError = paged.error;

  if (readError) {

    return NextResponse.json(

      { error: "Failed to load extra ad-account stats." },

      { status: 500 },

    );

  }

  // Re-date each row to when it settled. Everything downstream — the
  // buckets and the totals — reads `created_at`, so doing it here keeps
  // one definition of "in this period" instead of two that can drift.
  const rows = paged.rows.map((row) => ({
    ...row,
    created_at: row.paid_at ?? row.created_at,
  }));
  const series = buildSeries(rows, periodStart, periodEnd, granularity);

  const totals = rows.reduce(
    (acc, row) => {
      const amount = toNumber(row.total);
      const currency = normalizeCurrency(row.currency);

      if (amount <= 0 || !currency) {
        return acc;
      }

      acc.count += 1;
      acc[currency].amount += amount;
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
      // ── THE HEADLINE IS THE SUM OF THE BARS UNDER IT ────────────
      //
      // The series rounds each bucket to the cent and this rounded the
      // raw accumulation once, so the bars could sum to a cent either
      // side of the figure printed above them -- and both are drawn on
      // the same card. The EUR leg is produced inside the loop as
      // `usd * rate`, so four-decimal values are the norm, not an edge
      // case. Summing the already-rounded buckets makes the parts add
      // up to the whole by construction.
      usd: {
        amount: Number(
          series.reduce((n, p) => n + Number(p.usd_amount || 0), 0).toFixed(2),
        ),
        count: totals.usd.count,
      },
      eur: {
        amount: Number(
          series.reduce((n, p) => n + Number(p.eur_amount || 0), 0).toFixed(2),
        ),
        count: totals.eur.count,
      },
    },
    series,
  });
}
