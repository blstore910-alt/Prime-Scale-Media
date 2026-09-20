"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEffect, useMemo, useState } from "react";
import { RejectReasonField } from "@/components/ui/reject-reason-field";

export default function AdAccountRequestRejectDialog({
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
          <DialogTitle>Reject Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* The reason is printed on the customer's screen. The
              starting sentences are in lib/pure-reject-reasons, where a
              test refuses any wording that names a supplier. */}
          <RejectReasonField
            context="account_request"
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
            onClick={handleSubmit}
            disabled={!trimmedReason || isSubmitting}
          >
            Reject request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
