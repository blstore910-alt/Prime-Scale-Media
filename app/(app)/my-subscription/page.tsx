import { resolveActiveProfile } from "@/lib/active-profile";
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
  // .single() errored for anybody holding two profiles and sent them to
  // /onboard as though they had never signed up. See lib/active-profile.ts.
  const { profile } = await resolveActiveProfile();

  if (!profile) redirect("/onboard");
  redirect(profile.role === "advertiser" ? "/dashboard" : "/subscriptions");
}
