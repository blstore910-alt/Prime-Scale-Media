import InvoicesTable from "@/components/invoices/invoices-table";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Page() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const { data: profiles, error: profileError } = await supabase
    .from("user_profiles")
    .select(
      // Explicit columns, NOT advertisers(*) — see
      // lib/types/advertiser-columns.ts.
      "*, advertiser:advertisers(id, user_id, tenant_id, profile_id, tenant_client_code, startup_fee, fee_status, airtable, created_at, updated_at)",
    )
    .eq("user_id", userData.user?.id);

  if (userError || profileError)
    throw new Error(userError?.message || profileError?.message);

  if (!profiles?.length) redirect("/onboard");

  // ?? profiles[0], like every other route. The profile_id cookie is
  // httpOnly and survives a sign-out, so a browser a previous user has
  // been signed into hands the next one an id that is not theirs —
  // find() then returns undefined and a legitimate advertiser is sent to
  // /onboard to be told their account is not set up. /dashboard carries
  // a comment explaining exactly this; these two routes dropped it.
  const profile =
    (existingProfile ? profiles.find((p) => p.id === existingProfile) : null) ??
    profiles[0];

  if (!profile) redirect("/onboard");

  // Advertiser & affiliate get the ported mockup view inside the PSM
  // shell; admins keep the full shadcn table (advertiser/company cols,
  // create-invoice) in their current shell.
  // Advertiser & affiliate live in single-page apps where invoices are a
  // view; send them there. Admins keep the full table.
  if (profile.role === "advertiser") redirect("/dashboard");
  if (profile.role === "affiliate") redirect("/my-referrals");

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
          <InvoicesTable />
        </div>
      </div>
    </div>
  );
}
