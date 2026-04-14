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
    tenant_id,
    role,
    invite,
    referral_status,
    referred_by,
    heard_from,
  } = body;

  if (
    !email ||
    !password ||
    !firstName ||
    !lastName ||
    !tenant_id ||
    !role ||
    !invite
  ) {
    return NextResponse.json(
      { success: false, message: "Missing required fields" },
      { status: 400 },
    );
  }

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
        referral_status: invite.affiliate_id ? "referred" : referral_status,
        referred_by: invite.affiliate_id ? null : referred_by,
        heard_from: invite.affiliate_id ? null : heard_from,
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

    const { error: inviteError } = await supabase
      .from("invitations")
      .update({ status: "accepted" })
      .eq("id", invite.id)
      .select();

    if (inviteError) {
      console.error("Error updating invitation status:", inviteError);
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
