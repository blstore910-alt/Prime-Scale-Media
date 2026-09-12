import PsmPromotions from "@/components/promotions/psm-promotions";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Page() {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user?.user?.id)
    .single();

  if (profile?.role !== "admin") redirect("/");

  return <PsmPromotions />;
}
