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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestAdAccountWithdrawal } from "@/actions/withdrawal-actions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

// Advertiser-facing: request a withdrawal from one ad account back to
// their wallet. The amount is theirs to enter; an admin reviews and
// approves before the wallet is credited.
export default function WithdrawDialog({
  open,
  onOpenChange,
  adAccountId,
  adAccountName,
  defaultCurrency = "USD",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adAccountId: string;
  adAccountName?: string | null;
  defaultCurrency?: "USD" | "EUR";
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  // No setter: the account decides this, not the person filling the form.
  const [currency] = useState<"USD" | "EUR">(defaultCurrency);
  const [reason, setReason] = useState("");
  // Second step, in the same dialog rather than a dialog on top of a dialog:
  // stacked modals are awkward on a phone and easy to dismiss by accident,
  // which is the opposite of what a confirmation is for.
  const [confirming, setConfirming] = useState(false);

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await requestAdAccountWithdrawal({
        ad_account_id: adAccountId,
        amount: Number(amount),
        currency,
        reason: reason.trim() || undefined,
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Request sent — an admin will review it.");
      queryClient.invalidateQueries({ queryKey: ["ad-account-withdrawals"] });
      setAmount("");
      setReason("");
      setConfirming(false);
      onOpenChange(false);
    },
    onError: (e: Error) => {
      // Back to the form, not stuck on the confirmation: whatever was wrong,
      // the next thing they need is the fields.
      setConfirming(false);
      toast.error("Couldn't send the request", { description: e.message });
    },
  });

  const numeric = Number(amount);
  const valid = Number.isFinite(numeric) && numeric > 0;
  const formatted = valid
    ? new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
      }).format(numeric)
    : "";

  // Closing the dialog always returns it to step one, so reopening never
  // lands on a confirmation for figures that are no longer on screen.
  const handleOpenChange = (next: boolean) => {
    if (!next) setConfirming(false);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {confirming
              ? "Send this request?"
              : "Request a withdrawal"}
          </DialogTitle>
          <DialogDescription>
            {confirming
              ? "Check the details below. Nothing moves until an admin approves it."
              : `Ask for balance on ${adAccountName ?? "this ad account"} to be returned to your wallet. This is a request — an admin reviews it first.`}
          </DialogDescription>
        </DialogHeader>

        {confirming ? (
          <div className="space-y-4">
            <dl className="rounded-lg border divide-y text-sm">
              <div className="flex items-baseline justify-between gap-4 px-3 py-2.5">
                <dt className="text-muted-foreground">Ad account</dt>
                <dd className="font-semibold text-right truncate">
                  {adAccountName ?? "This ad account"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-3 py-2.5">
                <dt className="text-muted-foreground">Amount</dt>
                <dd className="font-semibold tabular-nums">{formatted}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-3 py-2.5">
                <dt className="text-muted-foreground">Returns to</dt>
                <dd className="font-semibold">Your wallet</dd>
              </div>
              {reason.trim() && (
                <div className="flex items-baseline justify-between gap-4 px-3 py-2.5">
                  <dt className="text-muted-foreground">Note</dt>
                  <dd className="text-right">{reason.trim()}</dd>
                </div>
              )}
            </dl>

            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-900 dark:text-amber-100 space-y-1.5">
              <p className="font-semibold">Only send this if you are sure.</p>
              <p>
                Anything still running on this ad account is left without that
                budget once the balance is pulled back. To undo it you would
                have to top the account up again.
              </p>
            </div>
          </div>
        ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="wd-amount">Amount</Label>
              <Input
                id="wd-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            {/* NOT a choice. The currency is a property of the account
                the money is sitting on, and offering it as a dropdown let a
                customer ask for their USD balance back as euros — which the
                approve path credited 1:1, handing them 16% for free. It is
                shown so they know what they are getting back, and it comes
                from the account. */}
            <div className="space-y-2">
              <Label htmlFor="wd-cur">Comes back as</Label>
              <div
                id="wd-cur"
                className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium"
              >
                {currency}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wd-reason">Note (optional)</Label>
            <Input
              id="wd-reason"
              placeholder="Reason for withdrawal"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <p className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
            Withdrawals need admin approval before the balance returns to your
            wallet.
          </p>
        </div>
        )}

        <DialogFooter>
          {confirming ? (
            <>
              <Button
                variant="outline"
                onClick={() => setConfirming(false)}
                disabled={isPending}
              >
                Back
              </Button>
              <Button onClick={() => mutate()} disabled={isPending}>
                {isPending ? "Sending…" : "Yes, send the request"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => setConfirming(true)} disabled={!valid}>
                Review request
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
