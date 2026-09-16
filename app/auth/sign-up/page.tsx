import InviteSignUpForm from "@/components/invite-sign-up-form";
import InviteExpired from "@/components/invites/invite-expired";
import { SignUpForm } from "@/components/sign-up-form";
import { createClient } from "@/lib/supabase/server";
import { UserInvitation } from "@/lib/types/invite";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Suspense } from "react";

type PageProps = {
  searchParams: Promise<{ token?: string; t?: string; ref?: string }>;
};
export default async function Page({ searchParams }: PageProps) {
  const { token, t, ref } = await searchParams;
  const supabase = await createClient();
  const cookieStore = await cookies();
  // The referral link is /auth/sign-up?t=<slug>&ref=<code>. Middleware writes
  // those into cookies, but on the FIRST click that cookie is set on the
  // response and isn't yet readable on this same request — which used to
  // bounce a brand-new prospect to /auth/login and drop the referral. Fall
  // back to the query params so the first click works.
  const referralCode = cookieStore.get("ref")?.value ?? ref;
  const tenantSlug = cookieStore.get("tenant")?.value ?? t;

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

  // The auth layout already centres its .side column and .card sets the
  // width, exactly as the sign-in page does. The extra flex wrapper that used
  // to be here fought that: a second full-height centring context inside one
  // that was already centring.
  return <InviteSignUpForm invite={invite} />;
}
