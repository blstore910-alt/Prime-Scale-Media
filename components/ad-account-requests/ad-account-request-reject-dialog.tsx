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
import { formatCurrency } from "@/lib/utils";

const money = (v: number | string | null | undefined, cur?: string | null) =>
  formatCurrency(Number(v ?? 0), String(cur ?? "EUR").toUpperCase());

export default function AdAccountRequestRejectDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  chargedAmount,
  chargedCurrency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => void;
  isSubmitting?: boolean;
  /** What was taken off the wallet when this request was filed. Rejecting
   *  gives it back, and until now nothing on this box said so. */
  chargedAmount?: number | string | null;
  chargedCurrency?: string | null;
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
    // NOT DISMISSABLE MID-WRITE. Cancel is disabled while this runs, but
    // Escape, the backdrop and the corner X went straight through -- so
    // the box vanished with the write still in flight and no toast yet.
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isSubmitting) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject Request</DialogTitle>
        </DialogHeader>
        {/* ── AND SAY WHAT MOVES ────────────────────────────────────
            Rejecting calls ad_account_request_reject_refund, which puts
            the request fee back on the customer's wallet. The figure
            appeared only in the toast AFTERWARDS, and the act cannot be
            undone -- the RPC refuses an already-rejected row, the status
            setter will not accept `rejected` as a target, and Create Ad
            Account refuses it. The queue next door puts Customer, Ad
            account and Amount in front of exactly this decision. */}
        <div className="rounded-xl border bg-muted/40 p-3 text-sm">
          {Number(chargedAmount) > 0
            ? `${money(chargedAmount, chargedCurrency)} goes straight back to their wallet.`
            : "No fee was charged for this one, so nothing moves."}
        </div>
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
