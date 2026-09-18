import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Which profile is this person acting as right now.
 *
 * ONE PERSON CAN HOLD SEVERAL PROFILES — an advertiser profile and an
 * affiliate profile, the same email in two tenants — and the app is built
 * for that: `actions/user-actions.ts` is a profile switcher, and the
 * `profile_id` cookie says which one is in use. Every guard that matters
 * reads the LIST and picks by cookie.
 *
 * Two pages did not. They read `.single()`, which is not "the first row"
 * — it is an ERROR when there is more than one, returning null data. On
 * /my-referrals that made `allowed` false, which redirects to "/", which
 * redirects to /dashboard, which for an affiliate cookie redirects back to
 * /my-referrals: a loop with no exit, taking the whole app down for that
 * person rather than one page. On /my-subscription it dropped them on
 * /onboard as though they had never signed up.
 *
 * So the resolution lives here once, and the pages call it. A rule written
 * in four places is a rule that will be right in three of them.
 */

export type ActiveProfile = { id: string; role: string | null };

export async function resolveActiveProfile(): Promise<{
  userId: string | null;
  profile: ActiveProfile | null;
}> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? null;
  if (!userId) return { userId: null, profile: null };

  const cookieStore = await cookies();
  const wanted = cookieStore.get("profile_id")?.value;

  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role")
    .eq("user_id", userId);

  const list = (profiles ?? []) as ActiveProfile[];
  // `?? list[0]` matters: a profile_id cookie left behind by a PREVIOUS
  // user of the same browser is httpOnly, so signing out in the client
  // could not clear it, and without the fallback it resolves to nothing.
  const profile = wanted
    ? list.find((p) => p.id === wanted) ?? list[0] ?? null
    : list[0] ?? null;

  return { userId, profile };
}
