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

  // `is_active` alone is NOT permission to print "Active". The status
  // column is hand-authored and its default is not in this repo, so a
  // row can carry "pending", "invited" or "suspended" -- and every one
  // of those has is_active true until somebody sets it false. Treating
  // that as Active painted a green pill on a suspended customer AND
  // flipped their row button to "Deactivate", which is the opposite of
  // what an admin needs to press.
  if (s === "active") return { label: "Active", tone: "ok", cls: "badge ok" };

  // A word we do not know is printed as itself, quietly. It is a true
  // statement, it is visibly not "Active", and it tells whoever is
  // looking that the database holds something this screen was not
  // written for -- which is exactly what they need to know.
  if (s) {
    const label = s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
    return { label, tone: "off", cls: "badge pend" };
  }

  // Nothing at all in the status column. An empty status with is_active
  // true is the ordinary shape of a freshly-inserted profile.
  if (isActive === true) {
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
    // NOT "Plan stopped". A subscription is CREATED inactive -- the
    // dialog says so in its own toast, "created, not billing yet" --
    // so the very first thing an admin saw after adding a plan was a
    // badge claiming it had been halted. "Stopped" says something
    // ended; nothing had. "Not billing" is true whether it never
    // started or was switched off with the customer, and it is the
    // same phrase the toast uses.
    inactive: "Not billing",
    paused: "Plan paused",
    past_due: "Plan overdue",
    cancelled: "Plan cancelled",
    canceled: "Plan cancelled",
  };
  return WORDS[s] ?? `Plan ${s.replace(/_/g, " ")}`;
}
