import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";

/**
 * WHO MAY OPEN THE FINANCE CHECK.
 *
 * The owner, 29-09: "finance check only for 1 admin and super admin."
 *
 * Two people, then: the owner, and one admin the owner has designated.
 * Not every admin — this page shows every customer's money side by
 * side, and that is a wider view than running a queue needs.
 *
 * ── WHY IT IS A COLUMN AND NOT A ROLE ─────────────────────────────
 *
 * `user_profiles.finance_reviewer` (plak 142), set only through
 * `set_finance_reviewer`, which checks that the caller owns the tenant
 * and that the target is an admin. Adding a role would mean touching
 * every guard in the app; a flag touches this one file, and the owner
 * can move it between people without anybody's role changing.
 *
 * ── AND IT HOLDS BEFORE THE MIGRATION LANDS ───────────────────────
 *
 * Code reaches production in minutes and migrations are pasted by
 * hand, so this runs for a while against a table with no
 * `finance_reviewer` column. A select naming a column that does not
 * exist THROWS — it does not return null — so the read is tried and,
 * on failure, retried without it. Until plak 142 lands the page is
 * owner-only, which is the safe end of the mistake.
 */
export async function requireFinanceReviewer(redirectTo = "/dashboard") {
  // Role, active, tenant — all the ordinary admin checks first.
  const { user, profile } = await requireAdmin(redirectTo);
  // requireAdmin types its profile as { id, role } -- it has more on
  // it than that, and this guard needs two of the extras.
  const p = profile as unknown as {
    id: string;
    tenant_id: string | null;
    user_id?: string;
  };

  const supabase = await createClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", p.tenant_id as string)
    .maybeSingle();

  const ownerId = (tenant as { owner_id?: string | null } | null)?.owner_id;
  const isOwner =
    !!ownerId &&
    (ownerId === user.id || ownerId === p.user_id);

  if (isOwner) return { user, profile, isOwner: true as const };

  // Not the owner. The one designated admin, then — if the column is
  // there yet.
  let reviewer = false;
  const { data, error } = await supabase
    .from("user_profiles")
    .select("finance_reviewer")
    .eq("id", p.id)
    .maybeSingle();

  if (!error) {
    reviewer = (data as { finance_reviewer?: boolean } | null)?.finance_reviewer === true;
  }
  // On error we leave `reviewer` false and fall through to the
  // redirect. A missing column must not open the page, and must not
  // crash it either.

  if (!reviewer) {
    redirect(
      redirectTo === "/dashboard" ? "/dashboard?denied=finance" : redirectTo,
    );
  }

  return { user, profile, isOwner: false as const };
}
