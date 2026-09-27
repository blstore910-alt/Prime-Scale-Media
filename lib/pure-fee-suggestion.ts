// ── WHAT TO CHARGE A CUSTOMER ON A NEW AD ACCOUNT ────────────────────
//
// The owner, 27-09, looking at PSM0004: "psm 0004 is 5% dus moet hier
// ook 5% staan en geen 3%."
//
// Two forms prefill this box and both did it the same wrong way: they
// wrote the ad-account TYPE's default over whatever was there, and the
// plan prefill then declined to run because the box was no longer
// empty. The type default therefore always won. All five ad accounts on
// the live tenant sit at 3.00 because of it, including a customer whose
// plan says five -- two points of margin per top-up, given away by an
// effect ordering.
//
// The rule, in one place so the two forms cannot drift again:
//
//   1. The advertiser's PLAN rate, when they have one. That is what was
//      agreed with that customer and it outranks any default.
//   2. Otherwise the ad-account TYPE's default. That is the rate for
//      somebody with no plan.
//   3. Otherwise nothing -- and nothing is NOT zero. Zero is read by
//      resolveEffectiveFeePct as "not set", and a form that quietly
//      writes 0 sells at cost for ever. The caller has to say it could
//      not work one out.
//
// This decides only what is OFFERED. What is CHARGED is ad_accounts.fee,
// resolved server-side; an admin may still type over the suggestion, and
// whether they are allowed to is a separate question with its own guard.

export type FeeSuggestion = {
  /** The percent to put in the box, or null when we cannot say. */
  pct: number | null;
  /** Which rule produced it — for the sentence under the field. */
  source: "plan" | "type" | "none";
  /** The plan rate, when there is one, so a caller can compare. */
  planPct: number | null;
  /** The type default, when there is one. */
  typePct: number | null;
  /**
   * True when the plan charges LESS than the type's own default. Not an
   * error — an agreed discount is a real thing — but the one case worth
   * showing, because it is also what an accident looks like.
   */
  belowTypeDefault: boolean;
};

function clean(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  // 0 is a legitimate READ of a rate, but as a suggestion it means "not
  // set" everywhere else in this app, so it is not offered as one.
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 100) return null;
  return n;
}

export function suggestFeePct(input: {
  /** advertiser_plans.topup_fee_pct for this advertiser. */
  planPct?: unknown;
  /** ad_account_types.default_fee_pct for the chosen platform. */
  typePct?: unknown;
}): FeeSuggestion {
  const planPct = clean(input.planPct);
  const typePct = clean(input.typePct);

  const pct = planPct ?? typePct;
  const source: FeeSuggestion["source"] =
    planPct != null ? "plan" : typePct != null ? "type" : "none";

  return {
    pct,
    source,
    planPct,
    typePct,
    belowTypeDefault: planPct != null && typePct != null && planPct < typePct,
  };
}
