"use client";
import { PlusCircle } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import AccountForm from "./account-form";
import { useState } from "react";
import { useAppContext } from "@/context/app-provider";

export default function CreateAccountDialog({
  children,
}: {
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { profile } = useAppContext();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {profile?.role === "admin" && (
        <DialogTrigger asChild>
          {children ?? (
            <Button aria-label="Create new account">
              <PlusCircle />
              <span>Create New</span>
            </Button>
          )}
        </DialogTrigger>
      )}
      {/* Same shape as the update dialog: a COLUMN in dvh, so the footer
          always has somewhere to sit. With overflow-hidden and a field area
          capped at 70vh, the Create button fell outside the sheet on a
          phone and was clipped rather than scrolled. */}
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] mx-auto flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Ad Account</DialogTitle>
          <DialogDescription>
            Here you can create a new ad account and assign it to an advertiser
            in your organization.
          </DialogDescription>
        </DialogHeader>
        {/* Account Form */}
        <AccountForm setOpen={setOpen} />
      </DialogContent>
    </Dialog>
  );
}
