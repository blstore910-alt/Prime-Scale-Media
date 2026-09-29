import { getSessionProfiles, getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type ProfileRecord = {
  id: string;
  role: string;
  tenant_id: string | null;
  user_id: string;
};

type TenantRecord = {
  owner_id: string | null;
};

/**
 * ⚠️ DEACTIVATED KEEPS THE ROLE AND LOSES THE ACCESS.
 *
 * This guard tested ownership and nothing else, while require-admin.ts
 * eight lines away tests is_active and status, and apiRequireAdmin does
 * too. So a deactivated OWNER kept /audit, /reconciliation, /commissions,
 * /activity-logs, /invites, /admins, /affiliates and all of /settings —
 * every write was refused downstream, and the reads were not. The audit
 * log and the books are exactly what you take away first.
 */
/**
 * ── AND A SILENT BOUNCE IS NOT A REFUSAL ────────────────────────────
 *
 * Walked on production 27-09 with the tenant's first employee admin.
 * /settings/plans, /settings/finance, /affiliates, /admins and
 * /reconciliation all did the same thing: land on /dashboard, no
 * message, no toast, nothing. The boundary holds -- not one of them
 * leaked -- but the person is simply somewhere else now.
 *
 * That matters because the app SENDS them here. verify-topup-dialog
 * tells an admin verifying a top-up with no supplier fee to go to
 * "Settings -> Ad account types"; the request-fee notice points at
 * Settings -> Finance -> Plans. They follow the instruction and end up
 * on their own dashboard with no idea why.
 *
 * So the redirect carries WHY, and the dashboard says it once. A
 * query parameter is enough: nothing secret is in it, and it survives
 * the server-side redirect that a toast cannot.
 */
export async function requireSuperAdmin(redirectTo = "/dashboard") {
  // Cached per render, so this is free when the (app) layout already ran it.
  // See lib/auth/session.ts.
  const { data: userData, error: userError } = await getSessionUser();

  if (userError || !userData.user) {
    redirect("/auth/login");
  }

  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;

  const { data: profiles, error: profileError } = await getSessionProfiles(
    userData.user.id,
  );

  if (profileError) {
    throw new Error(profileError.message);
  }

  const profileList = (profiles ?? []) as ProfileRecord[];
  if (!profileList.length) {
    redirect("/onboard");
  }

  const profile = existingProfile
    ? profileList.find((item) => item.id === existingProfile) ?? profileList[0]
    : profileList[0];

  if (!profile?.tenant_id || profile.role !== "admin") {
    redirect(redirectTo);
  }

  // The check this guard did not have. See the note on the function.
  if (
    (profile as { is_active?: boolean | null }).is_active === false ||
    ((profile as { status?: string | null }).status ?? "active") === "inactive"
  ) {
    redirect("/inactive");
  }

  const supabase = await createClient();
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();

  if (tenantError) {
    throw new Error(tenantError.message);
  }

  const ownerId = (tenant as TenantRecord | null)?.owner_id;
  const authUserId = userData.user.id;
  const profileUserId = profile.user_id;

  let isSuperAdmin =
    !!ownerId && (ownerId === authUserId || ownerId === profileUserId);

  // ── THERE CAN BE MORE THAN ONE OWNER ───────────────────
  //
  // `tenants.owner_id` holds exactly one uuid, and the owner has a
  // business partner. Sharing one login would work and would also
  // make the audit log useless: every approval and every rate change
  // under one name, on the day "who did this" becomes the first
  // question. So ownership moved into `tenant_owners` (plak 143), one
  // row per owner, and this guard reads both.
  //
  // The column still wins on its own — it is checked first and stays
  // filled — so nothing that already worked stops working. The table
  // only ever ADDS people.
  //
  // Before plak 143 the table does not exist and the select throws;
  // `error` is then set, `isSuperAdmin` keeps the value the column
  // gave it, and the page behaves exactly as it did yesterday. A
  // missing table must not let anybody in, and must not lock the
  // owner out either.
  if (!isSuperAdmin) {
    const { data: owners, error: ownersError } = await supabase
      .from("tenant_owners")
      .select("user_id")
      .eq("tenant_id", profile.tenant_id)
      .in(
        "user_id",
        [authUserId, profileUserId].filter(Boolean) as string[],
      )
      .limit(1);
    if (!ownersError && (owners ?? []).length > 0) isSuperAdmin = true;
  }

  if (!isSuperAdmin) {
    // Only decorate the default landing. A caller that named its own
    // destination meant it, and appending to an arbitrary path risks
    // stepping on a query string it already carries.
    redirect(
      redirectTo === "/dashboard" ? "/dashboard?denied=owner" : redirectTo,
    );
  }

  return { user: userData.user, profile };
}
