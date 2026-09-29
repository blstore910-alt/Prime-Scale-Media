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
import { formatCurrency } from "@/lib/utils";

export default function RejectTopupDialog({
  open,
  onOpenChange,
  topupId,
  topup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topupId: string | null;
  /** The row, so the dialog can state the money that goes back. */
  topup?: {
    amount_received?: number | string | null;
    currency?: string | null;
    /**
     * Was the wallet actually debited for this top-up?
     *
     * The refund trigger `refund_wallet_on_topup_rejected` only pays
     * back `IF NEW.wallet_debited = true`, and the column defaults to
     * false and is NOT in TOPUP_INSERT_ALLOWED -- so every
     * ADMIN-created ad-account top-up has it false. Rejecting one of
     * those moves nothing, while this dialog named an amount and said
     * it "goes straight back". `top_up_admin_reject` knows the
     * difference (it reports `refunded` from this very column); the
     * dialog did not read it.
     */
    wallet_debited?: boolean | null;
  } | null;
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Never close under the operator while the refusal is in flight:
        // the reason is wiped on close and they cannot tell whether it
        // landed until the queue refreshes.
        if (!next && isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject this top-up?</DialogTitle>
          <DialogDescription>
            {/* ── SAY WHAT HAPPENS TO THE MONEY ────────────────────────
                Rejecting fires refund_wallet_on_topup_rejected, which
                puts amount_received straight back in the wallet. This
                dialog named neither the customer nor the figure, so an
                admin refused a EUR 1,200 funding without the screen
                stating either. The wallet-top-up sibling has said it
                for months. */}
            {/* Only promise the refund when the wallet was actually
                charged. An admin-created top-up has wallet_debited
                false, the trigger pays nothing back, and naming an
                amount here told the admin money would move that never
                does. */}
            {/* A FIGURE ONLY WHEN WE KNOW IT MOVES.
                The refund trigger pays back only `IF wallet_debited =
                true`, and `top_ups_view` does not expose that column
                yet \u2014 so the honest default is the sentence that does
                not name an amount. `false` says so outright; `true`
                (once the view carries it) names the money. Naming it
                unconditionally told the admin that an admin-created
                top-up would refund, and it never does. */}
            {topup?.wallet_debited === false
              ? "Nothing was taken from their wallet for this one, so nothing comes back. There is no way back \u2014 the customer has to file a new one, and your reason is shown to them."
              : topup && topup.wallet_debited === true
                ? `${formatCurrency(
                    Number(topup.amount_received ?? 0),
                    String(topup.currency ?? "EUR"),
                  )} goes straight back to their ${String(
                    topup.currency ?? "EUR",
                  ).toUpperCase()} wallet. There is no way back \u2014 the customer has to file a new one, and your reason is shown to them.`
                : "Anything that was taken from their wallet for this top-up goes back. There is no way back \u2014 the customer has to file a new one, and your reason is shown to them."}
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
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          {/* The reason is required and the customer is shown it. A live
              button over an empty box teaches the opposite, and the two
              sibling reject dialogs both disable it. */}
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!reason.trim() || isPending}
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
