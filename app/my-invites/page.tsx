import { InvitationStatusBadge } from "@/components/invites/invites-table";
import InvitesList from "@/components/onboard/invites-list";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DATE_TIME_FORMAT } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { InvitationStatus, UserInvitation } from "@/lib/types/invite";
import dayjs from "dayjs";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import React from "react";
import { redirectCustomersToTheirShell } from "@/lib/auth/customer-shell-redirect";

export default async function MyInvites() {
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
    .select("*, tenant:tenants(*, profile:user_profiles(*))");

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

  const pendingInvites = invites?.filter(
    (invite) => invite.status === "pending"
  );
  const acceptedInvites = invites?.filter(
    (invite) => invite.status === "accepted"
  );

  return (
    <main className="max-w-5xl mx-auto mt-40">
      <div className="mb-4">
        <Button variant={"secondary"} asChild>
          <Link href={"/dashboard"}>
            <ArrowLeft />
            Back
          </Link>
        </Button>
      </div>
      {pendingInvites?.length ? <InvitesList invites={pendingInvites} /> : null}

      {acceptedInvites?.length ? (
        <InvitesTable invites={acceptedInvites} />
      ) : null}
    </main>
  );
}

function InvitesTable({ invites }: { invites: UserInvitation[] }) {
  return (
    <div className=" border p-6 rounded-xl">
      <h3 className="text-lg font-semibold mb-4">Recent Invites</h3>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-background">
              <TableHead>Sender</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Date Sent</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.map((invite) => (
              <TableRow key={invite.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {invite.tenant?.profile?.full_name || "Unknown Sender"}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {invite.tenant?.profile?.email || "No email"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>{invite.tenant?.name ?? "—"}</TableCell>

                <TableCell>
                  {dayjs(invite.created_at).format(DATE_TIME_FORMAT)}
                </TableCell>
                <TableCell>
                  <InvitationStatusBadge
                    status={invite.status as InvitationStatus}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
