"use client";
import { InvitationStatus } from "@/lib/types/invite";
import React, { useState } from "react";
import { getInitials } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// ── ONLY WHAT THIS LIST ACTUALLY READS ──────────────────────────────
//
// It used to take a whole UserInvitation, which is how `select("*")`
// ended up on the two pages that feed it -- and since this file is
// "use client", every column of every row was serialised into the RSC
// payload, `token` among them. A token is the anonymous authorisation
// for signing that person's account up. Naming the four fields here is
// what stops the next `select("*")`.
export type InviteToChoose = {
  id: string;
  tenant_id?: string | null;
  role?: string | null;
  tenant?: { id?: string | null; name?: string | null } | null;
};

export default function InvitesList({
  invites,
}: {
  invites: InviteToChoose[];
}) {
  // Rows in the auth shell's vocabulary (it renders inside app/invite).
  return (
    <div className="orgs">
      {invites.map((invite) => (
        <InviteCard key={invite.id} invite={invite} />
      ))}
    </div>
  );
}

function InviteCard({ invite }: { invite: InviteToChoose }) {
  // The invitee isn't a tenant member yet, so RLS can leave the embedded
  // `tenant` null. Id lives on the invitation row; name is display-only.
  const tenant = invite.tenant;
  const tenantId = invite.tenant_id ?? tenant?.id;
  const tenantName = tenant?.name ?? "this organization";
  const router = useRouter();

  const [loadingState, setLoadingState] = useState<InvitationStatus | null>(
    null
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
    <button
      type="button"
      className="orgbtn"
      disabled={loadingState !== null}
      onClick={() => handleInvite("accepted")}
    >
      <span className="av">{getInitials(tenantName)}</span>
      <span className="nm">
        <b>{tenantName}</b>
        <small>{invite.role ? `Join as ${invite.role}` : "Join this organisation"}</small>
      </span>
      <span className="go">{loadingState === "accepted" ? "Joining…" : "Accept →"}</span>
    </button>
  );
}
