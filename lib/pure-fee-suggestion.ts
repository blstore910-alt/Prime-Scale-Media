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
//   1. When we know BOTH the customer's plan rate and the type's own
//      rate, offer the HIGHER of the two.
//   2. When we know only one, offer that one.
//   3. Otherwise nothing -- and nothing is NOT zero. Zero is read by
//      resolveEffectiveFeePct as "not set", and a form that quietly
//      writes 0 sells at cost for ever. The caller has to say it could
//      not work one out.
//
// WHY THE HIGHER, AND NOT SIMPLY THE PLAN
//
// The owner, 27-09, a message later: "soms heeft iemand hk geven we hem
// 3% fee bijv en soms eu ra geven we hem 4% fee bijv dat die moet
// betalen."
//
// So the rate is not one number per customer. The same customer can be
// on 3% for a Hong Kong account and 4% for a EU RockAds one, because
// the TYPE carries a rate of its own -- it is what that supply costs us.
// A first pass here made the plan rate win outright, which would have
// sold every RockAds account to a 3% customer at 3% however the type
// was priced.
//
// The higher of the two satisfies both things he said, on every example
// he gave:
//
//   PSM0004, plan 5, RockAds 4  ->  5   ("moet hier ook 5% staan")
//   plan 3, Hong Kong 3         ->  3   ("hk geven we hem 3%")
//   plan 3, EU RockAds 4        ->  4   ("eu ra geven we hem 4%")
//
// Read as a sentence: never below what was agreed with the customer, and
// never below what that kind of account is priced at. It is a
// SUGGESTION either way -- an admin types over it, and whether they are
// allowed to is feeIsAPrice's question, not this one. Conveniently the
// answer is always the plan rate or the type default, which are exactly
// the two figures an employee admin is permitted to save.
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

  let pct: number | null;
  let source: FeeSuggestion["source"];
  if (planPct != null && typePct != null) {
    // The higher wins, and ties read as the plan — they are the same
    // number, and naming the agreement is the friendlier sentence.
    pct = Math.max(planPct, typePct);
    source = pct === planPct ? "plan" : "type";
  } else if (planPct != null) {
    pct = planPct;
    source = "plan";
  } else if (typePct != null) {
    pct = typePct;
    source = "type";
  } else {
    pct = null;
    source = "none";
  }

  return {
    pct,
    source,
    planPct,
    typePct,
    belowTypeDefault: planPct != null && typePct != null && planPct < typePct,
  };
}
