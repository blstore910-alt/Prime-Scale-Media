import { isMaintenanceMode } from "@/actions/_shared";
import { parseJsonBody, safeErrorMessage } from "@/lib/http";
import { callerIp, LIMITS, rateLimitCheck } from "@/lib/rate-limit";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const AcceptInviteSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
  invite_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  // MAINTENANCE_MODE freezes writes app-wide during an incident. Every
  // server action honours it; the API routes did not, so a declared freeze
  // stopped the UI and left the endpoints behind it writing. Reads are
  // deliberately unaffected — during an incident you want to look at data,
  // you just do not want it changing under you.
  if (isMaintenanceMode()) {
    return NextResponse.json(
      { error: "The app is in read-only maintenance mode. Try again shortly." },
      { status: 503 },
    );
  }
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

  // Consume the invitation with a compare-and-swap. The invitee is not an
  // admin of this tenant, so the RLS-bound client's UPDATE matched 0 rows
  // silently (invitations only have an admin write policy) — the invite
  // stayed pending and the SAME link could be accepted again and again,
  // inserting a duplicate user_profiles row each time. Do the write with the
  // admin client, gated on `status = 'pending'`, and require exactly one row
  // to change: the first accept wins, any replay/race gets 0 rows and stops.
  const admin = await createAdminClient();
  const { data: consumed, error: updateError } = await admin
    .from("invitations")
    .update({ status })
    .eq("id", invite_id)
    .eq("status", "pending")
    .select("id");

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

  if (!consumed || consumed.length === 0) {
    // Someone already accepted/rejected this invite (replay or race).
    return NextResponse.json(
      { success: false, message: "Invitation is no longer valid" },
      { status: 409 },
    );
  }

  // If rejected, we're done
  if (status === "rejected") {
    return NextResponse.json(
      { success: true, message: "Invite rejected successfully" },
      { status: 201 },
    );
  }

  // Accepted: create the user profile using SERVER-VALIDATED values.
  // Reuse an existing profile for this (user, tenant) if one is already
  // there, so a retried accept never leaves duplicate memberships.
  const { data: existingProfile } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("tenant_id", invitation.tenant_id)
    .maybeSingle();

  let profileData = existingProfile;
  if (!profileData) {
    const { data: inserted, error: profileError } = await supabase
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
      .select("id")
      .single();

    if (profileError || !inserted) {
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
    profileData = inserted;
  }

  // For advertiser invites we also need an advertisers row + wallet.
  // The signup path does this inline; existing-user acceptance did
  // not, leaving the advertiser stuck at the wallet page with a null
  // walletId. ensure_advertiser_and_wallet() is idempotent and only
  // acts for role=advertiser — safe to call unconditionally.
  // ── ON THE SERVICE CLIENT, NOT THE CALLER'S ──────────────────────
  //
  // ensure_advertiser_and_wallet is SECURITY DEFINER, takes any
  // user_profiles.id, and checks NOTHING about who is asking -- it reads
  // that profile, creates the advertiser and wallet rows in that
  // profile's tenant, and returns both ids. With execute granted to
  // `authenticated`, any signed-in advertiser could POST another
  // tenant's profile id and be handed that advertiser's advertiser_id
  // and wallet_id: the two parameters nearly every money RPC takes.
  //
  // Both routes that legitimately call it are server-side, so it moves
  // to the service client and the grant to `authenticated` is revoked
  // (20260920210000). That closes the hole without rewriting a live
  // function body, which is the part that has gone wrong here before.
  const { error: bootstrapError } = await admin.rpc(
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

  // Turn the invitation's plan into a subscription (best-effort).
  // Same, and here the service client is also the MORE correct path.
  // create_subscription_from_invite branches on auth.uid(): with a uid
  // it resolves the caller's advertiser with no tenant filter at all,
  // and with none it matches the invite's own email inside the invite's
  // own tenant. The second branch is the one that cannot be pointed at
  // somebody else's invite, so running as the service role is both
  // safer and closer to what this route means.
  const { error: subError } = await admin.rpc(
    "create_subscription_from_invite",
    { p_invite_id: invite_id },
  );
  if (subError) {
    console.error(
      "accept-invite subscription-from-invite failed:",
      safeErrorMessage(subError),
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
