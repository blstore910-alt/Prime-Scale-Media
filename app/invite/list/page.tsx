import InvitesList from "@/components/onboard/invites-list";
import { AlertIcon, MailIcon, RocketMark, StatusBadge } from "@/components/auth/auth-bits";
import { createClient } from "@/lib/supabase/server";
import { redirectCustomersToTheirShell } from "@/lib/auth/customer-shell-redirect";

export default async function Page() {
  // ── THIS PAGE SITS OUTSIDE THE (app) GROUP ────────────────────────
  //
  // So it gets no role check, no inactive check and no shell: no
  // sidebar, no topbar, no bottom nav, and Back is the only way out.
  // RLS grants SELECT on an invitation to any admin of the tenant, so
  // an employee admin saw EVERY pending invitation here, each behind
  // Accept and Decline buttons that answer "This invitation is not for
  // you" every time -- /api/accept-invite refuses anything not
  // addressed to the caller's own email.
  //
  // A customer lands somewhere just as shell-less. This is exactly what
  // redirectCustomersToTheirShell exists for; these two routes were
  // never covered by it.
  await redirectCustomersToTheirShell("notif");

  const supabase = await createClient();
  // ── YOUR OWN INVITATIONS, AND NOT THE TOKEN ───────────────────────
  //
  // `select("*")` with no filter returned every invitation RLS lets the
  // caller see -- and invitations_select_admin grants SELECT to every
  // ADMIN of the tenant, not just the owner. So an employee admin
  // opening this URL got the owner-only invite list, and because this
  // component is "use client" every column was serialised into the RSC
  // payload, `token` included.
  //
  // A pending token is the anonymous authorisation at
  // /auth/sign-up?token=... and at POST /api/accept-invite/signup,
  // whose only other check is that the submitted email matches the
  // invitation's. Reading one is enough to create that person's account
  // with a password of your choosing before they ever sign up.
  //
  // This page is "invitations addressed to ME" -- it is how somebody
  // chooses which organisation to join. So it asks for exactly that.
  // It also fixes the thing the comment above describes: the Accept and
  // Decline buttons on somebody else's invitation answered "This
  // invitation is not for you" every time, because those rows had no
  // business being listed.
  const { data: auth } = await supabase.auth.getUser();
  const myEmail = auth?.user?.email?.trim().toLowerCase() ?? "";
  if (!myEmail) {
    return (
      <section className="card login-card signup-card status-card">
        <StatusBadge tone="warn">
          <AlertIcon />
        </StatusBadge>
        <h2>We could not confirm who you are</h2>
        <p className="lede" style={{ display: "block" }}>
          Reload and try again.
        </p>
        <a className="btn" href="/auth/login">
          Go to sign in
        </a>
      </section>
    );
  }
  const { data: invites, error } = await supabase
    .from("invitations")
    .select(
      "id, tenant_id, role, status, email, created_at, expires_at, tenant:tenants(id, name)",
    )
    .ilike("email", myEmail)
    // ── ONLY THE ONES THAT CAN STILL BE ACCEPTED ────────────────────
    //
    // Without this the page lists cancelled, expired and already
    // accepted invitations with a live Accept button on each, and
    // pressing it gets a refusal toast from /api/accept-invite and
    // nothing else. Expiry is checked too: /auth/sign-up and
    // /invite/accept both refuse an expired token, so offering it here
    // is an action that cannot succeed.
    .eq("status", "pending")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

  // A thrown error here is a shell-less Next error page on a route a
  // customer can reach. Say it in words instead.
  if (error) {
    return (
      <section className="card login-card signup-card status-card">
        <StatusBadge tone="warn">
          <AlertIcon />
        </StatusBadge>
        <h2>We couldn&apos;t load your invitations</h2>
        <p className="lede" style={{ display: "block" }}>
          This is not an empty list — reload and try again.
        </p>
      </section>
    );
  }

  // PostgREST types an embedded table as an array unless generated types
  // say otherwise; there is at most one tenant per invitation.
  const forList = (invites ?? []).map((i) => ({
    id: String(i.id),
    tenant_id: i.tenant_id as string | null,
    role: i.role as string | null,
    tenant: Array.isArray(i.tenant) ? (i.tenant[0] ?? null) : (i.tenant ?? null),
  }));

  return (
    <section className="card login-card">
      <RocketMark />
      <h2>Get started</h2>
      <p className="lede" style={{ display: "block" }}>
        {forList.length
          ? "You have been invited. Pick the organisation to join."
          : "There is nothing to join yet."}
      </p>
      {forList.length > 0 ? (
        <InvitesList invites={forList} />
      ) : (
        <div className="whoami">
          <MailIcon />
          <span className="t">
            <small>No invitations waiting for</small>
            <b title={myEmail}>{myEmail}</b>
          </span>
        </div>
      )}
      {forList.length === 0 ? (
        <p className="meta">
          Expecting one? Ask whoever invited you to send it again — an
          invitation expires, and it has to go to the address you are
          signed in with.
        </p>
      ) : null}
    </section>
  );
}
