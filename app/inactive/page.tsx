import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import InactiveContent from "@/components/inactive/inactive-content";
import { isLockedOut } from "@/lib/auth/locked-out";

export default async function InactivePage() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/auth/login");
  }

  const { data: profiles, error: profileError } = await supabase
    .from("user_profiles")
    .select(
      // Explicit columns, NOT advertisers(*) — see
      // lib/types/advertiser-columns.ts for what that leaked and why a
      // literal list is the only thing PostgREST type inference accepts.
      "*, tenant:tenants(*), advertiser:advertisers(id, user_id, tenant_id, profile_id, tenant_client_code, startup_fee, fee_status, airtable, created_at, updated_at)",
    )
    .eq("user_id", user.id);

  if (profileError || !profiles || !profiles.length) {
    redirect("/onboard");
  }

  const profile = existingProfile
    ? profiles?.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];

  // ── THIS PAGE IS FOR PEOPLE WHO ARE ACTUALLY SWITCHED OFF ───────────
  //
  // /inactive sits OUTSIDE the (app) group, so it never passes that
  // layout's role and status gate, and the middleware only checks that a
  // session exists. So any signed-in advertiser who typed the path got
  // the page — and the page renders the admin top-ups table.
  //
  // A route that is not behind the gate has to carry its own.
  // ── THE SAME RULE AS THE GATE THAT SENDS PEOPLE HERE ─────────────
  //
  // This said `status !== "active"` while the (app) layout locks on a
  // named list. Any status outside both -- `pending`, `trial`, whatever
  // a later migration adds -- meant the app worked normally AND this
  // page told the same person they had been deactivated.
  const isInactive = isLockedOut(profile);
  if (!isInactive) redirect("/dashboard");

  return <InactiveContent user={user} profile={profile} />;
}
