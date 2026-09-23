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
    // ── DO NOT CLOSE UNDER A WRITE IN FLIGHT ──────────────────────────
    //
    // Cancel was disabled while submitting; Escape, the backdrop and the
    // X in the corner were not. And the screen behind this has ONE
    // mutation and ONE dialog, shared by every card.
    //
    // So: press "Yes, reject it" on card A, press Escape while it is in
    // flight (which looks exactly like cancelling — the reason is wiped
    // on close), then open Reject on card B. B's dialog comes up with
    // everything disabled and the button reading "Rejecting…", for a
    // refusal nobody submitted. A's write then lands, onSuccess closes
    // "the" dialog, and a green "Payment rejected" appears over card B.
    // The operator has every reason to think B was refused. It was not;
    // A was. ConfirmModal has held this line for months.
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isSubmitting) return;
        onOpenChange(next);
      }}
    >
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
