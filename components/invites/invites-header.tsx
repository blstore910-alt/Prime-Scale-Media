"use client";
import { useAppContext } from "@/context/app-provider";
import React from "react";
import { Button } from "../ui/button";
import { MailPlus } from "lucide-react";

export default function InvitesHeader() {
  const { dispatch, profile } = useAppContext();
  return (
    <div className=" text-end">
      {profile?.role === "admin" && (
        <Button onClick={() => dispatch("open-invite-user")}>
          <MailPlus />
          New Invite
        </Button>
      )}
    </div>
  );
}
