/**
 * Is this profile switched off?
 *
 * ── ONE LIST, TWO GATES ──────────────────────────────────────────────
 *
 * app/(app)/layout.tsx locks on a NAMED list -- inactive, disabled,
 * suspended, pending_erasure -- deliberately, because no `create table
 * user_profiles` exists in this repo and the column default is unknown,
 * so `status !== "active"` once locked out everybody.
 *
 * app/inactive/page.tsx carried the OTHER rule: `status !== "active"`.
 * So any status outside both lists -- `pending`, `trial`, whatever a
 * later migration adds -- meant the app worked normally AND /inactive
 * told the same person their account had been deactivated. Two screens,
 * one customer, opposite answers.
 *
 * The lists are now the same list, in one place.
 */
export const LOCKED_STATUSES = [
  "inactive",
  "disabled",
  "suspended",
  "pending_erasure",
] as const;

export function isLockedOut(profile: {
  is_active?: boolean | null;
  status?: string | null;
} | null | undefined): boolean {
  if (!profile) return false;
  if (profile.is_active === false) return true;
  return (LOCKED_STATUSES as readonly string[]).includes(
    String(profile.status ?? "").toLowerCase(),
  );
}
