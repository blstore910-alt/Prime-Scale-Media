"use client";
import { useAppContext } from "@/context/app-provider";
import React from "react";
import { MailPlus } from "lucide-react";

// Invites view header, ported to the mockup look. The "New Invite"
// button still dispatches open-invite-user, which opens the shared
// InviteForm dialog (mounted in the admin layout) — wiring unchanged.
export default function InvitesHeader() {
  const { dispatch, profile } = useAppContext();
  return (
    <div className="phead">
      <div>
        <h1>Invites</h1>
        <p>Invite advertisers and affiliates to your organization.</p>
      </div>
      {profile?.role === "admin" && (
        <button className="btn" onClick={() => dispatch("open-invite-user")}>
          <MailPlus /> New Invite
        </button>
      )}
    </div>
  );
}
