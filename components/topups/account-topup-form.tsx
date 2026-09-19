"use client";

import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { AdAccount } from "@/lib/types/account";
import { Wallet } from "@/lib/types/wallet";
import { cn, formatCurrency } from "@/lib/utils";
import { isAccountLocked } from "@/lib/pure-account-status";
import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
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
import { quoteTopupFeePct } from "@/actions/topup-actions";
import {
  AD_ACCOUNT_CUSTOMER_COLUMNS,
  AD_ACCOUNT_CORE_COLUMNS,
} from "@/lib/ad-account-columns";

type CurrencyCode = "USD" | "EUR";

type AccountRecord = Pick<
  AdAccount,
  | "id"
  | "name"
  | "fee"
  | "advertiser_id"
  | "tenant_id"
  | "platform"
  | "currency"
  | "min_topup"
  | "status"
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

const normalizeAccountCurrency = (
  value: string | null | undefined,
): CurrencyCode | null => {
  const normalized = typeof value === "string" ? value.toUpperCase() : "";

  if (normalized === "USD" || normalized === "EUR") {
    return normalized;
  }

  return null;
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
      // Named columns. This dialog is opened by the CUSTOMER, and
      // ad_accounts carries `notes` (an operator's private remarks,
      // including supplier account numbers and what we pay) and
      // `metadata`. The form reads six fields; none of them is ours.
      const { data, error } = await supabase
        .from("ad_accounts")
        .select(AD_ACCOUNT_CUSTOMER_COLUMNS)
        .eq("tenant_id", profile?.tenant_id);
      if (error) {
        const retry = await supabase
          .from("ad_accounts")
          .select(AD_ACCOUNT_CORE_COLUMNS)
          .eq("tenant_id", profile?.tenant_id);
        if (retry.error) throw retry.error;
        return (retry.data ?? []) as unknown as AccountRecord[];
      }
      return (data ?? []) as unknown as AccountRecord[];
    },
  });

  const accountOptions = useMemo(() => {
    return accounts
      // ── A LOCKED ACCOUNT IS NOT A DESTINATION ──────────────────────
      //
      // The dashboard hides Top up on a locked card, but that hides the
      // ENTRY POINT, not the picker inside the dialog — so a customer
      // opened the dialog from a healthy account, changed the dropdown to
      // a banned one and funded it. Money on an ad account only comes
      // back through a withdrawal, and withdrawals are refused on a
      // locked account by both the button and the server. So it goes in
      // and it cannot come out.
      //
      // Both ADMIN funding paths were given this guard and the comment
      // there says why; the customer's path does not go through a server
      // action, so it inherited neither. isAccountLocked is the app's
      // single source of truth for unusable.
      .filter((a) => !isAccountLocked(a.status))

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
  const selectedAccountCurrency = normalizeAccountCurrency(
    selectedAccount?.currency,
  );

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
    selectedAccount?.min_topup ?? 300;
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
          if (
            selectedAccountCurrency &&
            values.currency !== selectedAccountCurrency
          ) {
            ctx.addIssue({
              path: ["currency"],
              code: "custom",
              message: `Only ${selectedAccountCurrency} wallet is allowed for this account`,
            });
          }

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
    [usdBalance, eurBalance, hasWallet, selectedAccountCurrency, minTopupAmount],
  );

  const { control, handleSubmit, setValue, watch, reset } = useForm<FormValues>(
    {
      defaultValues: {
        account_id: account?.id ?? "",
        currency: normalizeAccountCurrency(account?.currency) ?? "USD",
        amount: 0,
      },
      resolver: zodResolver(formSchema) as Resolver<FormValues>,
    },
  );

  const selectedCurrency = watch("currency");
  const amount = watch("amount");
  const accountId = watch("account_id");
  // ── WHAT THIS TOP-UP ACTUALLY COSTS, ASKED OF THE SERVER ───────────
  //
  // This read `selectedAccount.fee` and nothing else. That column is ONE
  // of five inputs the server consults: resolveEffectiveFeePct in
  // actions/topup-actions.ts also weighs the advertiser's plan rate, a
  // topup_fee_waiver, a topup_discount perk and the Meta-EU-Premium two
  // points — and the account's own column is treated as "not set" when it
  // is 0, which it is for every account nobody has priced by hand.
  //
  // So the common case was the broken one: an account with fee = 0 on a
  // 5% plan hid the fee line entirely, said the whole amount lands, and
  // then 5% was taken. The customer is told one number and charged
  // another, on the screen that spends their money.
  //
  // quoteTopupFeePct runs that same resolution server-side, scoped to the
  // caller's own advertiser and their own account, and returns the
  // percentage ONLY — no plan name, no perk name, nothing about where the
  // rate comes from.
  const feeQuote = useQuery({
    queryKey: ["topup-fee-quote", accountId],
    enabled: !!accountId,
    // The rate is a property of the account and the plan, neither of
    // which moves while a dialog is open. Re-asking on every keystroke
    // would be a round-trip per character.
    staleTime: 60_000,
    queryFn: async () => {
      const res = await quoteTopupFeePct(accountId);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  // The account's own column stays the fallback for the seconds before
  // the quote lands and for the case where it cannot be reached — it is
  // the best figure available here without the server, and it is never
  // shown as final: the submit button waits for the quote.
  const fee = feeQuote.data?.pct ?? parseAmount(selectedAccount?.fee);
  const feeIsSettled = !!accountId && feeQuote.isSuccess;
  // AN ERRORED QUERY IS NOT A LOADED ONE. In react-query v5 a failed
  // query has isLoading === false, so gating only on isLoading left the
  // error branch doing exactly what this whole change exists to stop:
  // the button enabled, the summary printing "Top-up fee (0%) €0.00" and
  // "Lands on the account €10,000.00" from the account's own column —
  // the column the server treats as NOT SET and overrides with the plan
  // rate. Three lines below its own comment saying never to open the
  // confirmation on a fee we have not resolved.
  const feeUnresolved = !!accountId && (feeQuote.isLoading || feeQuote.isError);
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

  useEffect(() => {
    if (
      selectedAccountCurrency &&
      selectedCurrency !== selectedAccountCurrency
    ) {
      setValue("currency", selectedAccountCurrency, { shouldValidate: true });
    }
  }, [selectedAccountCurrency, selectedCurrency, setValue]);

  const selectedBalance = selectedCurrency === "USD" ? usdBalance : eurBalance;
  const remainingBalance = selectedBalance - parseAmount(amount);

  const { mutate, isPending } = useCreateAccountTopup({
    onSuccess: () => {
      reset({
        account_id: account?.id ?? "",
        currency: selectedAccountCurrency ?? "USD",
        amount: 0,
      });
      onSuccess();
    },
  });

  const amountDescription = hasWallet
    ? `Max: ${formatCurrency(selectedBalance, selectedCurrency)}`
    : "Wallet balance is unavailable.";

  const visibleCurrencyChoices = useMemo(() => {
    if (!selectedAccountCurrency) {
      return [];
    }

    if (selectedAccountCurrency === "USD") {
      return [
        {
          id: "wallet-usd",
          value: "USD" as const,
          label: "USD Wallet",
          balance: usdBalance,
          icon: <DollarSign className="h-4 w-4" />,
        },
      ];
    }

    return [
      {
        id: "wallet-eur",
        value: "EUR" as const,
        label: "EUR Wallet",
        balance: eurBalance,
        icon: <Euro className="h-4 w-4" />,
      },
    ];
  }, [selectedAccountCurrency, usdBalance, eurBalance]);


  // Money leaving a wallet for an ad account is not undone by an admin
  // and cannot be undone at all by the customer, so it is asked twice.
  const [confirming, setConfirming] = useState<FormValues | null>(null);

  return (
    <form onSubmit={handleSubmit((values) => setConfirming(values))}>
      {/* dvh, and smaller. 90vh is measured against the viewport with the
          browser toolbar HIDDEN, so this inner scroller could be taller
          than the max-h-[92dvh] sheet containing it — two nested scrollers,
          and on iOS the outer one steals the fling that would reveal the
          submit button at the bottom of this one. The wallet top-up dialog
          already uses 70dvh; this is the same. */}
      {/* A plain scrollport. Radix's ScrollArea sets its Viewport to
            h-full and its inner wrapper to display:table, so against a
            parent whose height is a max-height or a flex-1 the height
            never resolves — the Root clips at overflow:hidden and
            nothing scrolls at all. See the long note in
            components/wallet/wallet-topup-dialog.tsx. */}
          <div className="max-h-[62dvh] overflow-y-auto overscroll-contain pr-2 sm:max-h-[66dvh]">
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
                {visibleCurrencyChoices.length > 0 ? (
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="grid gap-3 grid-cols-1"
                  >
                    {visibleCurrencyChoices.map((choice) => (
                      <CurrencyChoice
                        key={choice.id}
                        id={choice.id}
                        value={choice.value}
                        label={choice.label}
                        balance={choice.balance}
                        icon={choice.icon}
                        disabled={!hasWallet}
                      />
                    ))}
                  </RadioGroup>
                ) : (
                  <FieldDescription>
                    Select an account with configured currency to continue.
                  </FieldDescription>
                )}
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
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
              // 0.01, not 0.1. A step of a tenth makes the browser refuse any exact
                // cent amount — 100.25 fails the step check and the form will not
                // submit, with no message that says why.
                step={0.01}
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
              feePending={feeUnresolved}
              feeFailed={feeQuote.isError}
            />
          )}

        </div>
      </div>

      {/* OUTSIDE the scroller. It used to sit at the bottom of a nested
          scroll area, so reaching it meant scrolling the inner one to its
          end — on iOS, past an outer sheet that steals the fling. The
          button that spends the money is always on screen now. */}
      <div className="mt-4 flex justify-end border-t pt-3">
        <Button
          type="submit"
          disabled={
            isPending ||
            !hasWallet ||
            !selectedAccount ||
            !selectedAccountCurrency ||
            // The picker filters these out, but this dialog can also be
            // opened WITH an account already chosen, from the card. A
            // locked one must not be fundable from either door.
            isAccountLocked(selectedAccount.status) ||
            // Never open the confirmation on a fee we have not resolved
            // yet. It is one round-trip, and the whole point of that
            // dialog is that the figures in it are the real ones. A
            // FAILED quote counts: the fallback is the account's own
            // column, which is the wrong number for anyone on a plan.
            feeUnresolved
          }
          title={
            feeQuote.isError
              ? "We could not check this account's rate — reload and try again"
              : feeQuote.isLoading
                ? "Checking the fee on this account…"
                : undefined
          }
        >
          {(isPending || feeQuote.isLoading) && (
            <Loader2 className="animate-spin" />
          )}
          Top up this account
        </Button>
      </div>

      <ConfirmModal
        open={!!confirming}
        onOpenChange={(next) => {
          if (!next) setConfirming(null);
        }}
        title="Move this money to the ad account?"
        lead="It leaves your wallet now. Money on an ad account can only come back through a withdrawal request, which we have to approve."
        cta="Yes, top it up"
        busy={isPending}
        busyLabel="Sending…"
        onConfirm={() =>
          confirming &&
          mutate(confirming, {
            // ── A FAILED RESPONSE IS NOT A FAILED CALL ─────────────
            //
            // `confirming` was cleared on success only, and `busy` goes
            // false on error — so a failure left this dialog open with a
            // live "Yes, top it up". The dangerous shape is a call that
            // COMMITTED and whose response was lost: a 504, a dropped
            // connection, a backgrounded tab on mobile. The toast says
            // "Unable to request topup", the customer taps again, and
            // the whole amount leaves the wallet twice — which the
            // dialog's own words say "can only come back through a
            // withdrawal request, which we have to approve".
            //
            // top_up_create_for_advertiser exists only on the live
            // database, so nothing in this repository can say whether it
            // is idempotent. The client is the only defence there is.
            // The sibling ad-account request form closes exactly this
            // door and explains why; this one did not.
            onError: () => setConfirming(null),
          })
        }
      >
        <ConfirmFact
          label="Ad account"
          value={selectedAccount?.name ?? "—"}
        />
        <ConfirmFact
          label="Out of your wallet"
          value={formatCurrency(parseAmount(amount), selectedCurrency)}
          strong
        />
        {fee > 0 && (
          <ConfirmFact
            label={`Top-up fee (${fee}%)`}
            value={formatCurrency(
              (parseAmount(amount) * fee) / 100,
              selectedCurrency,
            )}
          />
        )}
        <ConfirmFact
          label="Lands on the account"
          value={formatCurrency(
            parseAmount(amount) - (parseAmount(amount) * fee) / 100,
            selectedCurrency,
          )}
          strong
        />
        <ConfirmFact
          label="Wallet afterwards"
          value={formatCurrency(remainingBalance, selectedCurrency)}
        />
        {/* Said out loud rather than hidden. If the rate could not be
            resolved, the figures above came from the ad account's own
            column, which is not what a customer on a plan is charged —
            so the dialog says which of the two it is showing instead of
            presenting a guess with the same confidence as a fact. */}
        {!feeIsSettled && (
          <p className="pt-2 text-xs text-muted-foreground">
            We could not confirm this account&apos;s rate just now, so the
            fee above is the account&apos;s own. The amount charged is
            always the rate on your account.
          </p>
        )}
      </ConfirmModal>
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
  feePending,
  feeFailed = false,
}: {
  currency: CurrencyCode;
  balance: number;
  amount: number;
  fee_amount: number;
  fee_pct: number;
  remaining: number;
  // The fee has been asked of the server and the answer is not back. A
  // dash is the honest thing to print; a number taken from the account's
  // own column would be the wrong one for anyone on a plan.
  feePending: boolean;
  /** …and it failed rather than being still in flight. */
  feeFailed?: boolean;
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
        {/* It said "Topup amount", which is the same words as the field
            above it while being a different number — the field is what
            leaves the wallet, this is what survives the fee. Two labels,
            because they are two amounts. */}
        <span className="text-muted-foreground">Lands on the account</span>
        <span className="font-medium">
          {feePending ? "—" : formatCurrency(amount, currency)}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {feePending ? "Top-up fee" : `Top-up fee (${fee_pct}%)`}
        </span>
        <span className="font-medium">
          {feePending
            ? feeFailed
              ? "couldn't check"
              : "checking…"
            : formatCurrency(fee_amount, currency)}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Wallet afterwards</span>
        <span
          className={cn("font-semibold", remaining < 0 && "text-destructive")}
        >
          {formatCurrency(remaining, currency)}
        </span>
      </div>
    </div>
  );
}
