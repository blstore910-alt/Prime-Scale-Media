import InvitesList from "@/components/onboard/invites-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      <main className="max-w-lg mx-auto p-6">
        <p className="text-sm text-destructive">
          We could not confirm who you are signed in as. Reload and try
          again.
        </p>
      </main>
    );
  }
  const { data: invites, error } = await supabase
    .from("invitations")
    .select(
      "id, tenant_id, role, status, email, created_at, expires_at, tenant:tenants(id, name)",
    )
    .ilike("email", myEmail);

  // A thrown error here is a shell-less Next error page on a route a
  // customer can reach. Say it in words instead.
  if (error) {
    return (
      <main className="max-w-lg mx-auto p-6">
        <p className="text-sm text-destructive">
          We couldn&apos;t load your invitations just now. This is not an
          empty list — reload and try again.
        </p>
      </main>
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
    <main className="max-w-lg mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">Get started</CardTitle>
          <CardDescription>
            {
              "You've received invitations from other organizations. Choose one to be a part of, or continue by creating a new one."
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InvitesList invites={forList} />
          {/* <div className="mt-6 text-center text-muted-foreground space-y-6 ">
            <h6>OR</h6>
            <Button asChild>
              <Link href="/organization/new">Create New Organization</Link>
            </Button>
          </div> */}
        </CardContent>
      </Card>
    </main>
  );
}
