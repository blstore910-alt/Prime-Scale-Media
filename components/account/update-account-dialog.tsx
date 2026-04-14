"use client";

import { AdAccount } from "@/lib/types/account";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import UpdateAccountForm from "./update-account-form";

export default function UpdateAccountDialog({
  account,
  open,
  onOpenChange,
}: {
  account: AdAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!account) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1rem)] max-h-[92vh] overflow-hidden sm:max-w-lg"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Update Ad Account</DialogTitle>
          <DialogDescription>
            Update account details. Advertiser cannot be changed.
          </DialogDescription>
        </DialogHeader>
        <UpdateAccountForm account={account} setOpen={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}
