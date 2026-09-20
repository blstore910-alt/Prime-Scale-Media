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
    .select("id, role")
    .eq("user_id", userData.user.id)
    .eq("tenant_id", invitation.tenant_id)
    .maybeSingle();

  // ── A SECOND ROLE IN THE SAME TENANT IS NOT SOMETHING WE CAN DO ───
  //
  // send-invite only blocks a duplicate on (email, tenant, role), so an
  // existing advertiser CAN be invited as an affiliate in the same
  // tenant. This route then found the existing profile, reused it,
  // never applied the role, marked the invitation accepted and returned
  // "Invite accepted and user profile created". The admin's Invites
  // screen said accepted and nothing had changed -- and
  // trg_one_profile_per_tenant makes that permanent.
  //
  // Refusing here says the true thing and leaves the invitation alone,
  // so somebody can still decide what to do with it.
  if (
    existingProfile &&
    String(existingProfile.role ?? "").toLowerCase() !==
      String(invitation.role ?? "").toLowerCase()
  ) {
    await admin
      .from("invitations")
      .update({ status: "pending" })
      .eq("id", invite_id)
      .eq("status", "accepted");
    return NextResponse.json(
      {
        success: false,
        message: `You are already in this organisation as ${existingProfile.role}. One person holds one role per organisation, so this ${invitation.role} invitation cannot be accepted on this account — ask us to change your role instead.`,
      },
      { status: 409 },
    );
  }

  let profileData = existingProfile;
  if (!profileData) {
    // ── THE SERVICE ROLE WRITES THIS ROW, LIKE THE SIBLING ROUTE ────
    //
    // This insert ran on the CALLER's RLS-bound client, so auth.uid()
    // was set — and `_guard_user_profile_role` allows a profile INSERT
    // only when the role is null or 'advertiser', unless the caller is
    // tenants.owner_id. So an AFFILIATE invitation could never be
    // accepted by somebody who already had an account: 42501, "Only
    // the tenant owner can set/change a profile role", every time, for
    // ever. The invitation is put back and the next press fails
    // identically; no other screen creates that profile.
    //
    // /api/accept-invite/signup does the same insert on
    // createAdminClient(), which is why the SAME invitation works for a
    // brand-new user. Nothing is loosened here: the invitation was
    // matched to this caller's own email above, the tenant and role
    // come from that row and never from the request body, and an
    // existing membership is reused rather than duplicated.
    const { data: inserted, error: profileError } = await admin
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
        // The signup route writes these three and this one did not, so
        // an existing user accepting an invitation that carries an
        // affiliate_id never got referral_status='referred' -- which is
        // what the customer's own details sheet renders.
        referral_status: invitation.affiliate_id ? "referred" : null,
        referred_by: invitation.affiliate_id ?? null,
      })
      .select("id, role")
      .single();

    if (profileError || !inserted) {
      console.error(
        "accept-invite profile insert failed:",
        safeErrorMessage(profileError),
      );
      // ── PUT THE INVITATION BACK ────────────────────────────────────
      //
      // The invitation was consumed sixty lines above, on the admin
      // client, and the profile insert runs on the CALLER's RLS-bound
      // one. When this half fails the customer is locked out for good:
      // pressing Accept again renders InviteExpired; /onboard finds no
      // profile AND no pending invite, so it sends them to
      // /organization/new -- a live tenant-creation form; and the
      // admin's Invites screen says "Accepted", so nobody re-issues.
      //
      // Nothing else has happened yet, so handing the invitation back
      // makes the retry the customer will obviously attempt work. The
      // sibling signup route gets the ORDER right -- profile first,
      // then the compare-and-swap -- and explains why; this one is the
      // existing-user path and could not be reordered as cheaply.
      const { error: restoreError } = await admin
        .from("invitations")
        .update({ status: "pending" })
        .eq("id", invite_id)
        .eq("status", "accepted");
      if (restoreError) {
        console.error(
          "accept-invite could not hand the invitation back:",
          safeErrorMessage(restoreError),
        );
      }
      return NextResponse.json(
        {
          success: false,
          message:
            "We couldn't finish setting up your account. Your invitation is still valid — press Accept again, and tell us if it happens twice.",
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
    // ── AND PUT THE INVITATION BACK ─────────────────────────────────
    //
    // The profile-insert failure fifty lines up restores the
    // invitation and this branch did not, so a failed bootstrap left
    // it `accepted`: /invite/accept then renders InviteExpired and
    // /invite/list filters it out, while the account has a profile and
    // no advertisers row and no wallet. ensure_advertiser_and_wallet
    // has since been revoked from `authenticated`, so nothing short of
    // the SQL editor could finish it. Restoring the row makes the next
    // press a real retry.
    await admin
      .from("invitations")
      .update({ status: "pending" })
      .eq("id", invite_id)
      .eq("status", "accepted");
    return NextResponse.json(
      {
        success: false,
        message:
          "We could not finish setting up your account. Your invitation is still valid — press Accept again.",
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
