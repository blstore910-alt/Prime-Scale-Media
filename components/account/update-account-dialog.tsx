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
        /* A COLUMN, so the footer has somewhere to sit. It was
           overflow-hidden with the field area capped at 70vh — and on a
           phone the sheet is capped in dvh, which is SMALLER than vh while
           the browser chrome is showing. So 70vh of fields plus a header
           plus a footer exceeded the sheet, and the part that fell outside
           was the footer: the Update Account button was clipped, not
           scrolled, with no way to reach it. */
        className="flex max-h-[92dvh] w-[calc(100vw-1rem)] flex-col overflow-hidden sm:max-w-lg"
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
