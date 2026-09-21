import InviteAccept from "@/components/invites/invite-accept";
import InviteExpired from "@/components/invites/invite-expired";
import SignOutAndReturn from "@/components/invites/sign-out-and-return";
import { createClient } from "@/lib/supabase/server";
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
      <main className="grid min-h-dvh place-items-center bg-muted/30 p-6">
        <div className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-sm">
          <h1 className="text-lg font-bold">That invite link is incomplete</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The link needs the full address from your invitation email —
            some mail apps cut it short. Open it from the email again, or
            ask whoever invited you to send it once more.
          </p>
          <a
            className="mt-5 inline-block rounded-lg bg-muted px-4 py-2 text-sm font-semibold"
            href="/auth/login"
          >
            Go to sign in
          </a>
        </div>
      </main>
    );
  }

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
      <main className="mx-auto flex min-h-screen max-w-md items-center p-6">
        <div className="w-full rounded-xl border bg-card p-6 text-card-foreground">
          <h1 className="text-xl font-semibold">
            This invitation is for a different address
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            You are signed in as{" "}
            <span className="font-medium text-foreground">
              {userData.user.email}
            </span>
            , and this invitation was sent to someone else. Sign out, then
            open the link again from the inbox it arrived in.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {/* ── THE BUTTON THE CARD TELLS THEM TO PRESS ──────────
                This was a plain form POST to /api/auth/sign-out. Two
                faults, and the second is the one that mattered: a form
                POST NAVIGATES to the route and renders its answer, so
                they landed on a blank page reading {"ok":true} -- and
                that route only clears the httpOnly profile_id cookie,
                not the Supabase session. It did not sign anybody out.
                Open the link again and the same card came back, with no
                way past it short of clearing cookies by hand.

                This is the first screen a new customer sees when they
                open their invite on a machine where somebody else is
                signed in. */}
            <SignOutAndReturn token={token} />
            <a
              href="/dashboard"
              className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium"
            >
              Back to my dashboard
            </a>
          </div>
        </div>
      </main>
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

  return <InviteAccept sender={data.sender_profile} invite={data} />;
}
