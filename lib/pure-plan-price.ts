/**
 * What a plan costs, in the currency the customer actually pays in.
 *
 * WHY THIS IS NOT A CONVERSION.
 *
 * A €200 plan at today's rate is $226.14. Printing that on a payment
 * screen is arithmetic, not pricing: it moves every time the ECB moves,
 * it looks like a mistake, and nobody has ever sold a subscription for
 * $226.14. The owner's rule is the right one — the USD price of the €200
 * plan is $225, of the €150 plan is $170, of the €75 plan is $85. Round
 * numbers somebody chose.
 *
 * So a price per currency is STORED on the plan, and conversion is only
 * ever a SUGGESTION shown to the admin setting it. The same rule the
 * owner asked for on top-up fees: the system advises, the human decides,
 * and what the human decided is what gets charged.
 *
 * THE FALLBACK IS DELIBERATELY VISIBLE. When no price has been pinned for
 * a currency, this converts — because refusing to price at all would
 * block an invite — and it reports `pinned: false` so the screen can say
 * "suggested" rather than pretend somebody chose it.
 */

export type PlanCurrency = "EUR" | "USD";
export type BillingPeriod = "month" | "year";

/** The price-carrying fields of a plan row. Strings allowed: numeric
 *  columns arrive from PostgREST as strings. */
export type PlanPricing = {
  /** The plan's base currency — what `monthly_fee` is denominated in. */
  currency?: string | null;
  monthly_fee?: number | string | null;
  /** Pinned prices. Null = nothing chosen, so it is derived. */
  monthly_fee_eur?: number | string | null;
  monthly_fee_usd?: number | string | null;
  yearly_fee_eur?: number | string | null;
  yearly_fee_usd?: number | string | null;
  /** Null or 0 = this plan has no yearly option at all. */
  yearly_discount_pct?: number | string | null;
};

export type ResolvedPrice = {
  amount: number;
  currency: PlanCurrency;
  period: BillingPeriod;
  /** True when a human set this exact number for this exact currency. */
  pinned: boolean;
};

function n(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : null;
}

export function planBaseCurrency(plan: PlanPricing): PlanCurrency {
  return String(plan.currency ?? "EUR").toUpperCase() === "USD" ? "USD" : "EUR";
}

/** Null or 0 means no yearly option — not a 0% discount. */
export function yearlyDiscountPct(plan: PlanPricing): number {
  const d = n(plan.yearly_discount_pct);
  if (d === null || d <= 0 || d >= 100) return 0;
  return d;
}

export function hasYearlyOption(plan: PlanPricing): boolean {
  return yearlyDiscountPct(plan) > 0
    || n(plan.yearly_fee_eur) !== null
    || n(plan.yearly_fee_usd) !== null;
}

/**
 * A price somebody would put on a website.
 *
 * Nearest, not ceiling: €200 × 1.13 = 226, and the owner's answer is
 * $225, not $230. Below 20 the step drops to 1, because rounding a €5
 * plan to the nearest 5 rounds it to $5 — a number that is round and
 * wrong.
 */
export function niceRound(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const step = amount < 20 ? 1 : 5;
  return Math.round(amount / step) * step;
}

/** What to put in the empty USD box, as advice. Never written by itself. */
export function suggestPrice(
  amountInBase: number | string | null | undefined,
  rate: number | string | null | undefined,
): number | null {
  const a = n(amountInBase);
  const r = n(rate);
  if (a === null || a <= 0) return null;
  if (r === null || r <= 0) return null;
  return niceRound(a * r);
}

/** The monthly price in one currency, pinned if somebody set it. */
function monthlyIn(
  plan: PlanPricing,
  currency: PlanCurrency,
  rate: number | null,
): { amount: number; pinned: boolean } {
  const pin = n(currency === "USD" ? plan.monthly_fee_usd : plan.monthly_fee_eur);
  if (pin !== null && pin >= 0) return { amount: pin, pinned: true };

  const base = n(plan.monthly_fee) ?? 0;
  const baseCur = planBaseCurrency(plan);
  if (baseCur === currency) return { amount: base, pinned: true };

  // Nothing pinned and the currencies differ: convert, and say so.
  if (rate === null || rate <= 0) return { amount: base, pinned: false };
  const converted = currency === "USD" ? base * rate : base / rate;
  return { amount: niceRound(converted), pinned: false };
}

/**
 * The amount to charge.
 *
 * `rate` is EUR→USD and is only consulted when nothing has been pinned.
 * A yearly price with no pin is twelve months less the discount — which
 * comes out round whenever the monthly price is round, which is the
 * whole point of pinning the monthly one.
 */
export function planPrice(
  plan: PlanPricing,
  currency: PlanCurrency,
  period: BillingPeriod = "month",
  rate?: number | string | null,
): ResolvedPrice {
  const r = n(rate);

  if (period === "year") {
    const pin = n(currency === "USD" ? plan.yearly_fee_usd : plan.yearly_fee_eur);
    if (pin !== null && pin >= 0) {
      return { amount: pin, currency, period, pinned: true };
    }
    const m = monthlyIn(plan, currency, r);
    const disc = yearlyDiscountPct(plan);
    const raw = m.amount * 12 * (1 - disc / 100);
    return {
      amount: Math.round(raw * 100) / 100,
      currency,
      period,
      pinned: false,
    };
  }

  const m = monthlyIn(plan, currency, r);
  return {
    amount: Math.round(m.amount * 100) / 100,
    currency,
    period,
    pinned: m.pinned,
  };
}

/** What a yearly term saves against paying monthly, in that currency. */
export function yearlySaving(
  plan: PlanPricing,
  currency: PlanCurrency,
  rate?: number | string | null,
): number {
  const m = planPrice(plan, currency, "month", rate).amount;
  const y = planPrice(plan, currency, "year", rate).amount;
  const saved = m * 12 - y;
  return saved > 0 ? Math.round(saved * 100) / 100 : 0;
}
