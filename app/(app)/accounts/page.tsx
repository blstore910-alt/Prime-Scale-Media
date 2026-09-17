import AccountsRouter from "@/components/account/accounts-router";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * Ad accounts, for the desk.
 *
 * This page had NO server guard at all. Its only gate was
 * AccountsRouter — a client component that redirects `role === "advertiser"`
 * in a useEffect — so an AFFILIATE, who is not an advertiser, rendered the
 * full admin accounts table with its action controls. No rows leaked (RLS
 * gives an affiliate none) and every write behind those buttons is refused
 * server-side, but a role should not reach a screen at all because the
 * check it fails happens to be about a different role.
 *
 * Not `requireAdmin` outright: an advertiser legitimately arrives here from
 * their own app's links, and the router sends them to /dashboard. So the
 * rule is: admins stay, advertisers are handed to the router, everybody
 * else goes home.
 */
export default async function Page() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/auth/login");

  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", userData.user.id);

  const roles = (profiles ?? []).map((p) => (p.role ?? "").toLowerCase());
  const allowed = roles.some((r) => r === "admin" || r === "advertiser");
  if (!allowed) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <AccountsRouter />
      </div>
    </div>
  );
}
