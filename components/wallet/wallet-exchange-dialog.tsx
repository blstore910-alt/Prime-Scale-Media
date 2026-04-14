"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import useExchangeRates from "@/components/settings/finance/use-exchange-rates";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type Currency = "USD" | "EUR";

type FormValues = {
  from_currency: Currency;
  from_amount: number;
};

const getRate = (baseEurRate: number, from: Currency, to: Currency) => {
  if (from === to) return 1;
  if (from === "USD" && to === "EUR") return 1 / baseEurRate;
  if (from === "EUR" && to === "USD") return baseEurRate;
  return 1;
};

export default function WalletExchangeDialog({
  open,
  onOpenChange,
  walletId,
  createdBy,
  usdBalance,
  eurBalance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletId: string | null;
  createdBy: string | null;
  usdBalance: number;
  eurBalance: number;
}) {
  const queryClient = useQueryClient();
  const {
    exchangeRates,
    isLoading: ratesLoading,
    isError: ratesError,
  } = useExchangeRates({ activeOnly: true });

  const eurRateRaw = Number(exchangeRates?.[0]?.eur ?? 0);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
    setValue,
  } = useForm<FormValues>({
    defaultValues: {
      from_currency: "USD",
      from_amount: 0,
    },
  });

  const fromCurrency = watch("from_currency");
  const fromAmountRaw = watch("from_amount");
  const fromAmount =
    typeof fromAmountRaw === "number" && !isNaN(fromAmountRaw)
      ? fromAmountRaw
      : 0;
  const toCurrency: Currency = fromCurrency === "USD" ? "EUR" : "USD";
  const rate = eurRateRaw ? getRate(eurRateRaw, fromCurrency, toCurrency) : 0;
  const toAmount = rate ? Number((fromAmount * rate).toFixed(2)) : 0;
  const amountRegister = register("from_amount", {
    required: "Amount is required",
    valueAsNumber: true,
    min: {
      value: 0,
      message: "Amount must be 0 or greater",
    },
  });
  const hasUsd = usdBalance > 0;
  const hasEur = eurBalance > 0;
  const hasSingleBalance = (hasUsd && !hasEur) || (!hasUsd && hasEur);

  const feeAmount = toAmount * 0.006;
  const exchangeableAmount = toAmount - feeAmount; // Amount after fee deduction

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    if (hasUsd && !hasEur) {
      setValue("from_currency", "USD", { shouldDirty: true });
    } else if (!hasUsd && hasEur) {
      setValue("from_currency", "EUR", { shouldDirty: true });
    }
  }, [open, hasUsd, hasEur, setValue]);

  const { mutate, isPending } = useMutation({
    mutationKey: ["wallet-exchange", walletId],
    mutationFn: async (values: FormValues) => {
      if (!walletId || !createdBy) {
        throw new Error("Missing wallet context.");
      }
      if (!eurRateRaw) {
        throw new Error("Exchange rate is unavailable.");
      }

      const supabase = createClient();
      const { data: walletRow, error: walletError } = await supabase
        .from("wallets")
        .select("id, usd_balance, eur_balance, updated_at")
        .eq("id", walletId)
        .single();

      if (walletError) throw walletError;

      const currentUsd = Number(walletRow.usd_balance ?? 0);
      const currentEur = Number(walletRow.eur_balance ?? 0);

      const available =
        values.from_currency === "USD" ? currentUsd : currentEur;

      if (values.from_amount > available) {
        throw new Error("Insufficient balance for this exchange.");
      }

      const exchangeRate = getRate(
        eurRateRaw,
        values.from_currency,
        toCurrency,
      );

      const { data: exchange, error: exchangeError } = await supabase
        .from("wallet_exchanges")
        .insert({
          wallet_id: walletId,
          from_currency: values.from_currency,
          to_currency: toCurrency,
          from_amount: values.from_amount,
          to_amount: exchangeableAmount,
          fee_amount: feeAmount,
          exchange_rate: exchangeRate,
          created_by: createdBy,
        })
        .select("*")
        .single();

      if (exchangeError) throw exchangeError;

      const nextUsd =
        values.from_currency === "USD"
          ? Number((currentUsd - values.from_amount).toFixed(2))
          : Number((currentUsd + exchangeableAmount).toFixed(2));
      const nextEur =
        values.from_currency === "EUR"
          ? Number((currentEur - values.from_amount).toFixed(2))
          : Number((currentEur + exchangeableAmount).toFixed(2));

      const { data: updatedWallet, error: updateError } = await supabase
        .from("wallets")
        .update({
          usd_balance: nextUsd,
          eur_balance: nextEur,
          updated_at: new Date().toISOString(),
        })
        .eq("id", walletId)
        .select("id, usd_balance, eur_balance")
        .single();

      if (updateError) {
        await supabase.from("wallet_exchanges").delete().eq("id", exchange.id);
        throw updateError;
      }

      return { exchange, updatedWallet };
    },
    onSuccess: () => {
      toast.success("Exchange completed", {
        description: "Your wallet balances have been updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      queryClient.invalidateQueries({
        queryKey: ["wallet-exchanges", walletId],
      });
      onOpenChange(false);
      reset();
    },
    onError: (err: Error) => {
      toast.error("Exchange failed", { description: err.message });
    },
  });

  const onSubmit = (values: FormValues) => mutate(values);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exchange balance</DialogTitle>
          <DialogDescription>
            Convert between USD and EUR using the latest exchange rate.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-2">
            <Label htmlFor="from-currency">From currency</Label>
            <select
              id="from-currency"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              {...register("from_currency")}
              disabled={hasSingleBalance}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="from-amount">Amount</Label>
            <Input
              id="from-amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              {...amountRegister}
            />
            {errors.from_amount && (
              <p className="text-sm text-destructive">
                {errors.from_amount.message}
              </p>
            )}
          </div>

          <div className="rounded-lg border p-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Rate</span>
              <span>
                {ratesLoading
                  ? "Loading..."
                  : ratesError || !rate
                    ? "Unavailable"
                    : `1 ${fromCurrency} = ${rate.toFixed(6)} ${toCurrency}`}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span>Exchange Fee (0.6%)</span>
              <span className="text-foreground font-medium">
                {rate ? `${feeAmount.toFixed(2)} ${toCurrency}` : "-"}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span>{"You'll receive"}</span>
              <span className="text-foreground font-medium">
                {rate ? `${exchangeableAmount.toFixed(2)} ${toCurrency}` : "-"}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span>Available balance</span>
              <span>
                {fromCurrency === "USD"
                  ? `${usdBalance.toFixed(2)} USD`
                  : `${eurBalance.toFixed(2)} EUR`}
              </span>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" size="sm">
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowLeftRight className="h-4 w-4" />
              )}
              Exchange
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
