import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// /my-subscription is a REDIRECT, and only that.
//
// It used to render MySubscriptionView below two redirects that between them
// covered every role — advertisers to the single-page app where billing is a
// view, everyone else to /subscriptions. Nothing could reach the component,
// which is the same shape /wallet had. See docs/ROUTE_MAP.md: an importer is
// not a route.
//
// The route stays because old links point at it.
export default async function Page() {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user?.user?.id)
    .single();

  if (!profile) redirect("/onboard");
  redirect(profile.role === "advertiser" ? "/dashboard" : "/subscriptions");
}
