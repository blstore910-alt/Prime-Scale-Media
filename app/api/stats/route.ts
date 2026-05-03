import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type CurrencyKey = "usd" | "eur";

type TopupRow = {
  topup_amount: number | string | null;
  fee_amount: number | string | null;
  currency: string | null;
};

type CurrencyAmountRow = {
  amount: number | string | null;
  currency: string | null;
};

type InvoiceRow = {
  total: number | string | null;
  currency: string | null;
};

type ExchangeRateRow = {
  eur: number | string | null;
};

type AdvertiserStatusRow = {
  profile?: { status?: string | null } | null;
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

export async function GET() {
  const supabase = await createClient();

  const [
    topupsResult,
    adAccountsTotalResult,
    activeAdAccountsResult,
    advertisersTotalResult,
    advertisersStatusesResult,
    subscriptionsResult,
    manualInvoicesResult,
    referralCommissionsResult,
    exchangeRateResult,
  ] = await Promise.all([
    supabase
      .from("top_ups")
      .select("topup_amount, fee_amount, currency")
      .eq("status", "completed"),
    supabase.from("ad_accounts").select("id", { count: "exact", head: true }),
    supabase
      .from("ad_accounts")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase.from("advertisers").select("id", { count: "exact", head: true }),
    supabase.from("advertisers").select("id, profile:user_profiles(status)"),
    supabase
      .from("subscriptions")
      .select("amount, currency")
      .eq("status", "active"),
    supabase
      .from("invoices")
      .select("total, currency")
      .eq("type", "manual_invoice")
      .eq("status", "paid"),
    supabase
      .from("referral_commissions")
      .select("amount, currency")
      .eq("status", "paid"),
    supabase
      .from("exchange_rates")
      .select("eur")
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  const errors = [
    topupsResult.error,
    adAccountsTotalResult.error,
    activeAdAccountsResult.error,
    advertisersTotalResult.error,
    advertisersStatusesResult.error,
    subscriptionsResult.error,
    manualInvoicesResult.error,
    referralCommissionsResult.error,
    exchangeRateResult.error,
  ].filter(Boolean);

  const activeExchangeRate = exchangeRateResult.data as ExchangeRateRow | null;
  const usdToEurRate = toNumber(activeExchangeRate?.eur);

  if (errors.length > 0 || !activeExchangeRate || usdToEurRate <= 0) {
    return NextResponse.json(
      { error: "Failed to load dashboard stats." },
      { status: 500 },
    );
  }

  const topups = (topupsResult.data || []) as TopupRow[];
  const advertiserStatuses = (advertisersStatusesResult.data ||
    []) as AdvertiserStatusRow[];
  const subscriptions = (subscriptionsResult.data || []) as CurrencyAmountRow[];
  const manualInvoices = (manualInvoicesResult.data || []) as InvoiceRow[];
  const referralCommissions = (referralCommissionsResult.data ||
    []) as CurrencyAmountRow[];

  const totals = topups.reduce(
    (acc, topup) => {
      const currency = normalizeCurrency(topup.currency);
      const topupAmount = toNumber(topup.topup_amount);
      const feeAmount = toNumber(topup.fee_amount);

      if (currency) {
        acc.topups[currency] += topupAmount;
      }

      if (currency) {
        acc.fees[currency] += feeAmount;
      }

      if (currency && feeAmount > 0) {
        acc.fees.count += 1;
      }

      return acc;
    },
    {
      topups: { count: topups.length, usd: 0, eur: 0 },
      fees: { count: 0, usd: 0, eur: 0 },
    },
  );

  const feesProfit = totals.fees.eur + totals.fees.usd * usdToEurRate;
  const subscriptionsProfit = subscriptions.reduce((sum, subscription) => {
    return (
      sum +
      convertToEur(
        toNumber(subscription.amount),
        subscription.currency,
        usdToEurRate,
      )
    );
  }, 0);
  const manualInvoicesProfit = manualInvoices.reduce((sum, invoice) => {
    return (
      sum + convertToEur(toNumber(invoice.total), invoice.currency, usdToEurRate)
    );
  }, 0);
  const referralCommissionsCost = referralCommissions.reduce(
    (sum, commission) => {
      return (
        sum +
        convertToEur(
          toNumber(commission.amount),
          commission.currency,
          usdToEurRate,
        )
      );
    },
    0,
  );
  const totalProfit =
    feesProfit +
    subscriptionsProfit +
    manualInvoicesProfit -
    referralCommissionsCost;

  const activeAdvertisersCount = advertiserStatuses.reduce((count, advertiser) => {
    return advertiser.profile?.status === "active" ? count + 1 : count;
  }, 0);

  return NextResponse.json({
    total_topups: {
      count: totals.topups.count,
      usd_amount: Number(totals.topups.usd.toFixed(2)),
      eur_amount: Number(totals.topups.eur.toFixed(2)),
    },
    total_fees: {
      count: totals.fees.count,
      usd_amount: Number(totals.fees.usd.toFixed(2)),
      eur_amount: Number(totals.fees.eur.toFixed(2)),
    },
    revenue_profit: {
      total_profit: Number(totalProfit.toFixed(2)),
    },
    ad_accounts: {
      total: adAccountsTotalResult.count || 0,
      active: activeAdAccountsResult.count || 0,
    },
    advertisers_affiliates: {
      advertisers: {
        total: advertisersTotalResult.count || 0,
        active: activeAdvertisersCount,
      },
    },
  });
}
