import { apiRequireAdmin } from "@/lib/auth/api-require-admin";
import { pageAllRows, pageAllRowsTolerant } from "@/lib/page-all-rows";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

// ── THE TWO WALLET MOVEMENTS THE DASHBOARD NEVER SHOWED ──────────────
//
// "Topups" on the owner's dashboard has always meant top_ups — money
// going from a wallet ONTO an ad account. The money coming IN, which is
// the wallet top-up an admin verifies against a bank slip, and the
// conversions between a customer's EUR and USD wallets, appeared
// nowhere on it. So the one screen that is supposed to say how the
// business is doing was silent about the side of the ledger the
// business actually runs on.
//
// One dataset for both, because they are one question ("what happened
// in the wallets this period") and because the dashboard pays for a
// round trip per dataset.

type WalletTopupRow = {
  created_at: string;
  verified_at?: string | null;
  amount: number | string | null;
  currency: string | null;
};

type ExchangeRow = {
  created_at: string;
  from_currency: string | null;
  from_amount: number | string | null;
};

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

const toNumber = (value: number | string | null | undefined) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const normalizeCurrency = (value: string | null) => {
  const code = String(value ?? "").trim().toUpperCase();
  return code === "EUR" || code === "USD" ? code : null;
};

export async function GET(request: NextRequest) {
  const { profile, error: authError } = await apiRequireAdmin();
  if (authError) return authError;

  const supabase = await createClient();
  const { start, end } = resolveRange(request);

  const periodStart = start.toISOString();
  const periodEnd = end.toISOString();

  // ── The wallets this tenant owns ───────────────────────────────────
  //
  // wallet_exchanges carries no tenant_id — it is keyed on wallet_id and
  // nothing else — so the only way to scope it is to ask which wallets
  // are ours first. An admin's RLS may well return every row without
  // this; "may well" is not a tenant guard on a multi-tenant table.
  const walletIdsResult = await pageAllRows<{ id: string }>((from, to) =>
    supabase
      .from("wallets")
      .select("id")
      .eq("tenant_id", profile.tenant_id)
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (walletIdsResult.error) {
    return NextResponse.json(
      { error: "Failed to load wallet stats." },
      { status: 500 },
    );
  }
  const walletIds = walletIdsResult.rows.map((w) => String(w.id));

  const [topupsPaged, exchangesPaged] = await Promise.all([
    // Dated by when an admin VERIFIED it, the same rule as every other
    // period figure on this dashboard — with the created_at read as the
    // fallback for a database where that column is not there yet.
    pageAllRowsTolerant<WalletTopupRow>(
      (from, to) =>
        supabase
          .from("wallet_topups")
          .select("created_at, verified_at, amount, currency")
          .eq("tenant_id", profile.tenant_id)
          .eq("status", "completed")
          .or(
            `and(verified_at.gte."${periodStart}",verified_at.lt."${periodEnd}"),` +
              `and(verified_at.is.null,created_at.gte."${periodStart}",created_at.lt."${periodEnd}")`,
          )
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      (from, to) =>
        supabase
          .from("wallet_topups")
          .select("created_at, amount, currency")
          .eq("tenant_id", profile.tenant_id)
          .eq("status", "completed")
          .gte("created_at", periodStart)
          .lt("created_at", periodEnd)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    ),
    // No wallets, no exchanges — and an empty .in() is a PostgREST
    // syntax error rather than an empty result, so it is not asked.
    walletIds.length
      ? pageAllRows<ExchangeRow>((from, to) =>
          supabase
            .from("wallet_exchanges")
            .select("created_at, from_currency, from_amount")
            .in("wallet_id", walletIds)
            .gte("created_at", periodStart)
            .lt("created_at", periodEnd)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        )
      : Promise.resolve({ rows: [] as ExchangeRow[], error: null }),
  ]);

  // AN ERROR IS NOT AN EMPTY PERIOD. A dropped read here would otherwise
  // print a confident zero on a money tile.
  if (topupsPaged.error || exchangesPaged.error) {
    return NextResponse.json(
      { error: "Failed to load wallet stats." },
      { status: 500 },
    );
  }

  const topups = { count: 0, eur: 0, usd: 0 };
  for (const row of topupsPaged.rows) {
    const currency = normalizeCurrency(row.currency);
    const amount = toNumber(row.amount);
    if (!currency || amount <= 0) continue;
    topups.count += 1;
    if (currency === "EUR") topups.eur += amount;
    else topups.usd += amount;
  }

  // The exchange is measured on the side that LEFT, because that is the
  // amount the customer chose; what arrived is the same money after a
  // rate, and adding both would count one conversion twice.
  const exchanges = { count: 0, eur: 0, usd: 0 };
  for (const row of exchangesPaged.rows) {
    const currency = normalizeCurrency(row.from_currency);
    const amount = toNumber(row.from_amount);
    if (!currency || amount <= 0) continue;
    exchanges.count += 1;
    if (currency === "EUR") exchanges.eur += amount;
    else exchanges.usd += amount;
  }

  const round = (v: number) => Number(v.toFixed(2));

  return NextResponse.json({
    range: { from: periodStart, to: periodEnd },
    topups: {
      count: topups.count,
      eur_amount: round(topups.eur),
      usd_amount: round(topups.usd),
    },
    exchanges: {
      count: exchanges.count,
      eur_amount: round(exchanges.eur),
      usd_amount: round(exchanges.usd),
    },
  });
}
