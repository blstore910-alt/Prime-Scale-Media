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
  // The advertiser this topup belongs to — needed to match against a
  // known sender IBAN.
  advertiser_id?: string | null;
};

export type IncomingTransfer = {
  amount_cents: number;
  currency: string;
  reference: string | null;
  // Optional sender bank details (from the Wise transaction, when we
  // fetch them). Used to match by a known sender.
  sender_iban?: string | null;
};

export type MatchResult =
  | { matched: true; topupId: string; via: "reference" | "sender" | "amount" }
  | { matched: false; reason: string };

export function normalizeIban(iban: string | null | undefined): string | null {
  if (!iban) return null;
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  return cleaned.length > 0 ? cleaned : null;
}

const CENTS_EPSILON = 1; // 1 cent tolerance for rounding

function amountMatches(topupAmount: number | string, incomingCents: number): boolean {
  const topupCents = Math.round(Number(topupAmount) * 100);
  if (!Number.isFinite(topupCents)) return false;
  return Math.abs(topupCents - incomingCents) <= CENTS_EPSILON;
}

// Extract a PSM topup reference from free-text the sender typed.
//
// This used to take the longest run of digits, which was right while the
// reference was a bare number. Customers are now asked to write
// `<client code>-<reference>` (so a statement shows whose money it is before
// anything is matched), and under the old rule a six-digit client code was
// LONGER than the reference and won — every prefixed payment would have been
// matched against the wrong number and fallen through to manual review.
// lib/payment-reference.ts understands both forms; it is shared with the
// screen that prints the reference, so the two cannot drift.
export { extractTopupReference as extractReferenceDigits } from "../payment-reference";
import { extractTopupReference } from "../payment-reference";

export function matchIncomingTransfer(
  transfer: IncomingTransfer,
  pending: PendingTopup[],
  // advertiser_ids the sender IBAN is known to belong to. A customer
  // can have MULTIPLE accounts paying from the same bank, so this is a
  // set, not a single id. It narrows the candidates; the reference is
  // still what pins the exact topup when there's more than one.
  knownSenderAdvertiserIds?: string[] | null,
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

  // 1. reference match among the amount/currency candidates — strongest.
  const refDigits = extractTopupReference(transfer.reference);
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

  // 2. known-sender match — the sender IBAN belongs to one or more of
  // our advertisers (a customer may run several accounts from the same
  // bank). Narrow the amount candidates to those advertisers; match
  // only if exactly one remains. If the payer has several same-amount
  // topups across their accounts and gave no reference, it's genuinely
  // ambiguous → review (the reference in step 1 is what disambiguates
  // that case, which is why customers are asked to include it).
  const senderIds = knownSenderAdvertiserIds ?? [];
  if (senderIds.length > 0) {
    const idSet = new Set(senderIds);
    const bySender = candidates.filter(
      (t) => t.advertiser_id != null && idSet.has(t.advertiser_id),
    );
    if (bySender.length === 1) {
      return { matched: true, topupId: bySender[0].id, via: "sender" };
    }
    if (bySender.length > 1) {
      return {
        matched: false,
        reason:
          "this payer has multiple same-amount topups (multiple accounts) — needs the reference or manual review",
      };
    }
  }

  // 3. exactly one amount/currency match overall, no reference/sender.
  if (candidates.length === 1) {
    return { matched: true, topupId: candidates[0].id, via: "amount" };
  }

  // 4. ambiguous
  return {
    matched: false,
    reason: `${candidates.length} pending topups match the amount — needs manual review`,
  };
}
