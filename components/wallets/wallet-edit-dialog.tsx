"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
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

  // THE BASE HAS TO BE FRESH, because what is sent is a DELTA.
  //
  // The form takes an absolute balance — "make it 600" — and sends
  // `target - base` to wallet_admin_adjust, which applies that difference
  // to whatever the balance is NOW. The base came from the row captured
  // when the list was loaded and never refreshed. So: list loaded at
  // €500, a €1,000 top-up is verified in the meantime, admin opens Edit
  // (still showing 500), types 600 to correct it -> delta +100 -> the
  // wallet becomes €1,600, while the confirmation they just read said
  // "500.00 -> 600.00".
  //
  // Re-reading on open closes the window that actually happens. The
  // seconds while the dialog is open remain, which is why the RPC should
  // eventually take the expected base and refuse a mismatch.
  const { data: fresh } = useQuery({
    queryKey: ["wallet-edit-base", wallet?.id],
    enabled: open && !!wallet?.id,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallets")
        .select("usd_balance, eur_balance")
        .eq("id", wallet!.id)
        .single();
      if (error) throw error;
      return data as { usd_balance: number | string; eur_balance: number | string };
    },
  });

  const currentUsd = round2(
    Number(fresh?.usd_balance ?? wallet?.usd_balance ?? 0),
  );
  const currentEur = round2(
    Number(fresh?.eur_balance ?? wallet?.eur_balance ?? 0),
  );
  // Until the fresh read lands, the base on screen is the one from the
  // list — so the form stays shut rather than computing a delta against a
  // number we already suspect.
  const baseUnknown = open && !!wallet?.id && !fresh;

  // Second-confirmation gate: the form's Save populates this pending
  // payload; only an explicit confirm below actually runs the mutation.
  const [pending, setPending] = useState<{
    walletId: string;
    usdDelta: number;
    eurDelta: number;
    reason: string;
  } | null>(null);

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
    setPending(null);
  }, [open, wallet, currentUsd, currentEur, reset]);

  const watchedUsd = Number(watch("usd_balance") ?? 0);
  const watchedEur = Number(watch("eur_balance") ?? 0);
  const usdDelta = round2(watchedUsd - currentUsd);
  const eurDelta = round2(watchedEur - currentEur);
  const finalUsd = round2(currentUsd + usdDelta);
  const finalEur = round2(currentEur + eurDelta);
  const usdNegative = finalUsd < 0;
  const eurNegative = finalEur < 0;
  const noChange = usdDelta === 0 && eurDelta === 0 || baseUnknown;
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
      setPending(null);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error("Failed to update wallet", { description: error.message });
    },
  });

  // Step 1: validate and stage the change — does NOT write yet.
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
    setPending({
      walletId: wallet.id,
      usdDelta,
      eurDelta,
      reason: values.reason,
    });
  };

  // Step 2: explicit second confirmation actually runs the mutation.
  const confirmSave = () => {
    if (!pending) return;
    mutate(pending);
  };

  const formatDelta = (n: number, currency: "USD" | "EUR") => {
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(2)} ${currency}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {pending ? "Confirm balance change" : "Edit wallet balances"}
          </DialogTitle>
          <DialogDescription>
            {pending ? (
              "This change is logged to the audit trail and affects real money. Review it before saving."
            ) : (
              <>
                Update USD and EUR balances for{" "}
                {wallet?.advertiser?.tenant_client_code ?? "selected wallet"}. A
                reason is required for audit logging.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {pending ? (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              You are about to change this wallet&apos;s balance. This action is
              logged and affects real money. Are you sure?
            </div>
            <div className="grid gap-2 text-sm">
              {pending.eurDelta !== 0 && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">EUR balance</span>
                  <span className="font-medium">
                    {currentEur.toFixed(2)} →{" "}
                    {round2(currentEur + pending.eurDelta).toFixed(2)} EUR
                    <span
                      className={
                        pending.eurDelta > 0
                          ? "ml-2 text-green-600"
                          : "ml-2 text-amber-600"
                      }
                    >
                      ({formatDelta(pending.eurDelta, "EUR")})
                    </span>
                  </span>
                </div>
              )}
              {pending.usdDelta !== 0 && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">USD balance</span>
                  <span className="font-medium">
                    {currentUsd.toFixed(2)} →{" "}
                    {round2(currentUsd + pending.usdDelta).toFixed(2)} USD
                    <span
                      className={
                        pending.usdDelta > 0
                          ? "ml-2 text-green-600"
                          : "ml-2 text-amber-600"
                      }
                    >
                      ({formatDelta(pending.usdDelta, "USD")})
                    </span>
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-1 border-t pt-2">
                <span className="text-muted-foreground">Reason</span>
                <span className="font-medium break-words">
                  {pending.reason}
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPending(null)}
                disabled={isPending}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmSave}
                disabled={isPending}
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Yes, change balances
              </Button>
            </DialogFooter>
          </div>
        ) : (
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
              Review change
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
