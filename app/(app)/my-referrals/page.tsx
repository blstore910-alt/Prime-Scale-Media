import MyAffiliatesTable from "@/components/my-affiliates/my-affiliates-table";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Page() {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", user?.user?.id)
    .single();

  const isAdvertiser = profile?.role === "advertiser";

  if (!isAdvertiser) redirect("/");

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
          <MyAffiliatesTable />
        </div>
      </div>
    </div>
  );
}
