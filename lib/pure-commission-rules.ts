// ── WHAT AN AFFILIATE EARNS, AND FROM WHEN ──────────────────────────
//
// The owner's rules (2026-09-21), in their words and then in ours:
//
//   "per affiliate or advertiser easily set what they earn from this
//    moment on ... what he earned until now stays, but new rules count
//    from now ... specifically per ad account type ... and per
//    subscription"
//
//   * A rule is a percentage with a START. Saving never edits a rule; it
//     adds a new version that applies from that moment. Commission
//     already booked is never recalculated.
//   * There is one DEFAULT set for every affiliate, and any affiliate can
//     have their own. Their own wins.
//   * Top-ups: a percentage of our PROFIT on the top-up -- our fee minus
//     what the supplier charges us to fund the account -- settable for
//     all account types at once and per type. ("nee op de profit, alleen
//     op de profit, dus supplier fee moet er af")
//   * Subscriptions: a percentage of every paid subscription invoice.
//   * One-time: a fixed amount, once per referred customer, when their
//     FIRST top-up is verified ("1x eenmalig", F4).
//   * A new rule applies to ALL of the affiliate's referred customers
//     from now on, not only to customers who arrive later.
//
// The database trigger does the booking; this file is the same arithmetic
// for the screens, so the preview an owner reads before saving and the
// breakdown under each commission are computed exactly the way the row
// was. supabase/checks/PLAK-DIT-35-*.sql is the SQL twin -- change both.

import { sameSlug } from "./pure-slug-key";

export type CommissionSource = "topup" | "subscription" | "onetime";

export type CommissionRule = {
  id: string;
  tenant_id: string;
  /** null = the default for every affiliate in the tenant. */
  affiliate_advertiser_id: string | null;
  source: CommissionSource;
  /** Top-ups only. null = every account type. */
  ad_account_type: string | null;
  /** null = "nothing at this level from now on" (the rule was cleared).
   *  Percentage sources only (topup, subscription). */
  pct: number | string | null;
  /** One-time only: the fixed amount, and its currency. */
  amount?: number | string | null;
  currency?: string | null;
  effective_from: string;
  created_at?: string | null;
  created_by?: string | null;
};

/** Where a resolved percentage came from, most specific first. */
export type RuleLevel =
  | "own-type"
  | "own-all"
  | "default-type"
  | "default-all";

export type ResolvedRule = {
  /** The percentage; 0 for a one-time rule, which has an amount instead. */
  pct: number;
  /** One-time only. */
  amount: number | null;
  currency: string | null;
  level: RuleLevel;
  rule: CommissionRule;
};

