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
};

export function requestStatusView(
  status: string | null | undefined,
): RequestStatusView {
  switch (String(status ?? "pending").toLowerCase().trim()) {
    case "completed":
      return { label: "Ready", badge: "ok", done: true };
    case "rejected":
    case "declined":
      return { label: "Not approved", badge: "due", done: true };
    case "cancelled":
    case "canceled":
      return { label: "Cancelled", badge: "muted", done: true };
    case "in_progress":
      return { label: "Being set up", badge: "pend", done: false };
    case "payment_pending":
      return { label: "Waiting for payment", badge: "pend", done: false };
    case "pending":
      return { label: "Waiting for us", badge: "pend", done: false };
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
      };
  }
}
