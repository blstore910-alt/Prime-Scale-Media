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

export default async function MyInvites() {
  const supabase = await createClient();
  const { data: invites, error } = await supabase
    .from("invitations")
    .select("*, tenant:tenants(*, profile:user_profiles(*))");

  if (error) throw new Error(error.message);

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
            <TableRow className="bg-muted/50">
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
                      {invite.tenant.profile?.full_name || "Unknown Sender"}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {invite.tenant.profile?.email || "No email"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>{invite.tenant.name}</TableCell>

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
