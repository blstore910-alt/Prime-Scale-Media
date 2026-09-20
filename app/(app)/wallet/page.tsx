import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// /wallet is a REDIRECT, and only that.
//
// It used to render a full WalletView below two redirects that between them
// covered every role — advertisers to the single-page app where the wallet
// is a view, everyone else to /wallets. So the component underneath could
// not be reached by anybody, and it had quietly drifted: it passed
// wallets.min_topup straight into the top-up dialog, which is the €300-floor
// -on-the-first-payment bug that lib/min-topup.ts exists to prevent.
//
// The route stays because old links and bookmarks point at it. The dead view
// is gone. See docs/ROUTE_MAP.md.
export default async function Page() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;

  const { data: userData } = await supabase.auth.getUser();
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role")
    .eq("user_id", userData.user?.id);

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

  // ?view=wallet, not the bare dashboard. /accounts, /billing and
  // /my-referrals were all given a named view so an old link lands where
  // it pointed; this one and /my-subscription were missed, so an
  // advertiser following a bookmark to their wallet arrived on the
  // Dashboard and had to find it again.
  redirect(profile?.role === "advertiser" ? "/dashboard?view=wallet" : "/wallets");
}
