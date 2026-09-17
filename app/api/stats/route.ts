import { apiRequireOwner } from "@/lib/auth/api-require-admin";
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
  // Owner only: these are OUR profit and margin figures, not the desk's.
  const { profile, error: authError } = await apiRequireOwner();
  if (authError) return authError;

  const supabase = await createClient();

  // All-time profit / revenue is a super-admin (tenant-owner) surface — the
  // reduced employee-admin dashboard never calls this endpoint. Gate it to
  // the owner so a plain admin can't read total_profit / fees / top-ups by
  // hitting the route directly.
  const { data: statsTenant } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();
  if (!statsTenant || statsTenant.owner_id !== profile.user_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [
    topupsResult,
    adAccountsTotalResult,
    activeAdAccountsResult,
    advertisersTotalResult,
    advertisersStatusesResult,
    invoiceRevenueResult,
    referralCommissionsResult,
    exchangeRateResult,
  ] = await Promise.all([
    supabase
      .from("top_ups")
      .select("topup_amount, fee_amount, currency")
      .eq("tenant_id", profile.tenant_id)
      .eq("status", "completed"),
    supabase
      .from("ad_accounts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", profile.tenant_id),
    supabase
      .from("ad_accounts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", profile.tenant_id)
      .eq("status", "active"),
    supabase
      .from("advertisers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", profile.tenant_id),
    supabase
      .from("advertisers")
      .select("id, profile:user_profiles(status)")
      .eq("tenant_id", profile.tenant_id),
    // Invoice revenue is what has actually been COLLECTED, so it reads PAID
    // invoices only.
    //
    // It used to read the subscriptions table filtered on status = 'active',
    // which counted a plan's full monthly amount from the moment the
    // subscription was created at signup. Total profit therefore jumped by
    // the plan amount the instant an advertiser registered, before a single
    // invoice had been paid — and it was a run-rate, one month's fee per
    // active plan, not a total of anything.
    //
    // All three revenue types are counted. `subscription_adjustment` was
    // being dropped: when a plan moves up, the RPC raises an adjustment
    // invoice for the difference rather than re-issuing the subscription
    // invoice, so every upgrade a customer paid for was missing from profit.
    // (A downgrade refunds through `wallet_adjustments`, not a negative
    // invoice, so there is nothing to subtract here.)
    supabase
      .from("invoices")
      .select("total, currency")
      .eq("tenant_id", profile.tenant_id)
      // ad_account_fee too. Every extra ad account a customer asks for is
    // invoiced with type 'ad_account_fee' (see use-create-ad-account-
    // request-invoice.ts) and it appeared in NO revenue figure at all —
    // twenty requests at €50 is €1,000 collected and reported as zero.
    .in("type", [
      "subscription",
      "subscription_adjustment",
      "manual_invoice",
      "ad_account_fee",
    ])
      .eq("status", "paid"),
    supabase
      .from("referral_commissions")
      .select("amount, currency")
      .eq("tenant_id", profile.tenant_id)
      .eq("status", "paid"),
    supabase
      .from("exchange_rates")
      .select("eur")
      .eq("tenant_id", profile.tenant_id)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  const errors = [
    topupsResult.error,
    adAccountsTotalResult.error,
    activeAdAccountsResult.error,
    advertisersTotalResult.error,
    advertisersStatusesResult.error,
    invoiceRevenueResult.error,
    referralCommissionsResult.error,
    exchangeRateResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    return NextResponse.json(
      { error: "Failed to load dashboard stats." },
      { status: 500 },
    );
  }

  // A brand-new tenant has no rate row yet — the app-provider
  // bootstraps one asynchronously, but the dashboard mounts before
  // it lands. Fall back to 1.0 so the dashboard renders zeros
  // (nothing to convert yet anyway) instead of a 500.
  const activeExchangeRate = exchangeRateResult.data as ExchangeRateRow | null;
  const rawUsdToEurRate = toNumber(activeExchangeRate?.eur);
  const usdToEurRate = rawUsdToEurRate > 0 ? rawUsdToEurRate : 1;

  const topups = (topupsResult.data || []) as TopupRow[];
  const advertiserStatuses = (advertisersStatusesResult.data ||
    []) as AdvertiserStatusRow[];
  const invoiceRevenue = (invoiceRevenueResult.data || []) as InvoiceRow[];
  const referralCommissions = (referralCommissionsResult.data ||
    []) as CurrencyAmountRow[];

  // ── The one thing to understand about `top_ups` ──────────────────────
  // `topup_amount` and `fee_amount` are ALWAYS USD. calculateTopupAmount()
  // (and the matching server RPC) divide the received amount by the rate
  // first, then take the fee off the USD figure — an ad account is funded in
  // dollars whatever the customer paid in. The `currency` column says what
  // the CUSTOMER PAID IN, not what these two columns are denominated in.
  //
  // This used to add `fee_amount` straight into a EUR bucket and then into
  // profit unconverted, so every euro-paying customer's fee was counted at
  // its dollar figure: ~16% more profit than we earned, growing with every
  // EUR top-up. The split by payment currency is worth keeping — it says who
  // pays us how — but the EUR side has to be converted to be true.
  const totals = topups.reduce(
    (acc, topup) => {
      const currency = normalizeCurrency(topup.currency);
      if (!currency) return acc;

      const topupAmount = toNumber(topup.topup_amount);
      const feeAmount = toNumber(topup.fee_amount);

      acc.topupsUsd[currency] += topupAmount;
      acc.feesUsd[currency] += feeAmount;
      if (feeAmount > 0) acc.feeCount += 1;

      return acc;
    },
    {
      topupsUsd: { usd: 0, eur: 0 },
      feesUsd: { usd: 0, eur: 0 },
      feeCount: 0,
    },
  );

  // Displayed under a € sign, so it is converted; the dollar bucket is
  // already in dollars.
  const topupsEurPaid = totals.topupsUsd.eur * usdToEurRate;
  const feesEurPaid = totals.feesUsd.eur * usdToEurRate;

  // Every fee is a USD fee, so profit in EUR is the whole lot converted.
  const feesProfit = (totals.feesUsd.usd + totals.feesUsd.eur) * usdToEurRate;
  const invoicesProfit = invoiceRevenue.reduce((sum, invoice) => {
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
  const totalProfit = feesProfit + invoicesProfit - referralCommissionsCost;

  const activeAdvertisersCount = advertiserStatuses.reduce((count, advertiser) => {
    return advertiser.profile?.status === "active" ? count + 1 : count;
  }, 0);

  return NextResponse.json({
    total_topups: {
      count: topups.length,
      usd_amount: Number(totals.topupsUsd.usd.toFixed(2)),
      eur_amount: Number(topupsEurPaid.toFixed(2)),
    },
    total_fees: {
      count: totals.feeCount,
      usd_amount: Number(totals.feesUsd.usd.toFixed(2)),
      eur_amount: Number(feesEurPaid.toFixed(2)),
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
