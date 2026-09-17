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

  const profile = existingProfile
    ? profiles.find((p) => p.id === existingProfile)
    : profiles[0];

  redirect(profile?.role === "advertiser" ? "/dashboard" : "/wallets");
}
