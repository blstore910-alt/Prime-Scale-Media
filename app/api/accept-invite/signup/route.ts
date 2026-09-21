import { isMaintenanceMode } from "@/actions/_shared";
import { parseJsonBody, safeErrorMessage } from "@/lib/http";
import { callerIp, LIMITS, rateLimitCheck } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const SignupSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(12).max(200),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  invite: z.object({
    token: z.string().min(8).max(200),
    id: z.string().uuid().optional(),
    affiliate_id: z.string().uuid().nullable().optional(),
  }),
  referral_status: z.string().max(60).nullable().optional(),
  referred_by: z.string().max(200).nullable().optional(),
  heard_from: z.string().max(200).nullable().optional(),
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
  const supabase = await createAdminClient();

  const allowed = await rateLimitCheck(
    LIMITS.signup,
    `ip:${callerIp(request)}`,
  );
  if (!allowed) {
    return NextResponse.json(
      { success: false, message: "Too many signup attempts — try again later" },
      { status: 429 },
    );
  }

  const parsed = await parseJsonBody(request, SignupSchema);
  if (!parsed.ok) return parsed.response;
  const {
    email,
    password,
    firstName,
    lastName,
    invite,
    referral_status,
    referred_by,
    heard_from,
  } = parsed.data;

  // ─────────────────────────────────────────
  // SERVER-SIDE INVITE VALIDATION (P0-2 fix)
  // Do NOT trust body for tenant_id, role, or invite details.
  // Re-fetch from invitations table using the token.
  // ─────────────────────────────────────────
  const { data: validInvite, error: inviteFetchError } = await supabase
    .from("invitations")
    .select("id, email, role, tenant_id, status, expires_at, affiliate_id, token")
    .eq("token", invite.token)
    .maybeSingle();

  if (inviteFetchError || !validInvite) {
    return NextResponse.json(
      { success: false, message: "Invalid or expired invitation" },
      { status: 403 },
    );
  }

  // Email must match the invite
  if (validInvite.email?.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json(
      { success: false, message: "Email does not match invitation" },
      { status: 403 },
    );
  }

  // Must not be expired
  if (new Date(validInvite.expires_at) < new Date()) {
    return NextResponse.json(
      { success: false, message: "Invitation has expired" },
      { status: 403 },
    );
  }

  // Must still be pending. Checking only for accepted/rejected let a
  // CANCELLED (or otherwise non-pending) invite be redeemed — cancelInvitation
  // sets status='cancelled' without touching expires_at, so the original link
  // stayed live inside the expiry window. The existing-user path already
  // requires 'pending'; match it here.
  if (validInvite.status !== "pending") {
    return NextResponse.json(
      { success: false, message: "This invitation is no longer valid" },
      { status: 403 },
    );
  }

  // Use SERVER-VALIDATED values, ignore body's tenant_id/role
  const tenant_id = validInvite.tenant_id;
  const role = validInvite.role;
  const affiliate_id = validInvite.affiliate_id;

  try {
    const { data, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: {
        display_name: `${firstName} ${lastName}`,
        first_name: firstName,
        last_name: lastName,
      },
      email_confirm: true,
    });

    if (createError) {
      const msg = safeErrorMessage(createError);
      console.error("signup createUser failed:", msg);
      const alreadyExists = /already|registered|exists|duplicate/i.test(msg);
      return NextResponse.json(
        {
          success: false,
          message: alreadyExists
            ? "This email already has an account — log in instead of accepting the invite."
            : `Could not create the account: ${msg}`,
        },
        { status: alreadyExists ? 409 : 500 },
      );
    }

    if (!data.user?.id) {
      console.error("signup createUser returned no id");
      return NextResponse.json(
        { success: false, message: "Failed to determine created user id" },
        { status: 500 },
      );
    }

    const { data: profileData, error: profileError } = await supabase
      .from("user_profiles")
      .insert({
        user_id: data.user.id,
        tenant_id,
        role,
        full_name: `${firstName} ${lastName}`,
        email,
        referral_status: affiliate_id ? "referred" : referral_status,
        referred_by: affiliate_id ? null : referred_by,
        heard_from: affiliate_id ? null : heard_from,
      })
      .select()
      .single();

    if (profileError) {
      console.error(
        "signup profile insert failed:",
        safeErrorMessage(profileError),
      );
      return NextResponse.json(
        { success: false, message: "Failed to create user profile" },
        { status: 500 },
      );
    }

    // Compare-and-swap, and count the rows. This had a .select() whose
    // rows were destructured away, so a zero-row update returned 200
    // { success: true } with the invitation still 'pending' — and the
    // status check above it is a SEPARATE read, with auth.admin.createUser
    // in between, so two signups racing the same link both pass it.
    //
    // The sibling route (app/api/accept-invite/route.ts) was fixed for
    // exactly this and carries the explanation; the signup variant got
    // neither the CAS nor the row check. Email uniqueness in auth.users
    // bounds the damage to a stuck-pending invitation that stays
    // re-runnable, which is still a row on the admin's Invites screen that
    // does not match reality.
    const { data: consumedInvite, error: inviteUpdateError } = await supabase
      .from("invitations")
      .update({ status: "accepted" })
      .eq("id", validInvite.id)
      .eq("status", "pending")
      .select("id");

    if (!inviteUpdateError && (consumedInvite ?? []).length !== 1) {
      // Somebody else consumed it between the check and the write. The
      // account may already exist from that first pass, so this is not an
      // error to shout about — it is a replay, and it stops here.
      return NextResponse.json(
        {
          success: false,
          message:
            "That invitation has already been used. Try signing in instead.",
        },
        { status: 409 },
      );
    }

    if (inviteUpdateError) {
      console.error(
        "signup invite update failed:",
        safeErrorMessage(inviteUpdateError),
      );
      return NextResponse.json(
        { success: false, message: "Failed to update invitation status" },
        { status: 500 },
      );
    }

    // Idempotent: creates the advertisers + wallets row if a trigger
    // hasn't already. Same helper the existing-user accept path uses,
    // so the two branches stay consistent instead of drifting.
    const { error: bootstrapError } = await supabase.rpc(
      "ensure_advertiser_and_wallet",
      { p_profile_id: profileData.id },
    );
    if (bootstrapError) {
      console.error(
        "signup advertiser/wallet bootstrap failed:",
        safeErrorMessage(bootstrapError),
      );
      // ── AND PUT THE INVITATION BACK ─────────────────────────────
      //
      // The compare-and-swap to `accepted` runs fifty lines up, BEFORE
      // this call. So a failure here used to burn the invitation: an
      // auth user and a user_profiles row exist, there is no
      // `advertisers` row and no wallet, /invite/accept renders
      // InviteExpired, and the admin's Invites screen says Accepted so
      // nobody reissues it. Logging in lands them on a dashboard whose
      // queries are all disabled -- a permanent shimmer over "Your
      // wallet is still being set up. Reload in a moment."
      //
      // The sibling route at app/api/accept-invite/route.ts restores it
      // and says why; this one never got the same treatment. Restoring
      // makes the next press a real retry.
      await supabase
        .from("invitations")
        .update({ status: "pending" })
        .eq("id", validInvite.id)
        .eq("status", "accepted");
      return NextResponse.json(
        {
          success: false,
          message:
            "We could not finish setting up your account. Your invitation is still valid — press Join again.",
        },
        { status: 500 },
      );
    }

    // Turn the invitation's plan into a live subscription (best-effort —
    // a failure here shouldn't strand a created account; the admin can
    // add the sub manually). monthly_fee = 0 → no sub.
    const { error: subError } = await supabase.rpc(
      "create_subscription_from_invite",
      { p_invite_id: validInvite.id },
    );
    // ── AND IT IS REPORTED, NOT JUST LOGGED ─────────────────────────
    //
    // Best-effort is right -- a plan that did not attach must not
    // strand a created account -- but nothing surfaced it afterwards,
    // so the form toasted "Welcome! Your account is ready." over a
    // write that failed.
    //
    // What that customer then sees: the Plan tile reads "No
    // subscription", Request-an-ad-account is dead with the reason
    // "Your plan has to be active first", and the minimum top-up drops
    // to zero. A green tick over a failed write, on the only screen
    // that answers "what am I paying".
    //
    // The account IS created, so this stays a 200 -- but the client is
    // told, and tells them.
    const planAttached = !subError;
    if (subError) {
      console.error(
        "signup subscription-from-invite failed:",
        safeErrorMessage(subError),
      );
    }

    // NOTE: sign-in happens CLIENT-side after this returns (the browser
    // needs the auth cookies). Signing in here on the admin/service-role
    // client set no browser session and only risked a spurious 500.
    const redirectUrl = new URL("/dashboard", request.url);
    const res = NextResponse.json(
      { success: true, message: "User created", redirectUrl, planAttached },
      { status: 200 },
    );

    res.cookies.set("profile_id", profileData.id, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });

    return res;
  } catch (err) {
    console.error("accept-invite/signup error:", safeErrorMessage(err));
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 },
    );
  }
}
