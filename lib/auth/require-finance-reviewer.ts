import { redirect } from "next/navigation";

import { isTenantOwner } from "@/lib/auth/is-tenant-owner";
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

  // I wrote this the same day I was fixing exactly this mistake
  // elsewhere, and made it here too: `tenants.owner_id` holds one
  // uuid, and the owner has a business partner (plak 143). The second
  // owner would have been sent back from /finance-check by the guard
  // that was supposed to let owners through.
  //
  // One function decides ownership. See lib/auth/is-tenant-owner.ts.
  const isOwner = await isTenantOwner(
    supabase,
    p.tenant_id,
    user.id,
    p.user_id,
  );

  if (isOwner) return { user, profile, isOwner: true as const };

  // Not the owner. A designated admin, then.
  //
  // ── TWO WAYS IN, AND THAT IS DELIBERATE ─────────────────────────
  //
  // This started as its own column, `user_profiles.finance_reviewer`
  // (plak 142), before there was a general permission model. Then
  // there was one (plak 143), and `finance.check` became one of the
  // sixteen toggles on /admins — so an owner switching it on there
  // would have changed nothing at all, because this guard was still
  // reading the column. A switch that does nothing is worse than no
  // switch: it looks like the job is done.
  //
  // So the capability is asked first, and the column stays as the
  // way in for whoever was given it before the toggles existed. When
  // the column is empty everywhere it can go; until then it costs one
  // read and removes a trap.
  let reviewer = false;

  const { data: cap, error: capError } = await supabase
    .from("admin_capabilities")
    .select("capability")
    .eq("tenant_id", p.tenant_id as string)
    .eq("user_id", p.user_id as string)
    .eq("capability", "finance.check")
    .limit(1);
  if (!capError && (cap ?? []).length > 0) reviewer = true;

  if (!reviewer) {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("finance_reviewer")
      .eq("id", p.id)
      .maybeSingle();
    if (!error) {
      reviewer =
        (data as { finance_reviewer?: boolean } | null)?.finance_reviewer === true;
    }
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
