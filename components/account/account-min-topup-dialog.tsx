"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AdAccount } from "@/lib/types/account";
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
import useUpdateAccount from "./use-update-account";

const DEFAULT_MIN_TOPUP = 300;

export default function AccountMinTopupDialog({
  account,
  open,
  onOpenChange,
}: {
  account: AdAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { updateAccount, isPending } = useUpdateAccount();
  const [minTopup, setMinTopup] = useState<number | string>(DEFAULT_MIN_TOPUP);

  useEffect(() => {
    if (!open) return;
    setMinTopup(account?.min_topup ?? DEFAULT_MIN_TOPUP);
  }, [open, account]);

  const parsedMinTopup = useMemo(() => Number(minTopup), [minTopup]);
  const isInvalid = Number.isNaN(parsedMinTopup) || parsedMinTopup < 0;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!account || isInvalid) return;
    updateAccount(
      {
        id: account.id,
        payload: { min_topup: parsedMinTopup },
      },
      {
        onSuccess: () => {
          toast.success("Minimum topup amount updated.");
          queryClient.invalidateQueries({
            queryKey: ["account-details", account.id],
          });
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error("Failed to update minimum topup amount", {
            description: (error as Error).message,
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Minimum Amount</DialogTitle>
          <DialogDescription>
            Set the minimum topup amount for {account?.name ?? "this account"}.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="account-min-topup">Minimum topup amount</Label>
            <Input
              id="account-min-topup"
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
            <Button
              type="submit"
              disabled={isPending || isInvalid || !account}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
