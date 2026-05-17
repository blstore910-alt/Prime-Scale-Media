import { createAdminClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createAdminClient();
  const body = await request.json();

  const {
    email,
    password,
    firstName,
    lastName,
    invite,
    referral_status,
    referred_by,
    heard_from,
  } = body;

  // Minimum required fields
  if (!email || !password || !firstName || !lastName || !invite?.token) {
    return NextResponse.json(
      { success: false, message: "Missing required fields" },
      { status: 400 },
    );
  }

  if (password.length < 12) {
    return NextResponse.json(
      { success: false, message: "Password must be at least 12 characters" },
      { status: 400 },
    );
  }

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
      console.error("Error creating user:", createError);
      return NextResponse.json(
        { success: false, message: "Failed to create user" },
        { status: 500 },
      );
    }

    if (!data.user?.id) {
      console.error("No user id returned after createUser");
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
      console.error("Error creating user profile:", profileError);
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
      console.error("Error updating invitation status:", inviteUpdateError);
      return NextResponse.json(
        { success: false, message: "Failed to update invitation status" },
        { status: 500 },
      );
    }

    const { data: advertiserData, error: advertiserError } = await supabase
      .from("advertisers")
      .select()
      .eq("profile_id", profileData.id)
      .single();

    if (advertiserError) {
      console.error(
        "Failed to fetch advertiser for affiliate creation:",
        advertiserError,
      );
      return NextResponse.json(
        { success: false, message: "Server error" },
        { status: 500 },
      );
    }

    const generatedRef = `${Date.now().toString().slice(-6)}${Math.floor(
      1000 + Math.random() * 9000,
    )}`;
    const { error: walletError } = await supabase.from("wallets").insert({
      advertiser_id: advertiserData.id,
      tenant_id,
      reference_no: generatedRef,
    });

    if (walletError) {
      console.error("Failed to create wallet:", walletError);
      return NextResponse.json(
        { success: false, message: "Server error" },
        { status: 500 },
      );
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      console.error("Failed to sign in user:", signInError);
      return NextResponse.json(
        { success: false, message: "User created but failed to sign in" },
        { status: 500 },
      );
    }

    const redirectUrl = new URL("/dashboard", request.url);
    const res = NextResponse.json(
      { success: true, message: "User created and signed in", redirectUrl },
      { status: 200 },
    );

    res.headers.set("Set-Cookie", `profile=${profileData.id}`);

    return res;
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 },
    );
  }
}
