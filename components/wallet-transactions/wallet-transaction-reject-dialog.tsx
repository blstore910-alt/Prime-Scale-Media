"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEffect, useMemo, useState } from "react";
import { RejectReasonField } from "@/components/ui/reject-reason-field";

export default function WalletTransactionRejectDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => void;
  isSubmitting?: boolean;
}) {
  const [reason, setReason] = useState("");
  const trimmedReason = useMemo(() => reason.trim(), [reason]);

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  const handleSubmit = () => {
    if (!trimmedReason) return;
    onSubmit(trimmedReason);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          {/* A question, and what it does — the same register as every
              other money confirmation in the app. "Reject Payment" as a
              statement left the reason field looking optional, and the
              customer has to file a fresh claim afterwards, which is
              worth knowing before you press it. */}
          <DialogTitle>Reject this payment?</DialogTitle>
          <DialogDescription>
            The request is closed for good and the customer has to file a
            new one. Your reason is shown to them, so write it for them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <RejectReasonField
            context="wallet_topup"
            value={reason}
            onChange={setReason}
            disabled={isSubmitting}
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!trimmedReason || isSubmitting}
          >
            {isSubmitting ? "Rejecting…" : "Yes, reject it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
