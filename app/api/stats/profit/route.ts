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
  // Owner only: these are OUR profit and margin figures, not the desk's.
  const { profile, error: authError } = await apiRequireOwner();
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
    // ── ALL FOUR SIDES ARE PAGED ──────────────────────────────────
    //
    // PostgREST stops at 1,000 rows, and this route is the one where
    // truncation is most dangerous: revenue and cost truncate
    // INDEPENDENTLY. 800 top-ups worth EUR 40,000 of fee revenue against
    // 2,500 commission rows worth EUR 100,000 of true cost, and the
    // chart reads break-even on a business losing EUR 60,000 a year.
    // None of the four had an .order() either, so which thousand came
    // back was unspecified.
    pageAllRows<FeeRow>((from, to) =>
      supabase
        .from("top_ups")
        .select("created_at, currency, fee_amount")
        .eq("tenant_id", profile.tenant_id)
        .eq("status", "completed")
        .gte("created_at", periodStart)
        .lt("created_at", periodEnd)
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
    ),
    // FOUR TYPES, not two. The profit TILE counts subscription,
    // subscription_adjustment, manual_invoice and ad_account_fee — that
    // was fixed in app/api/stats/route.ts with the note "twenty requests
    // at 50 EUR is 1,000 EUR collected and reported as zero" — and the
    // SERIES on the same screen was left reading two of them. So the
    // chart sat below the number beside it by every upgrade and every
    // extra-account fee ever collected, with nothing to explain the gap.
    pageAllRows<InvoiceRow>((from, to) =>
      supabase
        .from("invoices")
        .select("created_at, currency, total")
        .eq("tenant_id", profile.tenant_id)
        .in("type", ["subscription", "subscription_adjustment"])
        .eq("status", "paid")
        .gte("created_at", periodStart)
        .lt("created_at", periodEnd)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    pageAllRows<InvoiceRow>((from, to) =>
      supabase
        .from("invoices")
        .select("created_at, currency, total")
        .eq("tenant_id", profile.tenant_id)
        .in("type", ["manual_invoice", "ad_account_fee"])
        .eq("status", "paid")
        .gte("created_at", periodStart)
        .lt("created_at", periodEnd)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    pageAllRows<CommissionRow>((from, to) =>
      supabase
        .from("referral_commissions")
        .select("created_at, currency, amount")
        .eq("tenant_id", profile.tenant_id)
        .eq("status", "paid")
        .gte("created_at", periodStart)
        .lt("created_at", periodEnd)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
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

  if (errors.length > 0) {
    return NextResponse.json(
      { error: "Failed to load profit stats." },
      { status: 500 },
    );
  }

  // A brand-new tenant has no rate row yet — fall back to 1.0 so a
  // fresh dashboard renders zeros instead of a 500 while the async
  // bootstrap in app-provider seeds one.
  const activeExchangeRate = exchangeRateResult.data as ExchangeRateRow | null;
  const rawUsdToEurRate = toNumber(activeExchangeRate?.eur);
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
  if (!(rawUsdToEurRate > 0)) {
    return NextResponse.json(
      {
        error:
          "There is no active exchange rate, so profit figures cannot be converted. Set the rate in Settings -> Finance.",
      },
      { status: 409 },
    );
  }
  const usdToEurRate = rawUsdToEurRate;

  const fees = feesResult.rows;
  const subscriptionInvoices = subscriptionInvoicesResult.rows;
  const manualInvoices = manualInvoicesResult.rows;
  const referralCommissions = referralCommissionsResult.rows;

  const rows: ProfitContributionRow[] = [
    // fee_amount is USD by construction, whatever top_ups.currency says.
    // calculateTopupAmount (lib/utils-pure.ts) converts the paid amount to
    // USD first and takes the fee off THAT, and both the single and bulk
    // top-up forms store the result. Labelling it with the top-up's payment
    // currency counted a dollar figure as euros on every EUR top-up, which
    // inflated euro fee revenue on the one screen the operator uses to see
    // what the business earned.
    ...fees.map((row) => ({
      created_at: row.created_at,
      currency: "USD",
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
