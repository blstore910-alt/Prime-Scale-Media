import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type CurrencyKey = "usd" | "eur";

type TopupRow = {
  topup_amount: number | string | null;
  fee_amount: number | string | null;
  currency: string | null;
  type: string | null;
  amount_usd: number | string | null;
  account?: { platform?: string | null } | null;
  affiliate_commissions?: Array<{ commission_amount: number | string | null }> | null;
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

export async function GET() {
  const supabase = await createClient();

  const [
    topupsResult,
    adAccountsTotalResult,
    activeAdAccountsResult,
    advertisersTotalResult,
    advertisersStatusesResult,
    affiliatesTotalResult,
    activeAffiliatesResult,
  ] = await Promise.all([
    supabase
      .from("top_ups")
      .select(
        "topup_amount, fee_amount, currency, type, amount_usd, account:ad_accounts(platform), affiliate_commissions(commission_amount)",
      )
      .eq("status", "completed"),
    supabase.from("ad_accounts").select("id", { count: "exact", head: true }),
    supabase
      .from("ad_accounts")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase.from("advertisers").select("id", { count: "exact", head: true }),
    supabase.from("advertisers").select("id, profile:user_profiles(status)"),
    supabase.from("affiliates").select("id", { count: "exact", head: true }),
    supabase
      .from("affiliates")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
  ]);

  const errors = [
    topupsResult.error,
    adAccountsTotalResult.error,
    activeAdAccountsResult.error,
    advertisersTotalResult.error,
    advertisersStatusesResult.error,
    affiliatesTotalResult.error,
    activeAffiliatesResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    return NextResponse.json(
      { error: "Failed to load dashboard stats." },
      { status: 500 },
    );
  }

  const topups = (topupsResult.data || []) as TopupRow[];
  const advertiserStatuses = (advertisersStatusesResult.data ||
    []) as AdvertiserStatusRow[];

  const totals = topups.reduce(
    (acc, topup) => {
      const currency = normalizeCurrency(topup.currency);
      const topupAmount = toNumber(topup.topup_amount);
      const feeAmount = toNumber(topup.fee_amount);
      const amountUsd = toNumber(topup.amount_usd);
      const topupType = (topup.type || "").toLowerCase();

      if (currency && topupAmount > 0) {
        acc.topups.count += 1;
        acc.topups[currency] += topupAmount;
      }

      if (currency && feeAmount > 0) {
        acc.fees.count += 1;
        acc.fees[currency] += feeAmount;
      }

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
        topup.account?.platform === "eu-meta-premium" ? amountUsd * 0.02 : 0;
      const affiliateCommissions =
        topup.affiliate_commissions?.reduce((sum, commission) => {
          return sum + toNumber(commission.commission_amount);
        }, 0) || 0;

      const revenuePoint =
        topupFeeContribution + subscriptionsAndAccountsContribution;
      const profitPoint =
        revenuePoint - affiliateCommissions - euMetaPremiumFeeContribution;

      acc.revenue += revenuePoint;
      acc.profit += profitPoint;

      return acc;
    },
    {
      topups: { count: 0, usd: 0, eur: 0 },
      fees: { count: 0, usd: 0, eur: 0 },
      revenue: 0,
      profit: 0,
    },
  );

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
      total_revenue: Number(totals.revenue.toFixed(2)),
      total_profit: Number(totals.profit.toFixed(2)),
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
      affiliates: {
        total: affiliatesTotalResult.count || 0,
        active: activeAffiliatesResult.count || 0,
      },
    },
  });
}
