import InviteSignUpForm from "@/components/invite-sign-up-form";
import InviteExpired from "@/components/invites/invite-expired";
import { SignUpForm } from "@/components/sign-up-form";
import { createClient } from "@/lib/supabase/server";
import { UserInvitation } from "@/lib/types/invite";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Suspense } from "react";

type PageProps = {
  searchParams: Promise<{ token?: string }>;
};
export default async function Page({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const supabase = await createClient();
  const cookieStore = await cookies();
  const referralCode = cookieStore.get("ref")?.value;
  const tenantSlug = cookieStore.get("tenant")?.value;

  if (!token) {
    if (!referralCode || !tenantSlug) {
      redirect("/auth/login");
    }
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md">
          <SignUpForm referralCode={referralCode} tenantSlug={tenantSlug} />
        </div>
      </div>
    );
  }

  // A new invitee is anonymous here (no account yet), so RLS can't grant
  // the read — the token is the authorization. A SECURITY DEFINER RPC
  // returns the invitation (as jsonb) for a valid token, anon-callable.
  const { data: inviteJson, error } = await supabase.rpc(
    "get_invite_by_token",
    { p_token: token },
  );

  if (error) throw new Error(error.message);

  // Unknown / revoked token → show the expired card instead of crashing.
  if (!inviteJson) {
    return (
      <Suspense fallback={null}>
        <InviteExpired />
      </Suspense>
    );
  }

  const invite = inviteJson as unknown as UserInvitation & {
    expires_at: string;
  };

  if (new Date(invite.expires_at) < new Date()) {
    return (
      <Suspense fallback={null}>
        <InviteExpired />
      </Suspense>
    );
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-md">
        <InviteSignUpForm invite={invite} />
      </div>
    </div>
  );
}
