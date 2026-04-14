import { createAdminClient, createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const fullName = body?.full_name ?? body?.fullName;
  const email = body?.email;
  const password = body?.password;

  if (!fullName || !email || !password) {
    return NextResponse.json(
      { success: false, message: "Missing required fields" },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;

  let profileQuery = supabase
    .from("user_profiles")
    .select("id, tenant_id")
    .eq("user_id", userData.user.id);

  if (existingProfile) {
    profileQuery = profileQuery.eq("id", existingProfile);
  }

  const { data: profile, error: profileError } =
    await profileQuery.maybeSingle();

  if (profileError || !profile?.tenant_id) {
    return NextResponse.json(
      { success: false, message: "Failed to load profile" },
      { status: 403 },
    );
  }

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();

  if (tenantError) {
    return NextResponse.json(
      { success: false, message: "Failed to load tenant" },
      { status: 403 },
    );
  }

  const ownerId = tenant?.owner_id;
  if (!ownerId || ownerId !== userData.user.id) {
    return NextResponse.json(
      { success: false, message: "Forbidden" },
      { status: 403 },
    );
  }

  const adminClient = await createAdminClient();
  const { data: createdUser, error: createError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: fullName,
      },
    });

  if (createError) {
    return NextResponse.json(
      { success: false, message: createError.message },
      { status: 500 },
    );
  }

  if (!createdUser.user?.id) {
    return NextResponse.json(
      { success: false, message: "Failed to determine created user id" },
      { status: 500 },
    );
  }

  const { error: insertError } = await adminClient
    .from("user_profiles")
    .insert({
      full_name: fullName,
      user_id: createdUser.user.id,
      role: "admin",
      status: "active",
      email,
      tenant_id: profile.tenant_id,
      is_active: true,
    });

  if (insertError) {
    return NextResponse.json(
      { success: false, message: insertError.message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { success: true, userId: createdUser.user.id },
    { status: 200 },
  );
}
