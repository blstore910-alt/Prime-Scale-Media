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
  // The link in the address bar wins over a cookie from an OLDER link:
  // somebody who clicked affiliate A's link last month and B's today
  // signed up as A's -- the cookie was never replaced.
  const referralCode = ref?.toUpperCase() ?? cookieStore.get("ref")?.value;
  const tenantSlug = t ?? cookieStore.get("tenant")?.value;

  if (!token) {
    // The tenant is the only thing we cannot do without -- it is where the
    // account is created. A missing `ref` just means nobody gets credit:
    // mail clients, shorteners and copy-pasted links drop the LAST query
    // parameter, and that bounced a brand-new prospect to a sign-in page
    // for an account they do not have, with no way to make one.
    if (!tenantSlug) {
      redirect("/auth/login");
    }
    // Straight into the auth shell's .side column, like the invite form: a
    // second full-height centring wrapper fought the one already there.
    return <SignUpForm referralCode={referralCode} tenantSlug={tenantSlug} />;
  }

  // A new invitee is anonymous here (no account yet), so RLS can't grant
  // the read — the token is the authorization. A SECURITY DEFINER RPC
  // returns the invitation (as jsonb) for a valid token, anon-callable.
  const { data: inviteJson, error } = await supabase.rpc(
    "get_invite_by_token",
    { p_token: token },
  );

  // ── NOT A RAW POSTGRES MESSAGE ON A PUBLIC URL ──────────────────
  //
  // This is the first thing an invited customer ever sees, and a
  // throw here renders Next's error page carrying whatever the
  // database said -- table names, column names, a hint. The sibling
  // route at app/invite/accept was fixed for exactly this.
  //
  // The expired card is the right shape: it is what an unreadable
  // token already renders, and from the invitee's side the two are
  // indistinguishable anyway.
  if (error) {
    return (
      <InviteExpired reason="We couldn't check this invitation just now. Reload the page, or ask us for a fresh link." />
    );
  }

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

  // Status as well as expiry — see the note in app/invite/accept/page.tsx.
  // A cancelled or already-used token rendered the whole signup form and
  // refused only on submit, after the password had been chosen.
  const inviteStatus = String(
    (invite as { status?: unknown }).status ?? "pending",
  ).toLowerCase();
  if (inviteStatus !== "pending") {
    return (
      <Suspense fallback={null}>
        <InviteExpired />
      </Suspense>
    );
  }

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
  // ── THE TOKEN COMES FROM THE URL, NOT FROM THE RPC'S ANSWER ────────
  //
  // The form posts the invitation back to /api/accept-invite/signup,
  // which requires `invite.token`. It used to rely on
  // get_invite_by_token echoing the column back inside its jsonb.
  //
  // The LIVE function does not: it returns
  // affiliate_id, email, expires_at, id, role, status, tenant_id,
  // tenant_name -- narrowed at some point, correctly, because
  // `to_jsonb(i)` hands the whole row to anyone holding the link. The
  // repo's copy still has the wide version, so nothing here could see
  // it. The result was a 400 "Invalid request body" on every single
  // invite signup: nobody could join.
  //
  // The token is in the query string this page already read. Passing it
  // explicitly is both the fix and the right shape -- the client should
  // never have depended on a read echoing back the credential it was
  // called with.
  return <InviteSignUpForm invite={invite} token={token} />;
}
