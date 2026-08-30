import { parseJsonBody, safeErrorMessage } from "@/lib/http";
import { callerIp, LIMITS, rateLimitCheck } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const AcceptInviteSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
  invite_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const allowed = await rateLimitCheck(
    LIMITS.acceptInvite,
    `ip:${callerIp(request)}`,
  );
  if (!allowed) {
    return NextResponse.json(
      { success: false, message: "Too many attempts — try again later" },
      { status: 429 },
    );
  }

  const parsed = await parseJsonBody(request, AcceptInviteSchema);
  if (!parsed.ok) return parsed.response;
  const { status, invite_id } = parsed.data;

  // Require authenticated user
  const { data: userData, error: authErr } = await supabase.auth.getUser();

  if (authErr || !userData.user) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  // ─────────────────────────────────────────
  // SERVER-SIDE INVITE VALIDATION (P0-3 fix)
  // Do NOT trust body for tenant_id, role.
  // Fetch from invitations table and verify ownership.
  // ─────────────────────────────────────────
  const { data: invitation, error: inviteFetchError } = await supabase
    .from("invitations")
    .select("id, email, role, tenant_id, status, expires_at, affiliate_id")
    .eq("id", invite_id)
    .maybeSingle();

  if (inviteFetchError || !invitation) {
    return NextResponse.json(
      { success: false, message: "Invitation not found" },
      { status: 404 },
    );
  }

  // Invitation must be addressed to logged-in user (email match)
  if (invitation.email?.toLowerCase() !== userData.user.email?.toLowerCase()) {
    return NextResponse.json(
      { success: false, message: "This invitation is not for you" },
      { status: 403 },
    );
  }

  // Must not be expired
  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json(
      { success: false, message: "Invitation has expired" },
      { status: 403 },
    );
  }

  // Must be in pending state (blocks accepted/rejected/expired/cancelled)
  if (invitation.status !== "pending") {
    return NextResponse.json(
      { success: false, message: "Invitation is no longer valid" },
      { status: 403 },
    );
  }

  // Update invitation status
  const { error: updateError } = await supabase
    .from("invitations")
    .update({ status })
    .eq("id", invite_id)
    .select("*");

  if (updateError) {
    console.error(
      "accept-invite update failed:",
      safeErrorMessage(updateError),
    );
    return NextResponse.json(
      {
        success: false,
        message: "An error occurred while updating invitation status. Please try again.",
      },
      { status: 500 },
    );
  }

  // If rejected, we're done
  if (status === "rejected") {
    return NextResponse.json(
      { success: true, message: "Invite rejected successfully" },
      { status: 201 },
    );
  }

  // Accepted: create user profile using SERVER-VALIDATED values
  const { data: profileData, error: profileError } = await supabase
    .from("user_profiles")
    .insert({
      user_id: userData.user.id,
      tenant_id: invitation.tenant_id,
      role: invitation.role,
      full_name:
        userData.user.user_metadata?.display_name ||
        `${userData.user.user_metadata?.first_name ?? ""} ${userData.user.user_metadata?.last_name ?? ""}`.trim() ||
        userData.user.email ||
        null,
      email: userData.user.email,
    })
    .select()
    .single();

  if (profileError) {
    console.error(
      "accept-invite profile insert failed:",
      safeErrorMessage(profileError),
    );
    return NextResponse.json(
      {
        success: false,
        message: "An error occurred while creating user profile",
      },
      { status: 500 },
    );
  }

  // For advertiser invites we also need an advertisers row + wallet.
  // The signup path does this inline; existing-user acceptance did
  // not, leaving the advertiser stuck at the wallet page with a null
  // walletId. ensure_advertiser_and_wallet() is idempotent and only
  // acts for role=advertiser — safe to call unconditionally.
  const { error: bootstrapError } = await supabase.rpc(
    "ensure_advertiser_and_wallet",
    { p_profile_id: profileData.id },
  );
  if (bootstrapError) {
    console.error(
      "accept-invite advertiser/wallet bootstrap failed:",
      safeErrorMessage(bootstrapError),
    );
    return NextResponse.json(
      {
        success: false,
        message:
          "Profile created but advertiser setup failed. Please contact support.",
      },
      { status: 500 },
    );
  }

  const res = NextResponse.json(
    {
      success: true,
      message: "Invite accepted and user profile created",
    },
    { status: 201 },
  );
  res.cookies.set("profile_id", profileData.id, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
