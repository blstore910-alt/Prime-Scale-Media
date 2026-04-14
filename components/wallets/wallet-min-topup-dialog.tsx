"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
import { createClient } from "@/lib/supabase/client";
import { WalletWithAdvertiser } from "@/lib/types/wallet";

const DEFAULT_MIN_TOPUP = 300;

export default function WalletMinTopupDialog({
  open,
  onOpenChange,
  wallet,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet: WalletWithAdvertiser | null;
}) {
  const queryClient = useQueryClient();
  const [minTopup, setMinTopup] = useState<number | string>(DEFAULT_MIN_TOPUP);

  useEffect(() => {
    if (!open) return;
    setMinTopup(wallet?.min_topup ?? DEFAULT_MIN_TOPUP);
  }, [open, wallet]);

  const parsedMinTopup = useMemo(() => Number(minTopup), [minTopup]);
  const isInvalid = Number.isNaN(parsedMinTopup) || parsedMinTopup < 0;

  const { mutate, isPending } = useMutation({
    mutationKey: ["wallet-min-topup", wallet?.id],
    mutationFn: async (value: number) => {
      if (!wallet?.id) throw new Error("Wallet not found.");
      const supabase = createClient();
      const { error } = await supabase
        .from("wallets")
        .update({
          min_topup: value,
          updated_at: new Date().toISOString(),
        })
        .eq("id", wallet.id);

      if (error) throw error;
      return wallet.id;
    },
    onSuccess: (walletId) => {
      toast.success("Minimum topup amount updated.");
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-details", walletId] });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error("Failed to update minimum topup amount", {
        description: error.message,
      });
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!wallet || isInvalid) return;
    mutate(parsedMinTopup);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Minimum Amount</DialogTitle>
          <DialogDescription>
            Set the minimum topup amount for{" "}
            {wallet?.advertiser?.tenant_client_code ?? "this wallet"}.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="wallet-min-topup">Minimum topup amount</Label>
            <Input
              id="wallet-min-topup"
              type="number"
              min="0"
              step="0.01"
              value={minTopup}
              onChange={(event) => {
                const value = event.target.value;
                setMinTopup(value === "" ? "" : Number(value));
              }}
            />
            {isInvalid && (
              <p className="text-sm text-destructive">
                Enter a valid amount of 0 or greater.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || isInvalid || !wallet}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
