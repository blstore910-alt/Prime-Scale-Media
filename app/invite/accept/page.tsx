import InviteAccept from "@/components/invites/invite-accept";
import InviteExpired from "@/components/invites/invite-expired";
import SignOutAndReturn from "@/components/invites/sign-out-and-return";
import { AlertIcon, StatusBadge } from "@/components/auth/auth-bits";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

type PageProps = {
  searchParams: Promise<{ token: string }>;
};
export default async function AcceptInvite({ searchParams }: PageProps) {
  const { token } = await searchParams;

  // ── DO NOT THROW ON A PUBLIC URL ──────────────────────────────────
  //
  // This is reachable by anyone typing /invite/accept, and a throw here
  // escalates to the root boundary and blanks the document. It is also
  // the FIRST screen a new customer ever sees, from a link in an email
  // that a mail client may well have mangled.
  if (!token) {
    return (
      <section className="card login-card signup-card status-card">
        <StatusBadge tone="warn">
          <AlertIcon />
        </StatusBadge>
        <h2>That invite link is incomplete</h2>
        <p className="lede" style={{ display: "block" }}>
          The link needs the full address from your invitation email —
          some mail apps cut it short. Open it from the email again, or
          ask whoever invited you to send it once more.
        </p>
        <a className="btn" href="/auth/login">
          Go to sign in
        </a>
      </section>
    );
  }

  const supabase = await createClient();

  // P1-9 fix: getUser() verifies the JWT server-side; getSession() only reads cookie
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect(`/auth/sign-up?token=${token}`);
  }

  // ── THE TOKEN IS NOT A SESSION COLUMN ANY MORE (plak 42) ───────────
  //
  // Every employee admin could read the token of every open invitation,
  // and token + the invitee's email is enough for
  // /api/accept-invite/signup to create the account with a password of
  // the reader's choosing. `select (token)` is now revoked from
  // sessions, and a WHERE on a column needs that same right -- so this
  // read goes through the service client. It is no wider than before:
  // whoever holds the link already holds the token, and the email is
  // still checked against the signed-in account below before anything
  // renders. Named columns, so the token itself never reaches the page.
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("invitations")
    .select(
      "id, email, role, status, tenant_id, expires_at, affiliate_id, tenant:tenants(id, name), sender_profile:user_profiles(full_name)",
    )
    .eq("token", token)
    .maybeSingle();

  // ── DO NOT THROW ON A PUBLIC URL ─────────────────────────────────
  //
  // Forty lines above there is a comment saying exactly this, and then
  // this line throws. An RLS hiccup or a phantom column blanks the
  // document for an invitee — the FIRST screen a new customer ever
  // sees — instead of showing the expired card that is already
  // imported two lines up. A read we could not make is indistinguishable
  // from an invite we cannot find, and both want the same card.
  if (error) {
    return <InviteExpired />;
  }

  // Case-insensitive email match (the RLS policy compares lower(email)),
  // so a case difference between the invite and the account doesn't
  // wrongly bounce a valid invitee to /dashboard.
  if (
    !data ||
    userData.user.email?.toLowerCase() !== data.email?.toLowerCase()
  ) {
    // ── SAY WHICH ACCOUNT IS SIGNED IN ────────────────────────────
    //
    // A silent redirect to /dashboard is the most common case on this
    // route -- invited on a work address, signed in on a personal one
    // -- and it reads as the link being broken. The invitee mails
    // support; nobody can tell them the answer is "sign out first",
    // because nothing said so.
    //
    // The invitation's own address is NOT shown: this page is reached
    // by anyone holding the link, and naming the recipient would hand
    // them an address they may not have. The signed-in one is theirs
    // already.
    // ── SAY IT HERE, BECAUSE NOTHING READS THE QUERY STRING ─────────
    //
    // This used to redirect to /dashboard?invite=wrong-account&as=...
    // and nothing in the app reads either parameter -- the dashboard
    // page takes no searchParams at all. So the person landed silently
    // on their own dashboard, which is exactly the "the link is
    // broken" experience the note above says it was written to fix.
    // The page they are already on can simply tell them.
    return (
      <section className="card login-card signup-card status-card">
        <StatusBadge tone="warn">
          <AlertIcon />
        </StatusBadge>
        <h2>This invitation is for a different address</h2>
        <p className="lede" style={{ display: "block" }}>
          You are signed in as <b>{userData.user.email}</b>, and this
          invitation was sent to someone else. Sign out, then open the link
          again from the inbox it arrived in.
        </p>
        {/* ── THE BUTTON THE CARD TELLS THEM TO PRESS ──────────
            A real sign-out (not a form POST to a route that clears one
            cookie), then back to this same link. */}
        <SignOutAndReturn token={token} />
        <a className="btn ghost" href="/dashboard">
          Back to my dashboard
        </a>
      </section>
    );
  }

  // ── EXPIRED IS NOT THE ONLY WAY AN INVITE IS OVER ───────────────────
  //
  // This checked `expires_at` and nothing else, so a CANCELLED or an
  // ALREADY-ACCEPTED invitation rendered the full "You've been invited!"
  // card — and the person only found out on submit, from
  // "This invitation is no longer valid". The accept route does the
  // status check properly with a compare-and-swap; the screen in front of
  // it did not, so the refusal arrived after they had committed.
  const invalidStatus =
    String(data.status ?? "pending").toLowerCase() !== "pending";
  if (invalidStatus || new Date(data.expires_at) < new Date()) {
    return (
      <Suspense fallback={null}>
        <InviteExpired />
      </Suspense>
    );
  }

  const sender = (
    Array.isArray(data.sender_profile) ? data.sender_profile[0] : data.sender_profile
  ) as { full_name?: string | null } | null;
  const tenant = (Array.isArray(data.tenant) ? data.tenant[0] : data.tenant) as
    | { id: string; name: string }
    | null;
  return (
    <InviteAccept
      sender={sender ? { full_name: sender.full_name ?? null } : null}
      invite={{
        id: data.id,
        role: data.role,
        tenant_id: data.tenant_id,
        tenant,
      }}
    />
  );
}
