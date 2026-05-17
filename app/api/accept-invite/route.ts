import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Malformed JSON body" },
      { status: 400 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { status, invite_id } = body as any;

  if (!status || !invite_id) {
    return NextResponse.json(
      { success: false, message: "Missing required fields" },
      { status: 400 },
    );
  }

  // Validate status is allowed
  if (status !== "accepted" && status !== "rejected") {
    return NextResponse.json(
      { success: false, message: "Invalid status value" },
      { status: 400 },
    );
  }

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
    console.error("Failed to update invitation:", updateError);
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
    console.error("Failed to create profile:", profileError);
    return NextResponse.json(
      {
        success: false,
        message: "An error occurred while creating user profile",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: "Invite accepted and user profile created",
    },
    { status: 201, headers: { "Set-Cookie": `profile=${profileData.id}` } },
  );
}
