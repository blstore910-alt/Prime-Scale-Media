"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RejectReasonField } from "@/components/ui/reject-reason-field";
import { rejectAdTopup } from "@/actions/topup-actions";

export default function RejectTopupDialog({
  open,
  onOpenChange,
  topupId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topupId: string | null;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) {
      setReason("");
    }
  }, [open]);

  const { mutate: rejectTopup, isPending } = useMutation({
    mutationKey: ["reject-topup"],
    mutationFn: async (vars: { topupId: string; reason: string }) => {
      // ── NOT .rpc() FROM HERE ────────────────────────────────────
      //
      // Verify goes through a server action; reject went straight to
      // top_up_admin_reject from the browser, so the maintenance
      // freeze, the tenant comparison and the "is it still pending"
      // re-read all stopped at the verify side of the same queue.
      // This dialog has no second confirmation either, so a row left
      // on screen after a dismissed dialog was one click from being
      // rejected twice.
      //
      // The action still tells the customer why, still best-effort and
      // still after the refusal has landed.
      const res = await rejectAdTopup(vars.topupId, vars.reason);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (_data, vars) => {
      toast.success("Topup rejected.");
      queryClient.invalidateQueries({ queryKey: ["top-ups"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["wallet"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["wallets"], exact: false });
      // Same reason as the verify dialog: the Details sheet reads
      // ["topup-details", id] and would otherwise keep showing the row as
      // pending, with no rejection reason, for the cache's lifetime.
      queryClient.invalidateQueries({
        queryKey: ["topup-details", vars.topupId],
      });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("Failed to reject topup.", { description: err.message });
    },
  });

  const handleSubmit = () => {
    if (!topupId) {
      toast.error("No topup selected for rejection.");
      return;
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      toast.error("Please provide a rejection reason.");
      return;
    }

    rejectTopup({ topupId, reason: trimmedReason });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject topup</DialogTitle>
          <DialogDescription>
            Please provide a reason for rejecting this topup.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <RejectReasonField
            context="account_topup"
            value={reason}
            onChange={setReason}
            disabled={isPending}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={isPending}
            className="text-white"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Reject topup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
