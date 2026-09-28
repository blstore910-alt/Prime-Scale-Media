// ── HOW A WITHDRAWAL'S STATUS READS ──────────────────────────────────
//
// The owner, 27-09: "B doen voor API-accounts en A houden voor
// handmatige."
//
// That added `at_supplier` between pending and approved, and every
// screen printed the raw column with `text-transform: capitalize` —
// which renders it "At_supplier". Worse than ugly: it is the one status
// where the customer's money has left our books and not yet arrived,
// so it is exactly the row somebody will ring up about.
//
// One label, one tone, one explanation, used by the queue, the customer's
// own list and the filters, so the three cannot describe the same row
// differently.

export type WithdrawalStatus =
  | "pending"
  | "at_supplier"
  | "approved"
  | "rejected"
  | "cancelled";

export type WithdrawalStatusLook = {
  /** What to print on the pill. */
  label: string;
  /** Existing badge tones in this app: ok / pend / due. */
  tone: "ok" | "pend" | "due";
  /** One line for a tooltip, written for whoever is reading the row. */
  hint: string;
  /** What the CUSTOMER should be told — never names the supplier. */
  customerLabel: string;
  customerHint: string;
};

const LOOKS: Record<WithdrawalStatus, WithdrawalStatusLook> = {
  pending: {
    label: "Pending",
    tone: "pend",
    hint: "Waiting on us. Nothing has moved yet.",
    customerLabel: "Waiting for us",
    customerHint: "We are checking this. Nothing has left the ad account yet.",
  },
  at_supplier: {
    label: "With the provider",
    tone: "pend",
    hint: "Sent, and we are waiting for them to confirm. The wallet is credited the moment they do — usually within a day.",
    // ── NOT "SUPPLIER", NOT A NAME ────────────────────────────────
    // Who we buy from is not the customer's business — not in the UI,
    // not in an email, not in the JSON behind the page. "Being
    // processed" says the true thing without saying who.
    customerLabel: "Being processed",
    customerHint:
      "Approved and on its way back. It lands in your wallet once it clears, usually within a day.",
  },
  approved: {
    label: "Approved",
    tone: "ok",
    hint: "Done. The wallet has been credited.",
    customerLabel: "In your wallet",
    customerHint: "This has been credited to your wallet.",
  },
  rejected: {
    label: "Rejected",
    tone: "due",
    hint: "Turned down, with a reason on the row.",
    customerLabel: "Not approved",
    customerHint: "We could not do this one. The reason is on the request.",
  },
  cancelled: {
    label: "Cancelled",
    tone: "due",
    hint: "Withdrawn before it was decided.",
    customerLabel: "Cancelled",
    customerHint: "This request was cancelled.",
  },
};

const UNKNOWN: WithdrawalStatusLook = {
  // A status we do not know is not "fine". Saying so beats printing a
  // raw column value and beats guessing at a tone.
  label: "Unknown",
  tone: "due",
  hint: "This status is not one this screen knows. Ask us to look.",
  customerLabel: "Being checked",
  customerHint: "We are looking at this one.",
};

export function withdrawalStatusLook(
  status: string | null | undefined,
): WithdrawalStatusLook {
  const key = String(status ?? "")
    .trim()
    .toLowerCase();
  return (LOOKS as Record<string, WithdrawalStatusLook>)[key] ?? UNKNOWN;
}

/**
 * The filter dropdown, in the order a queue is worked.
 *
 * `cancelled` is deliberately NOT here. The column allows it and
 * nothing in the app ever writes it -- the only two writers are
 * ad_account_withdrawal_approve and _reject -- so an admin who picks
 * it gets "Nothing matches that filter or search", every time, for
 * ever. The three screens that use this list each appended their own
 * `rejected` afterwards to work around its absence, which put
 * Rejected in the dropdown TWICE (and gave the native select two
 * options with the same React key). One list, said once.
 */
export const WITHDRAWAL_STATUS_CHOICES: Array<{
  value: WithdrawalStatus;
  label: string;
}> = (
  ["pending", "at_supplier", "approved", "rejected"] as const
).map((v) => ({ value: v, label: LOOKS[v].label }));

/**
 * Is this row still waiting on somebody?
 *
 * Used for the queue count. `at_supplier` is deliberately NOT in it: it
 * is waiting on the provider, not on us, and a desk counter that never
 * goes down teaches people to ignore the counter.
 */
export function isOnOurDesk(status: string | null | undefined): boolean {
  return String(status ?? "").trim().toLowerCase() === "pending";
}
