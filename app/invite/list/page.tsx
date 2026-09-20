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
  const { data: invites, error } = await supabase
    .from("invitations")
    .select("*, tenant:tenants(*)");

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
          <InvitesList invites={invites} />
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
