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

  const { data: session } = await supabase.auth.getSession();

  if (!session.session) {
    redirect(`/auth/sign-up?token=${token}`);
  }

  const { data, error } = await supabase
    .from("invitations")
    .select("*, tenant:tenants(*), sender_profile:user_profiles(*)")
    .eq("token", token)
    .maybeSingle();

  if (session.session.user.email !== data?.email) {
    redirect("/dashboard");
  }

  if (error) throw new Error(error.message);

  if (new Date(data.expires_at) < new Date()) {
    return (
      <Suspense fallback={null}>
        <InviteExpired />
      </Suspense>
    );
  }

  return <InviteAccept sender={data.sender_profile} invite={data} />;
}