/** Whether a version SETS something, or clears its level. */
function isSet(r: CommissionRule): boolean {
  return r.source === "onetime" ? num(r.amount) !== null : num(r.pct) !== null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function time(v: string | null | undefined): number {
  const t = v ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/**
 * The latest version at one level that had started by `at`.
 * Ties on effective_from go to the one created last.
 */
function latestAt(
  rules: readonly CommissionRule[],
  match: (r: CommissionRule) => boolean,
  at: number,
): CommissionRule | null {
  let best: CommissionRule | null = null;
  for (const r of rules) {
    if (!match(r)) continue;
    if (time(r.effective_from) > at) continue;
    if (
      !best ||
      time(r.effective_from) > time(best.effective_from) ||
      (time(r.effective_from) === time(best.effective_from) &&
        time(r.created_at) > time(best.created_at))
    ) {
      best = r;
    }
  }
  return best;
}

/**
 * The percentage that applies to one event.
 *
 * Four levels, most specific first: this affiliate + this type, this
 * affiliate + every type, the default + this type, the default + every
 * type. At each level the latest version that had started counts; a
 * version whose pct is null means the level was cleared, so the next one
 * down is asked. A MORE SPECIFIC rule wins even if a broader one is
 * newer -- setting "all types 12%" does not silently erase an override
 * of 15% on one type; the owner clears that override on purpose.
 *
 * Returns null when nothing applies: no commission.
 */
export function resolveCommissionRule(
  rules: readonly CommissionRule[],
  q: {
    affiliateAdvertiserId: string;
    source: CommissionSource;
    /** The ad account's type slug; ignored for subscriptions and one-time. */
    typeSlug?: string | null;
    /** When the event happened. Defaults to now. */
    at?: string | number | Date;
  },
): ResolvedRule | null {
  const at =
    q.at === undefined
      ? Date.now()
      : q.at instanceof Date
        ? q.at.getTime()
        : typeof q.at === "number"
          ? q.at
          : time(q.at);
  const type = q.source === "topup" ? q.typeSlug ?? null : null;

  const levels: Array<{
    level: RuleLevel;
    aff: string | null;
    typed: boolean;
  }> = [
    { level: "own-type", aff: q.affiliateAdvertiserId, typed: true },
    { level: "own-all", aff: q.affiliateAdvertiserId, typed: false },
    { level: "default-type", aff: null, typed: true },
    { level: "default-all", aff: null, typed: false },
  ];

  for (const l of levels) {
    if (l.typed && !type) continue;
    const r = latestAt(
      rules,
      (x) =>
        x.source === q.source &&
        (x.affiliate_advertiser_id ?? null) === l.aff &&
        (l.typed
          ? !!x.ad_account_type && sameSlug(x.ad_account_type, type)
          : !x.ad_account_type),
      at,
    );
    if (!r) continue;
    if (!isSet(r)) continue; // cleared at this level
    return {
      pct: r.source === "onetime" ? 0 : (num(r.pct) ?? 0),
      amount: r.source === "onetime" ? num(r.amount) : null,
      currency:
        r.source === "onetime"
          ? String(r.currency ?? "EUR").toUpperCase()
          : null,
      level: l.level,
      rule: r,
    };
  }
  return null;
}

/**
 * The percentage set at ONE exact level right now, or null when that
 * level has nothing (never set, or cleared). This is what the editor
 * shows in a field: the owner's own entry at that level, not the value
 * that happens to apply through a broader rule.
 */
export function pctAtLevel(
  rules: readonly CommissionRule[],
  q: {
    affiliateAdvertiserId: string | null;
    source: CommissionSource;
    typeSlug: string | null;
    at?: number;
  },
): number | null {
  const at = q.at ?? Date.now();
  const r = latestAt(
    rules,
    (x) =>
      x.source === q.source &&
      (x.affiliate_advertiser_id ?? null) === (q.affiliateAdvertiserId ?? null) &&
      (q.typeSlug
        ? !!x.ad_account_type && sameSlug(x.ad_account_type, q.typeSlug)
        : !x.ad_account_type),
    at,
  );
  return r ? num(r.pct) : null;
}

/** The one-time amount set at ONE exact level right now, or null. */
export function onetimeAtLevel(
  rules: readonly CommissionRule[],
  q: { affiliateAdvertiserId: string | null; at?: number },
): { amount: number; currency: string } | null {
  const at = q.at ?? Date.now();
  const r = latestAt(
    rules,
    (x) =>
      x.source === "onetime" &&
      (x.affiliate_advertiser_id ?? null) === (q.affiliateAdvertiserId ?? null) &&
      !x.ad_account_type,
    at,
  );
  const amount = r ? num(r.amount) : null;
  if (!r || amount === null) return null;
  return { amount, currency: String(r.currency ?? "EUR").toUpperCase() };
}

/**
 * Round to cents the way Postgres `round(numeric, 2)` does: half away
 * from zero, on the decimal value -- not on the binary float, where
 * 0.485 * 100 is 48.49999... and would round DOWN.
 */
export function roundCents(x: number): number {
  if (!Number.isFinite(x)) return 0;
  const s = Math.sign(x);
  return (s * Math.round(Math.abs(x) * 100 + 1e-9)) / 100;
}

export type TopupProfit = {
  fee: number;
  landed: number;
  supplierPct: number | null;
  supplierCost: number | null;
  /** null when the supplier's fee is not recorded: profit is unknown. */
  profit: number | null;
};

/**
 * Our profit on one top-up: the fee we took, minus what the supplier
 * charges us to put the landed amount on the account.
 *
 * A supplier fee that is not recorded is NOT zero. Treating it as zero
 * would pay the affiliate a share of money the supplier keeps, so the
 * profit is unknown and no commission is booked on a guess.
 */
export function topupProfit(input: {
  feeAmount: number | string | null | undefined;
  landedAmount: number | string | null | undefined;
  supplierFeePct: number | string | null | undefined;
}): TopupProfit {
  const fee = roundCents(num(input.feeAmount) ?? 0);
  const landed = roundCents(num(input.landedAmount) ?? 0);
  const supplierPct = num(input.supplierFeePct);
  if (supplierPct === null) {
    return { fee, landed, supplierPct: null, supplierCost: null, profit: null };
  }
  const supplierCost = roundCents((landed * supplierPct) / 100);
  return {
    fee,
    landed,
    supplierPct,
    supplierCost,
    profit: roundCents(fee - supplierCost),
  };
}

/** A share of a base, in cents. Nothing on a base of zero or less. */
export function commissionOn(
  base: number | null | undefined,
  pct: number | null | undefined,
): number {
  if (base === null || base === undefined || !(base > 0)) return 0;
  if (pct === null || pct === undefined || !(pct > 0)) return 0;
  return roundCents((base * pct) / 100);
}

/** Human label for where a percentage came from, for the owner's screens. */
export function ruleLevelLabel(level: RuleLevel | null): string {
  switch (level) {
    case "own-type":
      return "own rule for this type";
    case "own-all":
      return "own rule, all types";
    case "default-type":
      return "default for this type";
    case "default-all":
      return "default, all types";
    default:
      return "no rule — earns nothing";
  }
}
