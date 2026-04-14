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

export default function CreateAccountDialog() {
  const [open, setOpen] = useState(false);
  const { profile } = useAppContext();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {profile?.role === "admin" && (
        <DialogTrigger asChild>
          <Button aria-label="Create new account">
            <PlusCircle />
            <span>Create New</span>
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="w-[calc(100vw-1rem)] max-h-[92vh] overflow-hidden sm:max-w-lg">
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
