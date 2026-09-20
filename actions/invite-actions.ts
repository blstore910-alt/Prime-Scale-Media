"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { maintenanceGuard , wroteSomething} from "./_shared";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireOwnerCtx() {
  const base = await requireAdminCtx();
  if (!base.ok) return base;
  const { data: tenant } = await base.supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", base.profile.tenant_id)
    .maybeSingle();
  const ownerId = (tenant as { owner_id?: string | null } | null)?.owner_id;
  if (!ownerId || ownerId !== base.profile.user_id) {
    return {
      ok: false as const,
      error: "Only the account owner can cancel an invitation.",
    };
  }
  return base;
}

async function requireAdminCtx() {
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false as const, error: mm.error };
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false as const, error: "Unauthorized" };
  }
  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role, tenant_id, user_id, is_active, status")
    .eq("user_id", userData.user.id);
  if (!profiles?.length) return { ok: false as const, error: "Forbidden" };
  const profile = existingProfile
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];
  if (profile.role !== "admin" || !profile.tenant_id) {
    return { ok: false as const, error: "Forbidden" };
  }
  // Deactivated admin keeps role but loses access.
  if (profile.is_active === false || (profile.status ?? "active") === "inactive") {
    return { ok: false as const, error: "Account is inactive" };
  }
  return { ok: true as const, supabase, profile };
}

const ALLOWED_STATUS = ["cancelled", "expired"] as const;
type CancelStatus = (typeof ALLOWED_STATUS)[number];

export async function cancelInvitation(
  inviteId: string,
  status: CancelStatus = "cancelled",
): Promise<ActionResult> {
  if (typeof inviteId !== "string" || inviteId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }
  if (!ALLOWED_STATUS.includes(status)) {
    return { ok: false, error: "Invalid status" };
  }

  // ── OWNER, FOR EVERY INVITE ROLE ─────────────────────────────────
  //
  // The owner check below used to fire only when invite.role ===
  // "admin", so every advertiser and affiliate invitation cancelled at
  // plain admin level -- on /invites, which is requireSuperAdmin. An
  // invitation carries the monthly fee, the included accounts, the
  // top-up fee, the referrer and the community: cancelling one destroys
  // a priced offer the owner authored and kills the customer's signup
  // link, silently.
  const ctx = await requireOwnerCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  const { data: invite } = await supabase
    .from("invitations")
    .select("id, tenant_id, status, role")
    .eq("id", inviteId)
    .maybeSingle();
  if (!invite) return { ok: false, error: "Invitation not found" };
  if (invite.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  if (invite.status === "accepted") {
    return { ok: false, error: "Invitation already accepted" };
  }

  // Admin-role invites are only issued by the super-admin — an
  // employee cancelling one is a permission escalation the other
  // way (blocks the owner's new admin). That test used to live here as
  // an `if (invite.role === "admin")`; it is now the guard on the whole
  // action, so it needs no second copy.

  const { data: rows, error } = await supabase
    .from("invitations")
    .update({ status })
    .eq("id", inviteId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  // A cancellation that wrote nothing leaves a live invitation link in
  // someone's inbox while the screen says it was revoked.
  const wrote = wroteSomething(rows);
  if (!wrote.ok) return wrote;
  return { ok: true, data: null };
}
