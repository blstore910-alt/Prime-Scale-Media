// Pure matcher: given an incoming Wise transfer, pick the pending
// wallet top-up it settles. Kept pure so the rules are unit-tested
// without a DB or a live Wise call.
//
// Matching rules, strongest first:
//   1. reference_no matches the sender's typed reference (the PSM
//      topup reference we asked them to use) AND amount + currency
//      match → confident match.
//   2. No reference match, but exactly ONE pending topup matches
//      amount + currency → take it.
//   3. Anything ambiguous (multiple amount matches, no reference) →
//      no auto-match; leave for manual review. Auto-completing the
//      wrong topup moves real money, so we refuse rather than guess.

export type PendingTopup = {
  id: string;
  reference_no: number | string | null;
  amount: number | string;
  currency: string | null;
  status: string | null;
};

export type IncomingTransfer = {
  amount_cents: number;
  currency: string;
  reference: string | null;
};

export type MatchResult =
  | { matched: true; topupId: string; via: "reference" | "amount" }
  | { matched: false; reason: string };

const CENTS_EPSILON = 1; // 1 cent tolerance for rounding

function amountMatches(topupAmount: number | string, incomingCents: number): boolean {
  const topupCents = Math.round(Number(topupAmount) * 100);
  if (!Number.isFinite(topupCents)) return false;
  return Math.abs(topupCents - incomingCents) <= CENTS_EPSILON;
}

// Extract a PSM topup reference number from free-text the sender
// typed. We ask customers to include the numeric reference_no; banks
// may wrap it in other text ("PSM-TOPUP 1483181337", "ref 1483181337").
// Pull the longest digit run and compare numerically.
export function extractReferenceDigits(reference: string | null): string | null {
  if (!reference) return null;
  const runs = reference.match(/\d{4,}/g);
  if (!runs || runs.length === 0) return null;
  return runs.reduce((a, b) => (b.length >= a.length ? b : a));
}

export function matchIncomingTransfer(
  transfer: IncomingTransfer,
  pending: PendingTopup[],
): MatchResult {
  const cur = (transfer.currency || "").toUpperCase();
  const candidates = pending.filter(
    (t) =>
      (t.status ?? "pending") === "pending" &&
      (t.currency ?? "").toUpperCase() === cur &&
      amountMatches(t.amount, transfer.amount_cents),
  );

  if (candidates.length === 0) {
    return { matched: false, reason: "no pending topup with matching amount/currency" };
  }

  // 1. reference match among the amount/currency candidates
  const refDigits = extractReferenceDigits(transfer.reference);
  if (refDigits) {
    const byRef = candidates.filter(
      (t) => t.reference_no != null && String(t.reference_no) === refDigits,
    );
    if (byRef.length === 1) {
      return { matched: true, topupId: byRef[0].id, via: "reference" };
    }
    if (byRef.length > 1) {
      return { matched: false, reason: "multiple topups share that reference" };
    }
  }

  // 2. exactly one amount/currency match, no reference needed
  if (candidates.length === 1) {
    return { matched: true, topupId: candidates[0].id, via: "amount" };
  }

  // 3. ambiguous
  return {
    matched: false,
    reason: `${candidates.length} pending topups match the amount — needs manual review`,
  };
}
