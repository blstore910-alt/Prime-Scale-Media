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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { changeSubscriptionAmount } from "@/actions/subscription-actions";
import { formatCurrency } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Subscription } from "./types";

const ACTION_MESSAGE: Record<string, string> = {
  reissued: "New invoice issued at the new amount; the old one was voided.",
  refunded: "The overpayment was refunded to the wallet.",
  charged_difference: "An invoice for the difference was issued.",
  updated: "Subscription updated.",
};

export default function ChangeSubscriptionAmountDialog({
  subscription,
  open,
  onOpenChange,
}: {
  subscription: Subscription | null;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState<string>("");
  const [currency, setCurrency] = useState<"EUR" | "USD">("EUR");
  const [isPending, setIsPending] = useState(false);

  // Prime the inputs from the subscription whenever the dialog opens.
  const [primedFor, setPrimedFor] = useState<string | null>(null);
  if (open && subscription && primedFor !== subscription.id) {
    setPrimedFor(subscription.id);
    setAmount(String(subscription.amount ?? ""));
    setCurrency((subscription.currency as "EUR" | "USD") || "EUR");
  }
  if (!open && primedFor !== null) {
    setPrimedFor(null);
  }

  const currentAmount = Number(subscription?.amount ?? 0);
  const nextAmount = Number(amount);
  const delta = Number.isFinite(nextAmount) ? nextAmount - currentAmount : 0;

  const handleSubmit = async () => {
    if (!subscription) return;
    if (!Number.isFinite(nextAmount) || nextAmount < 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    setIsPending(true);
    try {
      const res = await changeSubscriptionAmount(
        subscription.id,
        nextAmount,
        currency,
      );
      if (!res.ok) {
        toast.error("Couldn't change the subscription", {
          description: res.error,
        });
        return;
      }
      toast.success("Subscription changed", {
        description: ACTION_MESSAGE[res.data.action] ?? undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      onOpenChange(false);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change subscription amount</DialogTitle>
          <DialogDescription>
            The current billing period is reconciled automatically: an unpaid
            invoice is re-issued at the new amount; if it was already paid, the
            difference is refunded to (or charged from) the wallet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-sm text-muted-foreground">
            Current:{" "}
            <span className="font-medium text-foreground">
              {formatCurrency(currentAmount, subscription?.currency || "EUR")}
            </span>{" "}
            / month
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="new-amount">New monthly amount</Label>
              <Input
                id="new-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="w-28 space-y-1">
              <Label>Currency</Label>
              <Select
                value={currency}
                onValueChange={(v) => setCurrency(v as "EUR" | "USD")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {Number.isFinite(nextAmount) &&
            currency === (subscription?.currency || "EUR") &&
            delta !== 0 && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                {delta < 0
                  ? `If the current period is already paid, ${formatCurrency(-delta, currency)} will be refunded to the wallet.`
                  : `If the current period is already paid, an invoice for ${formatCurrency(delta, currency)} will be issued.`}
              </div>
            )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
