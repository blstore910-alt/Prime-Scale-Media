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

  if (error) throw new Error(error.message);

  // Case-insensitive email match (the RLS policy compares lower(email)),
  // so a case difference between the invite and the account doesn't
  // wrongly bounce a valid invitee to /dashboard.
  if (
    !data ||
    userData.user.email?.toLowerCase() !== data.email?.toLowerCase()
  ) {
    redirect("/dashboard");
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
