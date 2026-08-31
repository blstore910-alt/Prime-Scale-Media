import InviteAccept from "@/components/invites/invite-accept";
import InviteExpired from "@/components/invites/invite-expired";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

type PageProps = {
  searchParams: Promise<{ token: string }>;
};
export default async function AcceptInvite({ searchParams }: PageProps) {
  const { token } = await searchParams;

  if (!token) throw new Error("Invalid or missing invite token.");

  const supabase = await createClient();

  // P1-9 fix: getUser() verifies the JWT server-side; getSession() only reads cookie
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect(`/auth/sign-up?token=${token}`);
  }

  const { data, error } = await supabase
    .from("invitations")
    .select("*, tenant:tenants(*), sender_profile:user_profiles(*)")
    .eq("token", token)
    .maybeSingle();

  if (error) throw new Error(error.message);

  // Case-insensitive email match (the RLS policy compares lower(email)),
  // so a case difference between the invite and the account doesn't
  // wrongly bounce a valid invitee to /dashboard.
  if (
    !data ||
    userData.user.email?.toLowerCase() !== data.email?.toLowerCase()
  ) {
    redirect("/dashboard");
  }

  if (new Date(data.expires_at) < new Date()) {
    return (
      <Suspense fallback={null}>
        <InviteExpired />
      </Suspense>
    );
  }

  return <InviteAccept sender={data.sender_profile} invite={data} />;
}
