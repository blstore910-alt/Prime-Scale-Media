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
