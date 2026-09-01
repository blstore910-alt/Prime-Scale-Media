import ReconciliationView from "@/components/reconciliation/reconciliation-view";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Page() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;

  const { data: userData } = await supabase.auth.getUser();
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role")
    .eq("user_id", userData.user?.id ?? "");

  const profile = existingProfile
    ? (profiles?.find((p) => p.id === existingProfile) ?? profiles?.[0])
    : profiles?.[0];

  // Reconciliation is internal-only (employees record, super-admin
  // reviews). Non-admins never see it.
  if (profile?.role !== "admin") redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2 py-4">
        <ReconciliationView />
      </div>
    </div>
  );
}
