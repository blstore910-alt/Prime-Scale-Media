import { apiRequireOwner } from "@/lib/auth/api-require-admin";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { pageAllRows } from "@/lib/page-all-rows";

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
// NOT a fallback to 1 any more — the comment used to say it was, which is
// the opposite of what the code does ten lines down. No active rate is a
// refusal here: unconverted dollars under a euro sign overstate EUR fee
// revenue by the whole exchange rate, and a tenant that genuinely has no
// rate has no non-USD money to convert either.
  // ── A RATE WE COULD NOT READ IS NOT A RATE OF 1 ───────────────────
  //
  // This discarded `error` and then fell back to 1, which for the EUR
  // bucket means printing raw dollars under a euro sign: a $58.14 fee on
  // a EUR-paid top-up reports as EUR 58.14 where the truth is EUR 50.00,
  // our own margin overstated by the whole exchange rate. Falling back to
  // 1 is right for a tenant that has never configured a rate — it is not
  // right for a read that failed, and the two were the same branch. The
  // sibling route (stats/topups) says this in those words.
  const { data: rateRow, error: rateError } = await supabase
    .from("exchange_rates")
    .select("eur")
    .eq("tenant_id", profile.tenant_id)
    .eq("is_active", true)
    .maybeSingle();
  if (rateError) {
    return NextResponse.json(
      { error: "Could not read the exchange rate, so fee revenue cannot be converted." },
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
          "There is no active exchange rate, so fee figures cannot be converted. Set the rate in Settings -> Finance.",
      },
      { status: 409 },
    );
  }
  const usdToEurRate = rawRate;

  // ── AND EVERY ROW, NOT THE FIRST THOUSAND ─────────────────────────
  //
  // PostgREST caps a response at 1,000 rows, and top_ups is the highest
  // volume money table in the app — one bulk run inserts up to 200. An
  // unpaged sum is therefore right until the thousand-and-first row and
  // silently a fraction of the truth for ever after: 3,000 completed
  // top-ups report a third of the fee revenue, with no warning. There was
  // no .order() either, so WHICH thousand came back was unspecified and
  // changed between refreshes.
  const paged = await pageAllRows<FeeRow>((from, to) =>
    supabase
      .from("top_ups")
      .select("created_at, currency, fee_amount")
      .eq("tenant_id", profile.tenant_id)
      .gte("created_at", periodStart)
      .lt("created_at", periodEnd)
      .eq("status", "completed")
      .order("created_at", { ascending: true })
      // A unique tiebreaker: a bulk insert shares one now(), and Postgres
      // gives no stable order among ties, so a row on a page boundary
      // could be counted twice or skipped.
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
  );
  // AN ERROR IS NOT AN EMPTY PERIOD. `const { data } = ...` discarded it,
  // so a failed read rendered a confident zero on a financial dashboard.
  if (paged.error) {
    return NextResponse.json(
      { error: "Failed to load fee stats." },
      { status: 500 },
    );
  }

  const rows = paged.rows;
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
