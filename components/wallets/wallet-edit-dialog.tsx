"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { Resolver, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
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
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { WalletWithAdvertiser } from "@/lib/types/wallet";

const formSchema = z.object({
  usd_balance: z.coerce.number().min(0, "USD balance must be 0 or greater"),
  eur_balance: z.coerce.number().min(0, "EUR balance must be 0 or greater"),
  reason: z
    .string()
    .trim()
    .min(3, "Reason must be at least 3 characters"),
});

type FormValues = z.infer<typeof formSchema>;

const round2 = (n: number) => Number(n.toFixed(2));

export default function WalletEditDialog({
  open,
  onOpenChange,
  wallet,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet: WalletWithAdvertiser | null;
}) {
  const queryClient = useQueryClient();
  const currentUsd = round2(Number(wallet?.usd_balance ?? 0));
  const currentEur = round2(Number(wallet?.eur_balance ?? 0));

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      usd_balance: 0,
      eur_balance: 0,
      reason: "",
    },
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
  });

  useEffect(() => {
    if (!open || !wallet) return;
    reset({
      usd_balance: currentUsd,
      eur_balance: currentEur,
      reason: "",
    });
  }, [open, wallet, currentUsd, currentEur, reset]);

  const watchedUsd = Number(watch("usd_balance") ?? 0);
  const watchedEur = Number(watch("eur_balance") ?? 0);
  const usdDelta = round2(watchedUsd - currentUsd);
  const eurDelta = round2(watchedEur - currentEur);
  const finalUsd = round2(currentUsd + usdDelta);
  const finalEur = round2(currentEur + eurDelta);
  const usdNegative = finalUsd < 0;
  const eurNegative = finalEur < 0;
  const noChange = usdDelta === 0 && eurDelta === 0;
  const hasNegativeFinal = usdNegative || eurNegative;

  const { mutate, isPending } = useMutation({
    mutationKey: ["wallet-admin-adjust", wallet?.id],
    mutationFn: async (vars: {
      walletId: string;
      usdDelta: number;
      eurDelta: number;
      reason: string;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("wallet_admin_adjust", {
        p_wallet_id: vars.walletId,
        p_usd_delta: vars.usdDelta,
        p_eur_delta: vars.eurDelta,
        p_reason: vars.reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      toast.success("Wallet balances updated successfully.");
      queryClient.invalidateQueries({ queryKey: ["wallets"], exact: false });
      queryClient.invalidateQueries({
        queryKey: ["wallet-details", vars.walletId],
      });
      queryClient.invalidateQueries({ queryKey: ["wallet"], exact: false });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error("Failed to update wallet", { description: error.message });
    },
  });

  const handleSave = (values: FormValues) => {
    if (!wallet?.id) {
      toast.error("Wallet not found.");
      return;
    }
    if (noChange) {
      toast.error("No balance change to apply.");
      return;
    }
    if (hasNegativeFinal) {
      toast.error("Final balance cannot be negative.");
      return;
    }
    mutate({
      walletId: wallet.id,
      usdDelta,
      eurDelta,
      reason: values.reason,
    });
  };

  const formatDelta = (n: number, currency: "USD" | "EUR") => {
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(2)} ${currency}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit wallet balances</DialogTitle>
          <DialogDescription>
            Update USD and EUR balances for{" "}
            {wallet?.advertiser?.tenant_client_code ?? "selected wallet"}. A
            reason is required for audit logging.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit(handleSave)}>
          <div className="grid gap-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="edit-wallet-usd">USD balance</Label>
              <span className="text-xs text-muted-foreground">
                Current: {currentUsd.toFixed(2)} USD
              </span>
            </div>
            <Input
              id="edit-wallet-usd"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              {...register("usd_balance")}
            />
            {errors.usd_balance && (
              <p className="text-sm text-destructive">
                {errors.usd_balance.message}
              </p>
            )}
            {usdDelta !== 0 && !usdNegative && (
              <p
                className={
                  usdDelta > 0
                    ? "text-xs text-green-600"
                    : "text-xs text-amber-600"
                }
              >
                Adjustment: {formatDelta(usdDelta, "USD")}
              </p>
            )}
            {usdNegative && (
              <p className="text-sm text-destructive">
                Final balance would be negative ({finalUsd.toFixed(2)} USD)
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="edit-wallet-eur">EUR balance</Label>
              <span className="text-xs text-muted-foreground">
                Current: {currentEur.toFixed(2)} EUR
              </span>
            </div>
            <Input
              id="edit-wallet-eur"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              {...register("eur_balance")}
            />
            {errors.eur_balance && (
              <p className="text-sm text-destructive">
                {errors.eur_balance.message}
              </p>
            )}
            {eurDelta !== 0 && !eurNegative && (
              <p
                className={
                  eurDelta > 0
                    ? "text-xs text-green-600"
                    : "text-xs text-amber-600"
                }
              >
                Adjustment: {formatDelta(eurDelta, "EUR")}
              </p>
            )}
            {eurNegative && (
              <p className="text-sm text-destructive">
                Final balance would be negative ({finalEur.toFixed(2)} EUR)
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-wallet-reason">Reason</Label>
            <Textarea
              id="edit-wallet-reason"
              rows={3}
              placeholder="Why are you adjusting this wallet?"
              {...register("reason")}
            />
            {errors.reason && (
              <p className="text-sm text-destructive">
                {errors.reason.message}
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
              disabled={
                isPending || !wallet || noChange || hasNegativeFinal
              }
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
