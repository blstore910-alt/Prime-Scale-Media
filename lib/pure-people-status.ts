// ─────────────────────────────────────────────────────────────────────
// One status pill for a person, wherever a person is shown
// ─────────────────────────────────────────────────────────────────────
// An advertiser's status was drawn one way on /users, a plan's status
// another way two lines above it in the same card, and an admin's a
// third way on the admins table -- different colours and different
// words for the same two states. On one card that produced a green
// "Active" under an amber "Inactive", about the same customer, six
// millimetres apart.
//
// Two states, two colours, the same everywhere. `is_active` and
// `status` are separate columns and they disagree on live rows -- the
// screens that filter read `is_active`, the screens that print read
// `status` -- so either being off means off. Off wins, because a person
// wrongly shown as active is the one that costs something.
// ─────────────────────────────────────────────────────────────────────

export type PeopleStatusTone = "ok" | "off";

export interface PeopleStatusView {
  /** The word to print. Already cased; do not text-transform it. */
  label: string;
  tone: PeopleStatusTone;
  /** The `badge` modifier class. */
  cls: string;
}

export function peopleStatusView(
  status?: string | null,
  isActive?: boolean | null,
): PeopleStatusView {
  const s = String(status ?? "").trim().toLowerCase();

  // Off if EITHER column says off. An unknown status word is not a
  // promise of access, so only the words we actually write count as on.
  const off = isActive === false || s === "inactive" || s === "disabled";
  if (off) return { label: "Inactive", tone: "off", cls: "badge off" };

  if (s === "active" || isActive === true) {
    return { label: "Active", tone: "ok", cls: "badge ok" };
  }

  // Neither column says anything: "Active" would be a claim we cannot
  // make, and "Inactive" would be an accusation. Print the dash the rest
  // of the app prints for a value it does not have.
  return { label: "\u2014", tone: "off", cls: "badge muted" };
}

/**
 * A subscription's status, worded so it can never be mistaken for the
 * customer's. "Inactive" on its own, under a customer's name, reads as
 * the customer being switched off -- which is a different fact with a
 * different button.
 */
export function planStatusLabel(status?: string | null): string | null {
  const s = String(status ?? "").trim().toLowerCase();
  if (!s || s === "active") return null;
  const WORDS: Record<string, string> = {
    inactive: "Plan stopped",
    paused: "Plan paused",
    past_due: "Plan overdue",
    cancelled: "Plan cancelled",
    canceled: "Plan cancelled",
  };
  return WORDS[s] ?? `Plan ${s.replace(/_/g, " ")}`;
}
