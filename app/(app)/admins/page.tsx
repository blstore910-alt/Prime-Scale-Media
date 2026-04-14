import AdminsTable from "@/components/admins/admins-table";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Page() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/auth/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, user_id, tenant_id")
    .eq("user_id", userData.user.id)
    .single();

  if (profileError || !profile?.tenant_id) {
    redirect("/dashboard");
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();

  const ownerId = tenant?.owner_id;

  if (ownerId !== userData.user.id) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
          <AdminsTable />
        </div>
      </div>
    </div>
  );
}
