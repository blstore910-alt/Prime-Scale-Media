import { getSessionProfiles, getSessionUser } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Keep customers inside the shell they came from.
 *
 * WHY. `/profile`, `/notifications` and `/help` are real pages with no
 * guard at all, and AdvertiserLayout and AffiliateLayout render
 * `{children}` bare — the whole shell (sidebar, topbar, bottom nav)
 * lives INSIDE adv-app.tsx and aff-app.tsx, which only `/dashboard` and
 * `/my-referrals` render.
 *
 * So an advertiser who types one of those paths, or follows `/help`'s
 * own Link to `/profile`, lands on a page with no navigation of any
 * kind. Browser Back is the only way out. `/invoices` already redirects
 * for exactly this reason; these three did not.
 *
 * Admins keep them: AdminLayout does mount a shell around its children.
 */
export async function redirectCustomersToTheirShell(view: string) {
  const { data: userData } = await getSessionUser();
  if (!userData?.user) return;

  const { data: profiles } = await getSessionProfiles(userData.user.id);
  if (!profiles?.length) return;

  const cookieStore = await cookies();
  const chosen = cookieStore.get("profile_id")?.value;
  const profile =
    (chosen ? profiles.find((p) => p.id === chosen) : null) ?? profiles[0];

  const role = (profile as { role?: string } | undefined)?.role;
  if (role === "advertiser") redirect(`/dashboard?view=${view}`);
  // The affiliate app does not read ?view=, so there is one destination.
  if (role === "affiliate") redirect("/my-referrals");
}
