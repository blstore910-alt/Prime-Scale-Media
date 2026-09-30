import { isMaintenanceMode } from "@/actions/_shared";
import { isTenantOwner } from "@/lib/auth/is-tenant-owner";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

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

  if (password.length < 12) {
    return NextResponse.json(
      { success: false, message: "Password must be at least 12 characters" },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;

  let profileQuery = supabase
    .from("user_profiles")
    // is_active and status too. This authorised purely on
    // `tenants.owner_id === user.id` and never read either flag, so a
    // DEACTIVATED owner profile could still mint new admin accounts with
    // the service role. apiRequireOwner inherits that check; this route
    // hand-rolls its own and skipped it.
    .select("id, tenant_id, is_active, status")
    .eq("user_id", userData.user.id);

  if (existingProfile) {
    profileQuery = profileQuery.eq("id", existingProfile);
  }

  const { data: profile, error: profileError } =
    await profileQuery.maybeSingle();

  if (
    profile &&
    ((profile as { is_active?: boolean }).is_active === false ||
      ((profile as { status?: string }).status ?? "active") === "inactive")
  ) {
    return NextResponse.json({ error: "Account inactive" }, { status: 403 });
  }

  if (profileError || !profile?.tenant_id) {
    return NextResponse.json(
      { success: false, message: "Failed to load profile" },
      { status: 403 },
    );
  }

  // De tenant-lees die hier stond is weg: isTenantOwner() doet hem
  // zelf, en dan ook meteen de tweede -- `tenant_owners`. Een kopie
  // ernaast laten staan is precies hoe de twee uit elkaar liepen.

  // ── DE OWNERSET, NIET DE KOLOM ──────────────────────────────────
  //
  // `tenants.owner_id` is EEN eigenaar; sinds plak 143 is
  // eigenaarschap een verzameling (`tenant_owners`), want de eigenaar
  // heeft een compagnon. isTenantOwner() kijkt naar allebei.
  //
  // Deze route maakt een ADMIN aan, dus de tweede eigenaar kon geen
  // collega toevoegen -- en dat is de route waarmee je je eigen team
  // inricht. Gevonden op 30-09 door de test hiernaast uit te breiden
  // naar de hernoemde vorm (`ownerId !== ...` in plaats van
  // `owner_id !== ...`); drie andere plekken hadden dezelfde fout.
  if (
    !(await isTenantOwner(
      supabase,
      profile.tenant_id,
      // Allebei: auth-id en profiel-id verschillen voor iemand met
      // een profiel in meer dan een tenant, en de twee bestaande
      // guards waren het oneens over welke getoetst moest worden.
      userData.user.id,
      profile.id,
    ))
  ) {
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
