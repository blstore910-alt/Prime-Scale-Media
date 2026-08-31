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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [currency, setCurrency] = useState<"USD" | "EUR">(defaultCurrency);
  const [reason, setReason] = useState("");

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
      toast.success("Withdrawal requested — an admin will review it.");
      queryClient.invalidateQueries({ queryKey: ["ad-account-withdrawals"] });
      setAmount("");
      setReason("");
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast.error("Couldn't request withdrawal", { description: e.message }),
  });

  const numeric = Number(amount);
  const valid = Number.isFinite(numeric) && numeric > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Withdraw from ad account</DialogTitle>
          <DialogDescription>
            Pull balance from {adAccountName ?? "this ad account"} back to your
            wallet. An admin reviews the request before the balance returns.
          </DialogDescription>
        </DialogHeader>

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
            <div className="space-y-2">
              <Label htmlFor="wd-cur">Currency</Label>
              <Select
                value={currency}
                onValueChange={(v: "USD" | "EUR") => setCurrency(v)}
              >
                <SelectTrigger id="wd-cur">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
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

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => mutate()} disabled={!valid || isPending}>
            {isPending ? "Requesting…" : "Request withdrawal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
