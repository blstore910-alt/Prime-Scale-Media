"use client";
import { InvitationStatus, UserInvitation } from "@/lib/types/invite";
import React, { useState } from "react";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { getInitials } from "@/lib/utils";
import { Button } from "../ui/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function InvitesList({
  invites,
}: {
  invites: UserInvitation[];
}) {
  return (
    <div className="bg-card text-card-foreground rounded-lgp-6">
      <div>
        <h3 className="text-lg font-semibold">Invites</h3>
      </div>

      <div className="mt-6 space-y-3">
        {invites.map((invite) => (
          <InviteCard key={invite.id} invite={invite} />
        ))}
      </div>
    </div>
  );
}

function InviteCard({ invite }: { invite: UserInvitation }) {
  const { tenant } = invite;
  const router = useRouter();

  const [loadingState, setLoadingState] = useState<InvitationStatus | null>(
    null
  );

  const handleInvite = async (status: InvitationStatus) => {
    const payload = {
      status,
      role: invite.role,
      tenant_id: tenant.id,
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

      router.push("/dashboard");
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
    <div className="flex items-center justify-between rounded-md border px-4 py-3 bg-popover">
      <div className="flex justify-center items-center gap-4">
        <Avatar className="size-12">
          <AvatarFallback>{getInitials(invite.tenant.name)}</AvatarFallback>
        </Avatar>
        <h4 className="text-sm font-bold">{invite.tenant.name}</h4>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="default"
          size={"sm"}
          disabled={loadingState !== null}
          onClick={() => handleInvite("accepted")}
        >
          {loadingState === "accepted" ? (
            <Loader2 className="animate-spin size-4 mr-2" />
          ) : null}
          Accept
        </Button>
        {/* <Button
          variant="outline"
          size={"sm"}
          disabled={loadingState !== null}
          onClick={() => handleInvite("rejected")}
        >
          {loadingState === "rejected" ? (
            <Loader2 className="animate-spin size-4 mr-2" />
          ) : null}
          Reject
        </Button> */}
      </div>
    </div>
  );
}
