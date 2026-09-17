// Pure matcher: given an incoming Wise transfer, pick the pending
// wallet top-up it settles. Kept pure so the rules are unit-tested
// without a DB or a live Wise call.
//
// Matching rules, strongest first:
//   1. reference_no matches the sender's typed reference (the PSM
//      topup reference we asked them to use) AND amount + currency
//      match → confident match.
//   2. No reference, but the sender's IBAN is one we have already
//      PROVEN belongs to an advertiser (learned only from a
//      reference-confirmed payment) and exactly one of their pending
//      topups fits the amount → match.
//   3. Everything else → no auto-match. Manual review.
//
// AMOUNT ALONE IS NOT EVIDENCE. This used to match when exactly one
// pending topup happened to fit the amount, and that is a different
// statement from "this money belongs to that topup": ten customers can
// wire EUR 5.00 on the same day, and if only one of them has filed a
// claim, the FIRST such deposit to arrive gets credited to that one
// person's wallet. The deposit is real, the claim is real, the amounts
// agree — and the money went to the wrong customer. Nothing downstream
// can catch it, because every figure checks out.
//
// So a coincidence of amount is now explicitly refused, and the admin
// picks with their eyes (the manual picker still enforces amount and
// currency to the cent). The owner's instruction, verbatim: "matches via
// amount mag niet, er kunnen 10 mensen zelfde amount sturen".

export type PendingTopup = {
  id: string;
  reference_no: number | string | null;
  amount: number | string;
  currency: string | null;
  status: string | null;
  // The advertiser this topup belongs to — needed to match against a
  // known sender IBAN.
  advertiser_id?: string | null;
  /** When the customer filed the claim. Used for the date check below. */
  created_at?: string | null;
};

export type IncomingTransfer = {
  amount_cents: number;
  currency: string;
  reference: string | null;
  // Optional sender bank details (from the Wise transaction, when we
  // fetch them). Used to match by a known sender.
  sender_iban?: string | null;
  /** When the money landed. Used for the date check below. */
  occurred_at?: string | null;
};

export type MatchResult =
  | { matched: true; topupId: string; via: "reference" | "sender" }
  | { matched: false; reason: string };

export function normalizeIban(iban: string | null | undefined): string | null {
  if (!iban) return null;
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  return cleaned.length > 0 ? cleaned : null;
}

const CENTS_EPSILON = 1; // 1 cent tolerance for rounding

/**
 * How far apart a claim and a payment may be and still be the same event.
 *
 * A match has to agree on THREE things — the reference, the amount, and
 * the date — and until now the date was not looked at at all. Reference
 * plus amount alone will happily marry a deposit to a claim from two
 * months ago that was never paid, or to one filed long afterwards, and
 * both of those are somebody else's money.
 *
 * SYMMETRIC, and generous. The first version of this allowed a claim
 * filed 60 days BEFORE the payment and only 14 days after — which is
 * backwards: paying first and telling us afterwards is the ordinary case
 * (you transfer, then you get round to the form, sometimes after a
 * weekend), while a two-month-old unpaid claim is the risky one. It
 * refused the normal order and permitted the suspicious one.
 *
 * Both directions are the same width now, wide enough for a real
 * invoice-then-pay cycle and narrow enough that a payment can never
 * settle a claim from another era. Note that when a REFERENCE matches,
 * the reference is what identifies the claim — references are unique per
 * claim and rotate after each one — so this window mainly protects the
 * paths where there is no reference to go on.
 */
export const CLAIM_WINDOW_DAYS = 60;
/** @deprecated kept so a call site reading either name still compiles. */
export const CLAIM_BEFORE_DEPOSIT_DAYS = CLAIM_WINDOW_DAYS;
export const CLAIM_AFTER_DEPOSIT_DAYS = CLAIM_WINDOW_DAYS;

function datesAgree(
  claimCreatedAt: string | null | undefined,
  depositAt: string | null | undefined,
): boolean {
  // No date on either side: the check cannot be applied. Do not use that
  // as a reason to refuse — the reference is still the stronger signal,
  // and older rows have no occurred_at to compare against.
  if (!claimCreatedAt || !depositAt) return true;
  const claim = Date.parse(claimCreatedAt);
  const dep = Date.parse(depositAt);
  if (!Number.isFinite(claim) || !Number.isFinite(dep)) return true;
  const diffDays = Math.abs(claim - dep) / 86_400_000;
  return diffDays <= CLAIM_WINDOW_DAYS;
}

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
  // Amount, currency AND date. All three, together — see datesAgree.
  const candidates = pending.filter(
    (t) =>
      (t.status ?? "pending") === "pending" &&
      (t.currency ?? "").toUpperCase() === cur &&
      amountMatches(t.amount, transfer.amount_cents) &&
      datesAgree(t.created_at, transfer.occurred_at),
  );

  if (candidates.length === 0) {
    const wrongDateOnly = pending.some(
      (t) =>
        (t.status ?? "pending") === "pending" &&
        (t.currency ?? "").toUpperCase() === cur &&
        amountMatches(t.amount, transfer.amount_cents) &&
        !datesAgree(t.created_at, transfer.occurred_at),
    );
    return {
      matched: false,
      reason: wrongDateOnly
        ? "a pending topup matches the amount but was filed too far from this payment's date — needs a human"
        : "no pending topup with matching amount/currency",
    };
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

  // 3. No reference and no proven sender. The amount is the only thing
  //     that agrees, and an amount is a coincidence, not an identity —
  //     see the note at the top of this file. Refused on purpose, with a
  //     reason that says what would settle it.
  return {
    matched: false,
    reason:
      candidates.length === 1
        ? "one pending topup fits the amount, but nothing proves it is this payment — needs the reference or a manual match"
        : `${candidates.length} pending topups match the amount — needs manual review`,
  };
}
