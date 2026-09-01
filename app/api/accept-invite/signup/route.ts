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

  // Must not be already used
  if (validInvite.status === "accepted" || validInvite.status === "rejected") {
    return NextResponse.json(
      { success: false, message: "Invitation has already been used" },
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

    const { error: inviteUpdateError } = await supabase
      .from("invitations")
      .update({ status: "accepted" })
      .eq("id", validInvite.id)
      .select();

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
      return NextResponse.json(
        { success: false, message: "Server error" },
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
      { success: true, message: "User created", redirectUrl },
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
