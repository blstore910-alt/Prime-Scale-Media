"use client";

import useExchangeRates from "@/components/settings/finance/use-exchange-rates";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { AdAccount } from "@/lib/types/account";
import { Wallet } from "@/lib/types/wallet";
import { cn, formatCurrency } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, DollarSign, Euro, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, Resolver, useForm } from "react-hook-form";
import * as z from "zod";
import InputField from "../form/input-field";
import SelectField from "../form/select-field";
import { Button } from "../ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import { Label } from "../ui/label";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { ScrollArea } from "../ui/scroll-area";
import { Skeleton } from "../ui/skeleton";
import { useCreateAccountTopup } from "./use-create-account-topup";
import { parse } from "path";

type CurrencyCode = "USD" | "EUR";

type AccountRecord = Pick<
  AdAccount,
  "id" | "name" | "fee" | "advertiser_id" | "tenant_id" | "platform"
> & {
  advertiser?: { tenant_client_code?: string | null } | null;
};

type FormValues = {
  account_id: string;
  currency: CurrencyCode;
  amount: number;
};

const parseAmount = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function AccountTopupForm({
  account,
  onSuccess,
}: {
  account?: AdAccount | null;
  onSuccess: () => void;
}) {
  const { profile } = useAppContext();
  const [selectedAccount, setSelectedAccount] = useState<AccountRecord | null>(
    account ?? null,
  );

  const {
    data: accounts = [],
    isLoading: accountsLoading,
    isError: accountsError,
    error: accountsErrorMessage,
  } = useQuery<AccountRecord[]>({
    queryKey: ["ad-accounts", "topup-form", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("ad_accounts")
        .select("*")
        .eq("tenant_id", profile?.tenant_id);
      if (error) throw error;
      return (data ?? []) as AccountRecord[];
    },
  });

  const accountOptions = useMemo(() => {
    return accounts

      .sort((a, b) => {
        const aCode = a.advertiser?.tenant_client_code ?? "";
        const bCode = b.advertiser?.tenant_client_code ?? "";
        return aCode.localeCompare(bCode, undefined, {
          numeric: true,
          sensitivity: "base",
        });
      })
      .map((account) => ({
        value: account.id,
        label: (
          <span className="inline-flex w-full justify-between gap-2">
            <span>{account.name}</span>
          </span>
        ),
      }));
  }, [accounts]);

  const advertiserId =
    selectedAccount?.advertiser_id ?? profile?.advertiser?.[0]?.id ?? null;

  const { exchangeRates } = useExchangeRates({ activeOnly: true });

  const {
    data: wallet,
    isLoading: walletLoading,
    isError: walletError,
    error: walletErrorMessage,
  } = useQuery<Wallet | null>({
    queryKey: ["wallet", "topup-form", advertiserId],
    enabled: !!advertiserId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .eq("advertiser_id", advertiserId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Wallet | null;
    },
  });

  const usdBalance = parseAmount(wallet?.usd_balance);
  const eurBalance = parseAmount(wallet?.eur_balance);
  const hasWallet = !!wallet;

  const minTopupAmount =
    account?.min_topup !== null ? (account?.min_topup as number) : 300;

  const formSchema = useMemo(
    () =>
      z
        .object({
          account_id: z.string().min(1, "Ad account is required"),
          currency: z.enum(["USD", "EUR"]),
          amount: z.coerce
            .number()
            .min(minTopupAmount, `Minimum Amount: ${minTopupAmount}`)
            .positive("Amount is required"),
        })
        .superRefine((values, ctx) => {
          if (!hasWallet) return;
          const max = values.currency === "USD" ? usdBalance : eurBalance;
          if (values.amount > max) {
            ctx.addIssue({
              path: ["amount"],
              code: "custom",
              message: `Amount exceeds available ${values.currency} balance`,
            });
          }
        }),
    [usdBalance, eurBalance, hasWallet],
  );

  const { control, handleSubmit, setValue, watch, reset } = useForm<FormValues>(
    {
      defaultValues: {
        account_id: account?.id ?? "",
        currency: "USD",
        amount: 0,
      },
      resolver: zodResolver(formSchema) as Resolver<FormValues>,
    },
  );

  const selectedCurrency = watch("currency");
  const amount = watch("amount");
  const accountId = watch("account_id");
  const fee = selectedAccount?.fee ?? 0;
  useEffect(() => {
    if (account?.id) {
      setValue("account_id", account.id);
    }
  }, [account?.id, setValue]);

  useEffect(() => {
    if (!accountId) {
      setSelectedAccount(null);
      return;
    }
    const fromList = accounts.find((item) => item.id === accountId);
    if (fromList) {
      setSelectedAccount(fromList);
      return;
    }
    if (account?.id === accountId) {
      setSelectedAccount(account);
      return;
    }
    setSelectedAccount(null);
  }, [accountId, accounts, account]);

  const selectedBalance = selectedCurrency === "USD" ? usdBalance : eurBalance;
  const remainingBalance = selectedBalance - parseAmount(amount);

  const { mutate, isPending } = useCreateAccountTopup({
    selectedAccount,
    wallet: wallet ?? null,
    exchangeRates,
    profile,
    onSuccess: () => {
      reset({
        account_id: account?.id ?? "",
        currency: "USD",
        amount: 0,
      });
      onSuccess();
    },
  });

  const amountDescription = hasWallet
    ? `Max: ${formatCurrency(selectedBalance, selectedCurrency)}`
    : "Wallet balance is unavailable.";

  const isHKMeta = selectedAccount?.platform.includes("hk-meta");

  useEffect(() => {
    if (watch("currency") === "EUR" && isHKMeta) {
      setValue("currency", "USD");
    }
  }, [setValue, watch, isHKMeta]);
  return (
    <form onSubmit={handleSubmit((values) => mutate(values))}>
      <ScrollArea className="max-h-[70vh] pr-2">
        <div className="px-1 space-y-4">
          <SelectField
            label="Ad Account"
            name="account_id"
            id="account-select"
            control={control}
            options={accountOptions}
            placeholder={accountsLoading ? "Loading accounts..." : "Select"}
          />
          {accountsError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>
                {(accountsErrorMessage as Error)?.message ??
                  "Unable to load ad accounts."}
              </span>
            </div>
          )}

          <Controller
            control={control}
            name="currency"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel>Wallet Balance</FieldLabel>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  <CurrencyChoice
                    id="wallet-usd"
                    value="USD"
                    label="USD Wallet"
                    balance={usdBalance}
                    icon={<DollarSign className="h-4 w-4" />}
                    disabled={!hasWallet}
                  />
                  <CurrencyChoice
                    id="wallet-eur"
                    value="EUR"
                    label="EUR Wallet"
                    balance={eurBalance}
                    icon={<Euro className="h-4 w-4" />}
                    disabled={!hasWallet || isHKMeta}
                  />
                </RadioGroup>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
                {isHKMeta && (
                  <FieldDescription>
                    EUR wallet is not available for this account.
                  </FieldDescription>
                )}
              </Field>
            )}
          />

          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
              {selectedCurrency === "USD" ? "$" : "€"}
            </span>
            <InputField
              name="amount"
              id="topup-amount"
              label="Amount"
              control={control}
              type="number"
              min={0}
              max={hasWallet ? selectedBalance : undefined}
              className="pl-7"
              disabled={!hasWallet}
              step={0.1}
              description={amountDescription}
            />
          </div>

          {walletLoading ? (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : walletError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span>
                  {(walletErrorMessage as Error)?.message ??
                    "Unable to load wallet balance."}
                </span>
              </div>
            </div>
          ) : !hasWallet ? (
            <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
              {advertiserId
                ? "No wallet found for this advertiser."
                : "Select an account to load wallet balances."}
            </div>
          ) : (
            <BalanceSummary
              currency={selectedCurrency}
              balance={selectedBalance}
              amount={parseAmount(amount) - parseAmount(amount) * (fee / 100)}
              fee_pct={fee}
              fee_amount={(parseAmount(amount) * fee) / 100}
              remaining={remainingBalance}
            />
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={isPending || !hasWallet || !selectedAccount}
            >
              {isPending && <Loader2 className="animate-spin" />}
              Submit
            </Button>
          </div>
        </div>
      </ScrollArea>
    </form>
  );
}

