"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { InvitationStatus } from "@/lib/types/invite";
import { getInitials } from "@/lib/utils";
import { RocketMark } from "@/components/auth/auth-bits";

// Only what this card needs. The page used to hand over the whole
// invitation row -- token included -- and the whole sender profile.
type InviteAcceptProps = {
  invite: {
    id: string;
    role: string;
    tenant_id: string | null;
    tenant: { id: string; name: string } | null;
  };
  sender: { full_name: string | null } | null;
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

  // In the shell's vocabulary (app/invite/layout.tsx): this was a white
  // shadcn card on a blank page -- the first screen of J1.
  return (
    <section className="card login-card">
      <RocketMark />
      <h2>You&apos;ve been invited</h2>
      <p className="lede" style={{ display: "block" }}>
        <b>{sender?.full_name || "Someone"}</b> invited you to join{" "}
        <b>{tenantName}</b> on Prime Scale Media as <b>{invite.role}</b>.
      </p>
      <div className="orgs">
        <div className="orgbtn" style={{ cursor: "default" }}>
          <span className="av">{getInitials(tenantName)}</span>
          <span className="nm">
            <b>{tenantName}</b>
            <small>Joining as {invite.role}</small>
          </span>
        </div>
      </div>
      <button
        className="btn"
        type="button"
        disabled={loadingState !== null}
        onClick={() => handleInvite("accepted")}
      >
        {loadingState === "accepted" ? "Accepting…" : "Accept invitation"}
      </button>
    </section>
  );
}
