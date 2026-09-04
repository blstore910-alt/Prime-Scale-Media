import InvoicesTable from "@/components/invoices/invoices-table";
import PsmInvoicesView from "@/components/invoices/psm-invoices-view";
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
    .select("*, advertiser:advertisers(*)")
    .eq("user_id", userData.user?.id);

  if (userError || profileError)
    throw new Error(userError?.message || profileError?.message);

  if (!profiles?.length) redirect("/onboard");

  const profile = existingProfile
    ? profiles.find((p) => p.id === existingProfile)
    : profiles[0];

  if (!profile) redirect("/onboard");

  // Advertiser & affiliate get the ported mockup view inside the PSM
  // shell; admins keep the full shadcn table (advertiser/company cols,
  // create-invoice) in their current shell.
  if (profile.role === "advertiser" || profile.role === "affiliate") {
    return <PsmInvoicesView />;
  }

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