function CurrencyChoice({
  id,
  value,
  label,
  balance,
  icon,
  disabled,
}: {
  id: string;
  value: CurrencyCode;
  label: string;
  balance: number;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div>
      <RadioGroupItem
        value={value}
        id={id}
        className="peer sr-only"
        disabled={disabled}
      />
      <Label
        htmlFor={id}
        className={cn(
          "flex flex-col gap-2 rounded-md border-2 border-muted bg-popover p-4 transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary",
          disabled && "cursor-not-allowed opacity-60 hover:bg-popover",
        )}
      >
        <span className="inline-flex items-center gap-2 font-semibold">
          {icon}
          {label}
        </span>
        <span className="text-xs text-muted-foreground">
          Available: {formatCurrency(balance, value)}
        </span>
      </Label>
    </div>
  );
}

function BalanceSummary({
  currency,
  balance,
  amount,
  remaining,
  fee_amount,
  fee_pct,
}: {
  currency: CurrencyCode;
  balance: number;
  amount: number;
  fee_amount: number;
  fee_pct: number;
  remaining: number;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">
        Balance Summary
      </p>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Current balance</span>
        <span className="font-medium">{formatCurrency(balance, currency)}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Topup amount</span>
        <span className="font-medium">{formatCurrency(amount, currency)}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Fee ({fee_pct}%)</span>
        <span className="font-medium">
          {formatCurrency(fee_amount, currency)}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Remaining balance</span>
        <span
          className={cn("font-semibold", remaining < 0 && "text-destructive")}
        >
          {formatCurrency(remaining, currency)}
        </span>
      </div>
    </div>
  );
}
