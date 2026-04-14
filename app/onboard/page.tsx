import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Page() {
  const supabase = await createClient();

  const { data: invites, error: invitesError } = await supabase
    .from("invitations")
    .select();

  const { data: profiles, error: profilesError } = await supabase
    .from("user_profiles")
    .select();

  if (invitesError || profilesError)
    throw new Error(invitesError?.message || profilesError?.message);

  const pendingInvites = invites?.filter(
    (invite) => invite.status === "pending"
  );

  if (!profiles.length && !pendingInvites.length) redirect("/organization/new");
  if (!profiles.length && pendingInvites.length) redirect("/invite/list");

  return <div>Onboard Page</div>;
}
