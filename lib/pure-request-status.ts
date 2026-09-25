/**
 * What a customer is told about an ad-account request.
 *
 * Two screens print this and they disagreed. The card on Ad accounts
 * said "Not approved" / "Being set up" / "Waiting for us"; the list on
 * Requests printed the raw column with an underscore turned into a
 * space and a capital on the front — "Payment_pending" became "Payment
 * pending", which is our word for our own queue, not an instruction to
 * anybody. Same row, two vocabularies, one customer.
 *
 * The badge class goes with the word, because that is the other half
 * that drifted: the card asked for `badge bad`, and this shell has no
 * such variant (ok, pend, due, info, muted), so a refusal rendered in
 * the neutral grey of a pill that means nothing.
 */

export type RequestBadge = "ok" | "due" | "pend" | "muted";

export type RequestStatusView = {
  /** What the customer reads. */
  label: string;
  /** The badge variant in the advertiser shell. */
  badge: RequestBadge;
  /** Whether this is the end of the road for this request. */
  done: boolean;
  /**
   * The headline on the Ad accounts card, where the row is one card
   * among the live accounts rather than a line in a list.
   */
  title: string;
  /**
   * What happens next, or null when the card says it some other way (a
   * refusal prints its reason; a finished one is an account by now).
   *
   * This exists because "We set it up on our Business Manager" was
   * printed under EVERY unfinished request, including `payment_pending`
   * — which means the fee invoice is raised and it is waiting on the
   * CUSTOMER. We were telling somebody who owes us money that we were
   * busy on it.
   */
  hint: string | null;
};

const BUILDING =
  "We set it up on our Business Manager. It appears under Ad accounts as soon as it is live.";

export function requestStatusView(
  status: string | null | undefined,
): RequestStatusView {
  switch (String(status ?? "pending").toLowerCase().trim()) {
    case "completed":
      return {
        label: "Ready",
        badge: "ok",
        done: true,
        title: "Ad account ready",
        hint: null,
      };
    case "rejected":
    case "declined":
      return {
        label: "Not approved",
        badge: "due",
        done: true,
        title: "Request not approved",
        hint: null,
      };
    case "cancelled":
    case "canceled":
      return {
        label: "Cancelled",
        badge: "muted",
        done: true,
        title: "Request cancelled",
        hint: null,
      };
    case "in_progress":
      return {
        label: "Being set up",
        badge: "pend",
        done: false,
        title: "Ad account on the way",
        hint: BUILDING,
      };
    case "payment_pending":
      return {
        label: "Waiting for payment",
        badge: "pend",
        done: false,
        title: "Waiting for your payment",
        hint: "The fee invoice for this one is open. We start on it as soon as it is paid — you can pay it under Billing.",
      };
    case "pending":
      return {
        label: "Waiting for us",
        badge: "pend",
        done: false,
        title: "Ad account on the way",
        hint: BUILDING,
      };
    default:
      // An unknown status is a status we added and did not come back
      // here for. Amber and readable beats a blank pill: the customer
      // sees that something is happening, and nobody is told "Ready".
      return {
        label: String(status ?? "")
          .replace(/_/g, " ")
          .replace(/^./, (c) => c.toUpperCase())
          .trim() || "In progress",
        badge: "pend",
        done: false,
        title: "Ad account on the way",
        hint: BUILDING,
      };
  }
}
