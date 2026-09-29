import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * IS THIS PERSON AN OWNER OF THIS TENANT?
 *
 * ── WHY THIS IS ONE FUNCTION AND NOT TWENTY ───────────────────────
 *
 * `tenants.owner_id` held exactly one uuid, and the owner has a
 * business partner who needs their own login (plak 143 — two people on
 * one password works and makes the audit log worthless, on the day
 * "who did this" becomes the first question).
 *
 * Ownership moved into `tenant_owners`. The shared helpers
 * `resolveOwnerContext` and `requireSuperAdmin` learned about it
 * immediately, and that looked like the whole job — until the check
 * was counted. It is tested in about thirty places: a handful of named
 * guards, several file-local copies of the same five lines, and a long
 * tail of `tenant.owner_id !== profile.user_id` written inline.
 *
 * Every one of those that was missed is a door the second owner walks
 * up to and cannot open. That is the worst shape this could take: not
 * a refusal at the front door, which is at least obvious, but a menu
 * full of buttons that each say "Forbidden".
 *
 * So there is one function, and everything calls it.
 *
 * ── IT ONLY EVER ADDS PEOPLE ──────────────────────────────────────
 *
 * The old column is checked first and still decides on its own. The
 * table can say yes to somebody the column does not; it can never say
 * no to somebody the column says yes to. Whoever was an owner
 * yesterday is one today.
 *
 * ── AND IT HOLDS BEFORE THE MIGRATION LANDS ───────────────────────
 *
 * Code ships in minutes; plaks are pasted by hand. Until 143 is in,
 * `tenant_owners` does not exist and the select throws — so the read
 * is tried, the error swallowed, and the column decides. The direction
 * of that mistake is stricter, never looser.
 */
export async function isTenantOwner(
  supabase: SupabaseClient,
  tenantId: string | null | undefined,
  /** The caller's ids. Both are passed because they differ for
   *  somebody holding a profile in more than one tenant, and the two
   *  existing guards disagreed about which one to test. */
  ...userIds: (string | null | undefined)[]
): Promise<boolean> {
  if (!tenantId) return false;
  const ids = userIds.filter(Boolean) as string[];
  if (ids.length === 0) return false;

  // The column, first and on its own.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", tenantId)
    .maybeSingle();
  const ownerId = (tenant as { owner_id?: string | null } | null)?.owner_id;
  if (ownerId && ids.includes(ownerId)) return true;

  // Then the list.
  const { data, error } = await supabase
    .from("tenant_owners")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .in("user_id", ids)
    .limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}
