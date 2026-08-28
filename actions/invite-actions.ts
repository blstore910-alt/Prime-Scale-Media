"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireAdminCtx() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false as const, error: "Unauthorized" };
  }
  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role, tenant_id, user_id")
    .eq("user_id", userData.user.id);
  if (!profiles?.length) return { ok: false as const, error: "Forbidden" };
  const profile = existingProfile
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];
  if (profile.role !== "admin" || !profile.tenant_id) {
    return { ok: false as const, error: "Forbidden" };
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

  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  const { data: invite } = await supabase
    .from("invitations")
    .select("id, tenant_id, status")
    .eq("id", inviteId)
    .maybeSingle();
  if (!invite) return { ok: false, error: "Invitation not found" };
  if (invite.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  if (invite.status === "accepted") {
    return { ok: false, error: "Invitation already accepted" };
  }

  const { error } = await supabase
    .from("invitations")
    .update({ status })
    .eq("id", inviteId)
    .eq("tenant_id", profile.tenant_id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}
