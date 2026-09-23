"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
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

  // ── THROUGH THE ADMIN CLIENT, SO THE GRANT CAN GO ────────────────
  //
  // Not because the owner lacks the right, but so the live database can
  // revoke insert/update/delete on `invitations` from `authenticated`.
  // It has to: `invitations_write_admin for all using
  // (_is_admin_of(tenant_id))` lets ANY active employee admin update or
  // delete an invitation straight from the browser console -- re-price
  // a pending offer the owner authored, or destroy it. Postgres checks
  // the GRANT before the policy, so removing the grant closes that
  // without touching the read half.
  //
  // The tenant test above already ran against the caller's own client,
  // and it is repeated in the .eq() below.
  const cancelDb = await createAdminClient();
  const { data: rows, error } = await cancelDb
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

/**
 * The signup link for ONE pending invitation, for the account owner only.
 *
 * ──────────────────────────────────────────────────────────────────────
 * WHY THE LIST NO LONGER CARRIES IT
 *
 * The invites table used to `select("*")`, which put `token` in every
 * employee admin's browser — and the RLS policy on `invitations` is
 * `_is_admin_of`, so it was never the owner's alone.
 *
 * A token plus the invitee's own email IS that account. POST
 * /api/accept-invite/signup with the invited address and a password of
 * your choosing and the route calls `auth.admin.createUser` with
 * `email_confirm: true` — no mailbox access anywhere in it. Out comes a
 * confirmed auth user, a user_profiles row, an advertisers row and a
 * wallet, all bootstrapped by the same request.
 *
 * So the list stopped selecting it and the Copy-link button asks for it
 * one row at a time, here, behind the owner guard.
 *
 * It reads through the admin client on purpose: once `select (token)` is
 * revoked from `authenticated` on the live database, the caller's own
 * client could not read it even as the owner.
 * ──────────────────────────────────────────────────────────────────────
 */
export async function getInviteLinkToken(
  inviteId: string,
): Promise<ActionResult<{ token: string }>> {
  const ctx = await requireOwnerCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { profile } = ctx;

  const admin = await createAdminClient();
  const { data: invite, error } = await admin
    .from("invitations")
    .select("id, tenant_id, status, token, expires_at")
    .eq("id", inviteId)
    .maybeSingle();

  if (error) return { ok: false, error: safeErrorMessage(error) };
  if (!invite) return { ok: false, error: "Invitation not found" };
  // The admin client bypasses RLS, so the tenant test has to be here.
  if (invite.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  // A cancelled, expired or already-accepted invitation has no live link
  // to hand out, and handing one out anyway is how a revoked offer gets
  // used.
  if (String(invite.status ?? "") !== "pending") {
    return { ok: false, error: "That invitation is no longer open." };
  }
  // ── AND NOTHING WRITES 'expired' ─────────────────────────────────
  //
  // The status column only ever holds pending / accepted / cancelled;
  // expiry is a DATE, compared at the moment the link is opened. So
  // this handed over a token for an invitation the table beside it was
  // already drawing as **Expired**, under a toast promising "it works
  // until it expires or is cancelled" -- and /invite/accept then told
  // the customer the invitation can't be used. The admin had no way to
  // know they had sent a dead link.
  {
    const exp = (invite as { expires_at?: string | null }).expires_at;
    if (exp && new Date(exp).getTime() < Date.now()) {
      return {
        ok: false,
        error:
          "That invitation has expired. Cancel it and send a fresh one — the old link will not work.",
      };
    }
  }
  const token = String((invite as { token?: string | null }).token ?? "");
  if (!token) {
    return {
      ok: false,
      error: "This invitation has no link on it — cancel it and send a fresh one.",
    };
  }
  return { ok: true, data: { token } };
}
