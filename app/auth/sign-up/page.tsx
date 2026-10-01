import InviteSignUpForm from "@/components/invite-sign-up-form";
import InviteExpired from "@/components/invites/invite-expired";
import { SignUpForm } from "@/components/sign-up-form";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { readTeamInvite } from "@/lib/auth/team-invite";
import { UserInvitation } from "@/lib/types/invite";
import { Suspense } from "react";

type PageProps = {
  searchParams: Promise<{ token?: string; t?: string; ref?: string }>;
};
export default async function Page({ searchParams }: PageProps) {
  const { token, t, ref } = await searchParams;
  const supabase = await createClient();
  // The referral link is /auth/sign-up?t=<slug>&ref=<code>. The comment
  // that stood here said middleware writes those into cookies; it does
  // not, and nothing else does either.
  // ── THE COOKIE FALLBACK IS GONE ────────────────────────────────
  //
  // The owner, 28-09: "create an acc mag toch niet zichtbaar zijn,
  // alles is toch op invite? via homepage kan ik create acc doen en
  // staat er ineens PSM0015."
  //
  // Two separate things, and he is right about both. The public door
  // is removed from the login form. This is the other half: the page
  // fell back to a `ref` cookie when the URL carried none, so a
  // signup that did NOT come through an affiliate's link could still
  // be attributed to one.
  //
  // And it was never reachable as designed: NOTHING in this app ever
  // sets `ref` or `tenant` as a cookie -- I grepped for it. They are
  // read and never written. So the fallback could only ever fire on
  // something set from outside the app, which is the one case where
  // trusting it is least defensible. A stale affiliate on a real
  // customer is money going to the wrong person, quietly.
  //
  // The link in the address bar is now the only thing that decides.
  const referralCode = ref?.toUpperCase() ?? null;
  const tenantSlug = t ?? null;

  if (!token) {
    // The tenant is the only thing we cannot do without -- it is where the
    // account is created. A missing `ref` just means nobody gets credit:
    // mail clients, shorteners and copy-pasted links drop the LAST query
    // parameter, and that bounced a brand-new prospect to a sign-in page
    // for an account they do not have, with no way to make one.
    if (!tenantSlug) {
      // ── THE COMMENT ABOVE, AND THEN THE LINE THAT DID IT ─────────
      //
      // The note four lines up describes this exact failure -- "that
      // bounced a brand-new prospect to a sign-in page for an account
      // they do not have, with no way to make one" -- and then
      // redirected to /auth/login anyway. And the login form carries no
      // link to sign up (I grepped it: none), so that really is the end
      // of the road: no forward, no back, no explanation. A shortener
      // or a mail client dropping one query parameter is enough.
      //
      // A silent bounce is the wrong answer even so. We genuinely
      // cannot create an account without knowing which tenant it
      // belongs to, so the honest thing is to say that and give them
      // both doors.
      return (
        <div className="card login-card">
          <div className="lmk">
            <span className="mk">Almost</span>
          </div>
          <h1 className="lh">This sign-up link is incomplete</h1>
          <p className="meta">
            The part that says which account to create is missing — a
            shortener or an email client has most likely trimmed it. Ask
            whoever sent it for the full link and it will work.
          </p>
          <p className="meta">
            Already have an account?{" "}
            <a href="/auth/login" className="lnk">
              Log in
            </a>
            .
          </p>
        </div>
      );
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
  // ── EEN TEAMUITNODIGING IS GEEN NIEUWE KLANT ───────────────────
  //
  // get_invite_by_token geeft de teamkolommen niet terug (en hoort dat
  // ook niet: hij is anon-aanroepbaar). Zonder dit zei het formulier
  // tegen een collega die alleen mag meekijken "je komt bij Prime Scale
  // Media als advertiser", en vroeg het wie hem had doorgestuurd. Gelopen
  // op productie 01-10. Dus hier, server-side, de teamvelden en de code
  // van het account -- en het formulier zegt wat er echt gebeurt.
  let team: { role: "manager" | "viewer"; code: string | null } | null = null;
  try {
    const admin = await createAdminClient();
    const ti = await readTeamInvite(admin, String((invite as { id?: unknown }).id ?? ""));
    if (ti) {
      const { data: adv } = await admin
        .from("advertisers")
        .select("tenant_client_code")
        .eq("id", ti.advertiserId)
        .limit(1);
      team = {
        role: ti.role,
        code: ((adv ?? [])[0] as { tenant_client_code?: string | null } | undefined)?.tenant_client_code ?? null,
      };
    }
  } catch {
    team = null;
  }

  return <InviteSignUpForm invite={invite} token={token} team={team} />;
}
