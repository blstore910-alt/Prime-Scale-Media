"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { InvitationStatus, UserInvitation } from "@/lib/types/invite";
import { UserProfile } from "@/lib/types/user";
import { getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "../ui/avatar";

type InviteAcceptProps = {
  invite: UserInvitation;
  sender: UserProfile | null;
};

export default function InviteAccept({ sender, invite }: InviteAcceptProps) {
  // The invitee isn't a tenant member yet, so RLS can leave the embedded
  // `tenant` null. The tenant id we actually need lives on the invitation
  // row itself; the name is display-only and degrades gracefully.
  const tenant = invite.tenant;
  const tenantId = invite.tenant_id ?? tenant?.id;
  const tenantName = tenant?.name ?? "this organization";
  const router = useRouter();

  const [loadingState, setLoadingState] = useState<InvitationStatus | null>(
    null,
  );

  const handleInvite = async (status: InvitationStatus) => {
    const payload = {
      status,
      role: invite.role,
      tenant_id: tenantId,
      invite_id: invite.id,
    };

    try {
      setLoadingState(status);

      const res = await fetch("/api/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message);
      }

      // Only advertisers land on /complete-profile — they need
      // company + billing before anything else. Affiliates go
      // straight into the app (their profile is filled in-place
      // from the invite). /complete-profile silently redirects
      // affiliates back home, so sending them there loops.
      if (invite.role === "advertiser") {
        router.push("/complete-profile");
      } else {
        router.push("/dashboard");
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error(`Error: ${error.message}`);
      } else {
        toast.error("An unexpected error occurred.");
      }
    } finally {
      setLoadingState(null);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <h2 className="text-2xl font-semibold text-center">
            {"You’ve been invited!"}
          </h2>
          <p className="text-muted-foreground text-center">
            <b>{sender?.full_name}</b> invited you to join this organization on
            PSM Logbook as <b>{invite.role}</b>.
          </p>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <div className="flex justify-center items-center gap-4">
            <Avatar className="size-12">
              <AvatarFallback>{getInitials(tenantName)}</AvatarFallback>
            </Avatar>
            <h4 className="text-sm">{tenantName}</h4>
          </div>
          <div className="flex justify-center gap-4">
            <Button
              variant="default"
              disabled={loadingState !== null}
              onClick={() => handleInvite("accepted")}
            >
              {loadingState === "accepted" ? (
                <Loader2 className="animate-spin size-4 mr-2" />
              ) : null}
              Accept Invite
            </Button>
            {/* <Button
              variant="outline"
              disabled={loadingState !== null}
              onClick={() => handleInvite("rejected")}
            >
              {loadingState === "rejected" ? (
                <Loader2 className="animate-spin size-4 mr-2" />
              ) : null}
              Reject
            </Button> */}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
