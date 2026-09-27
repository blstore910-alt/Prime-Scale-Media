import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { finalizeSignup, signupMetadata } from "@/lib/auth/finalize-signup";

export default async function Page() {
  const supabase = await createClient();

  // Named columns: `token` is no longer readable by a session (plak 42),
  // and select() is select(*).
  const { data: invites, error: invitesError } = await supabase
    .from("invitations")
    .select("id, status");

  const { data: profiles, error: profilesError } = await supabase
    .from("user_profiles")
    .select();

  // A throw here is a shell-less Next error page carrying a raw Supabase
  // message, on a route anybody can reach. The two redirects below both
  // depend on knowing whether there are profiles, so a failed read
  // cannot be guessed past -- but it can be said in words.
  if (invitesError || profilesError) {
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "24px 16px", textAlign: "center" }}>
        <p style={{ maxWidth: 420, opacity: 0.8, lineHeight: 1.5 }}>
          We couldn&apos;t check your account just now. Reload the page — if
          it keeps happening, tell us and we will look.
        </p>
      </main>
    );
  }

  const pendingInvites = invites?.filter(
    (invite) => invite.status === "pending"
  );

  // ── A SELF-SIGNUP WHOSE ACCOUNT WAS NEVER FINISHED ──────────────────
  // Signed in, no profile, and the sign-up form recorded which
  // organisation they signed up to: finish the account (profile, wallet,
  // referral) instead of offering to create an organisation. See
  // lib/auth/finalize-signup.ts for how this state comes about.
  if (!profiles.length && !pendingInvites.length) {
    const { data: me } = await supabase.auth.getUser();
    const meta = me?.user ? signupMetadata(me.user) : null;
    if (me?.user?.email && meta?.tenantSlug) {
      // ── NO REFERRAL FROM THIS DOOR ──────────────────────────────
      //
      // `user_metadata` is writable by the user themselves:
      // `auth.updateUser({ data: { referral_code: "PSM0007" } })` takes
      // any key, with the anon key and their own JWT, and no server is
      // involved. finalize-signup.ts says so in its own comment.
      //
      // The confirm route is safe because it runs on a token from the
      // mailbox and compares the metadata against the URL. This path
      // has neither: it exists for somebody who IS confirmed and has no
      // profile, which is exactly the state from which the metadata can
      // be rewritten. So a stranger could sign up with a tenant slug
      // that does not exist, confirm, log in with no profile, set
      // `referral_code` to any affiliate's code from the browser
      // console, load /onboard -- and the service role would write a
      // referral_links row crediting an affiliate who never referred
      // them. It lands `pending`, but in the owner's queue it is
      // indistinguishable from a real one, and approving books every
      // commission earned since.
      //
      // Finishing the ACCOUNT here is right and stays. The attribution
      // does not: it is money, and this is the one entrance where the
      // claim cannot be checked against anything.
      if (meta.referralCode) {
        // Logged rather than dropped in silence -- a genuine customer
        // whose confirm failed loses their referrer this way, and that
        // is worth someone seeing and attaching by hand.
        console.warn(
          `onboard: not applying referral ${meta.referralCode} for ${me.user.email} — metadata is user-writable on this path`,
        );
      }
      const done = await finalizeSignup({
        user: { id: me.user.id, email: me.user.email, user_metadata: me.user.user_metadata },
        tenantSlug: meta.tenantSlug,
        referralCode: null,
        signupReferralCode: null,
      });
      if (done.ok) redirect(done.path);
    }
  }

  if (!profiles.length && !pendingInvites.length) redirect("/organization/new");
  if (!profiles.length && pendingInvites.length) redirect("/invite/list");

  // ── SOMEBODY WITH A WORKING ACCOUNT BELONGS IN IT ─────────────────
  //
  // Both redirects above require !profiles.length, so any signed-in
  // member who typed /onboard fell through to the "your account isn't
  // set up yet" page below -- a working advertiser or admin, told their
  // account does not exist, on a page with no navigation.
  //
  // That page is for the case it was written for: a profile with no
  // role. A profile WITH a role goes to its own shell.
  const withRole = profiles.find((p) => {
    const r = String((p as { role?: string }).role ?? "").toLowerCase();
    return r === "admin" || r === "advertiser" || r === "affiliate";
  });
  if (withRole) {
    const role = String((withRole as { role?: string }).role ?? "").toLowerCase();
    redirect(role === "affiliate" ? "/my-referrals" : "/dashboard");
  }

  // ── THE FALLTHROUGH WAS A DEAD END ──────────────────────────────────
  //
  // It rendered the literal string "Onboard Page": no shell, no
  // navigation, no way out. And this is where /dashboard sends anybody
  // whose role it cannot identify, which is the one case where the person
  // most needs to be told something.
  //
  // It cannot redirect to /dashboard — that is where they came from, and
  // it would loop. So it says what is actually true and offers the two
  // doors that always work.
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px 16px",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <h1 style={{ fontSize: "1.35rem", fontWeight: 650, margin: "0 0 10px" }}>
          Your account isn&apos;t set up yet
        </h1>
        <p style={{ opacity: 0.7, lineHeight: 1.5, margin: "0 0 20px" }}>
          You have a profile, but no role has been assigned to it yet, so
          there is no dashboard to send you to. Ask whoever invited you to
          finish setting it up — they can do it in a minute.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <a
            href="/invite/list"
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,.14)",
              textDecoration: "none",
              fontWeight: 600,
              color: "inherit",
            }}
          >
            See your invitations
          </a>
          <a
            href="/auth/login"
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,.14)",
              textDecoration: "none",
              fontWeight: 600,
              color: "inherit",
            }}
          >
            Sign in as someone else
          </a>
        </div>
      </div>
    </main>
  );
}
