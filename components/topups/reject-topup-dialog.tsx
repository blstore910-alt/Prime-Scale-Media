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
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RejectReasonField } from "@/components/ui/reject-reason-field";
import { notifyTopupRejected } from "@/actions/topup-actions";

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
      const supabase = createClient();
      const { data, error } = await supabase.rpc("top_up_admin_reject", {
        p_top_up_id: vars.topupId,
        p_reason: vars.reason,
      });
      if (error) throw error;
      // ── AND TELL THE CUSTOMER WHY ────────────────────────────────
      //
      // The reason is written to the customer -- it is the whole
      // point of demanding one, and there are fifteen templates
      // behind this box. It reached the database and stopped there.
      //
      // Best effort and deliberately after the RPC: the rejection has
      // already happened, and failing the mutation now would tell the
      // admin it did not. The action re-reads the row, so it cannot
      // announce a refusal that is not there.
      try {
        await notifyTopupRejected(vars.topupId, vars.reason);
      } catch {
        /* the refusal stands either way */
      }
      return data;
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
