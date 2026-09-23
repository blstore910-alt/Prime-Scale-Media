"use client";

import { useAppContext } from "@/context/app-provider";
import useUsdToEur from "@/hooks/use-usd-to-eur";
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
import { Skeleton } from "../ui/skeleton";
import { useCreateAccountTopup } from "./use-create-account-topup";
import { quoteTopupFeePct } from "@/actions/topup-actions";
import AmountPills from "@/components/ui/amount-pills";
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

  // ── A FLOOR NOTHING ENFORCES ───────────────────────────────────────
  //
  // `ad_accounts.min_topup` is read by no RPC, no trigger and no CHECK,
  // and createAdAccountAsAdmin writes 0 when it is null. So this `?? 300`
  // was a rule that existed only in this browser: a customer with
  // EUR 200 in their wallet, on an account whose min_topup is NULL, was
  // told "Minimum Amount: 300" and could not move their own
  // already-paid money onto their own ad account -- while
  // top_up_create_for_advertiser would have accepted it.
  //
  // The wallet dialog says the same thing about the other 300 one file
  // over: "NOT A LITERAL ... writing 300 here a second time means two
  // places to change".
  //
  // A configured minimum is still honoured. An absent one is not
  // invented.
  const configuredMin = Number(selectedAccount?.min_topup);
  const minTopupAmount =
    Number.isFinite(configuredMin) && configuredMin > 0 ? configuredMin : 0;
  const formSchema = useMemo(
    () =>
      z
        .object({
          account_id: z.string().min(1, "Ad account is required"),
          currency: z.enum(["USD", "EUR"]),
          amount: z.coerce
            .number()
            .min(
              minTopupAmount,
              // The currency was missing on a form whose amount box is
              // prefixed with one. Taken from the ACCOUNT, not from
              // `selectedCurrency` -- that is derived from watch(),
              // which is derived from the form this schema builds, and
              // naming it here made the type circular.
              `This account has a minimum of ${
                selectedAccount?.currency ?? "EUR"
              } ${minTopupAmount.toFixed(2)}`,
            )
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
    [
      usdBalance,
      eurBalance,
      hasWallet,
      selectedAccountCurrency,
      minTopupAmount,
      selectedAccount?.currency,
    ],
  );

  const { control, handleSubmit, setValue, watch, reset } = useForm<FormValues>(
    {
      defaultValues: {
        account_id: account?.id ?? "",
        currency: normalizeAccountCurrency(account?.currency) ?? "USD",
        // Empty, not 0. A money box holding "0" turns a typed 50 into
        // "050" -- the same fault the wallet top-up dialog had, on the
        // one figure in this form that has to be exactly right.
        amount: undefined,
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

  // ── THE RATE, WHICH THIS SCREEN NEVER ASKED FOR ────────────────────
  //
  // The two admin creation paths both REFUSE a non-USD top-up when
  // there is no active exchange rate, and say why: "a 1,000 EUR
  // transfer recorded as nothing arriving… and the supplier push then
  // funds $0". The customer's own path read exchange_rates nowhere --
  // and saving a new rate stands the old one down first, so "no active
  // rate" is a real state, not a theoretical one.
  const { rate: usdRate, isLoading: rateLoading } = useUsdToEur();
  // rateReadFailed/rateLoading still feed the guard below; the customer
  // is no longer told a dollar figure, so there is nothing left to hide
  // behind an "unknown rate" hint.
  // Only for a non-USD wallet: a USD top-up needs no conversion.
  const blockedByRate =
    selectedCurrency !== "USD" && !rateLoading && !usdRate;
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
        amount: undefined,
      });
      onSuccess();
    },
  });

  const amountDescription = hasWallet
    ? selectedBalance > 0
      ? `Fee included. You can spend up to ${formatCurrency(selectedBalance, selectedCurrency)}.`
      : // A bare "Max: EUR 0.00" under an empty box is a dead end: it
        // states a limit without saying what to do about it.
        `Your ${selectedCurrency} wallet is empty — top it up before funding an ad account.`
    : "Wallet balance is unavailable.";

  // Null when the wallet read failed or has not returned: the card
  // prints a dash for that, instead of a confident 0.00.
  const balanceKnown = !walletLoading && !walletError && hasWallet;

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
          balance: balanceKnown ? usdBalance : null,
          icon: <DollarSign className="h-4 w-4" />,
        },
      ];
    }

    return [
      {
        id: "wallet-eur",
        value: "EUR" as const,
        label: "EUR Wallet",
        balance: balanceKnown ? eurBalance : null,
        icon: <Euro className="h-4 w-4" />,
      },
    ];
  }, [selectedAccountCurrency, usdBalance, eurBalance, balanceKnown]);


  // Money leaving a wallet for an ad account is not undone by an admin
  // and cannot be undone at all by the customer, so it is asked twice.
  const [confirming, setConfirming] = useState<FormValues | null>(null);

  return (
    <form
      onSubmit={handleSubmit((values) => setConfirming(values))}
      className="flex min-h-0 flex-1 flex-col"
    >
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
      {/* No max-height of its own any more: it takes whatever the sheet
          has left. A second max-h here was the second scrollbar. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1.5">
        <div className="space-y-4 px-0.5 pt-2 pb-1">
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
                    {/* The old copy read "Select an account with
                        configured currency to continue" -- an
                        instruction with no control behind it. There is
                        no currency field on this form, and the customer
                        cannot set one. Found on a live account whose
                        currency column is empty. */}
                    {selectedAccount
                      ? "This ad account has no currency set yet, so it cannot be funded. Tell us and we will set it — it takes a minute."
                      : "Pick an ad account first."}
                  </FieldDescription>
                )}
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          {/* ── THE SYMBOL WAS CENTRED ON THE WRONG BOX ──────────────
              `top-1/2 -translate-y-1/2` centred it on the RELATIVE
              wrapper -- which holds the label, the input AND the
              description -- so it sat well below the input's own centre
              and overlapped the first digit. The currency goes in the
              label instead: always aligned, nothing to position, and
              the same shape as the withdrawal dialog. */}
          <div>
            <InputField
              name="amount"
              id="topup-amount"
              // ── SAY WHICH AMOUNT ────────────────────────────────
              // The fee comes OUT of this figure, not on top of it, and
              // a box labelled just "Amount" over a summary that lists
              // the fee separately reads as though the two add up. They
              // do not: this IS the total.
              label={`Amount to take from your wallet (${selectedCurrency})`}
              control={control}
              type="number"
              min={0}
              max={hasWallet ? selectedBalance : undefined}
              className="tabular-nums"
              disabled={!hasWallet}
              // 0.01, not 0.1. A step of a tenth makes the browser refuse any exact
                // cent amount — 100.25 fails the step check and the form will not
                // submit, with no message that says why.
                step={0.01}
              description={amountDescription}
            />
            {/* The amounts people actually move, one tap. A pill above
                the wallet balance is greyed rather than hidden: a row
                that changes length as the balance moves is harder to
                aim at, and "greyed" says why it cannot be pressed. */}
            {hasWallet && selectedBalance > 0 ? (
              <AmountPills
                currency={selectedCurrency}
                max={selectedBalance}
                onPick={(v) =>
                  setValue("amount", v, {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
              />
            ) : null}
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
              gross={parseAmount(amount)}
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
      {/* Full width under the thumb on a phone, right-aligned on a
          desktop -- and always the same distance from the content
          above it, which it was not. */}
      <div className="mt-3 shrink-0 border-t pt-3 sm:flex sm:justify-end">
        <Button
          type="submit"
          className="w-full sm:w-auto"
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
            feeUnresolved ||
            // ── AND NOT WITHOUT A RATE ──────────────────────────────
            //
            // Both admin creation paths refuse a non-USD top-up when
            // there is no active exchange rate, and say why: the money
            // leaves the wallet and nothing lands. The customer's own
            // path had no such guard, and saving a new rate stands the
            // old one down first -- so the window is real.
            blockedByRate
          }
          title={
            blockedByRate
              ? "We can't read today's exchange rate, so we can't say what would land on the account. Try again in a moment."
              : feeQuote.isError
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
        {/* The account's own currency, same as the summary. The three
            figures on this confirmation are then all in one money and
            the sum can be checked by eye: gross − fee = what lands. */}
        <ConfirmFact
          label="Lands on the account"
          // One currency, the account's own. See the note on the
          // summary row: a dollar figure on a euro account contradicts
          // the same screen and leaks the supplier's settlement
          // currency.
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
  balance: number | null;
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
          {/* ── A DASH, NOT A ZERO ──────────────────────────────────
              `parseAmount(wallet?.usd_balance)` is 0 while the read is
              running AND when it failed, so this card stated
              "Available: EUR 0.00" as fact -- with the red "Unable to
              load wallet balance" panel rendering directly underneath
              it, which is a screen telling a customer two different
              things about their own money at once. */}
          Available:{" "}
          {balance === null ? "—" : formatCurrency(balance, value)}
        </span>
      </Label>
    </div>
  );
}

function BalanceSummary({
  currency,
  balance,
  amount,
  gross,
  remaining,
  fee_amount,
  fee_pct,
  feePending,
  feeFailed = false,
}: {
  currency: CurrencyCode;
  balance: number;
  /** What survives the fee, in the WALLET's currency. */
  amount: number;
  /** What the customer typed: what leaves the wallet, fee included. */
  gross: number;
  fee_amount: number;
  fee_pct: number;
  remaining: number;
  // The fee has been asked of the server and the answer is not back. A
  // dash is the honest thing to print; a number taken from the account's
  // own column would be the wrong one for anyone on a plan.
  feePending: boolean;
  /** …and it failed rather than being still in flight. */
  feeFailed?: boolean;
  /** EUR per 1 USD, or null when it could not be read. */
}) {
  // ── THE FEE COMES OUT OF THE AMOUNT, NOT ON TOP OF IT ──────────────
  //
  // calculateTopupAmount converts what the customer typed, takes the fee
  // off the DOLLAR figure and lands the remainder -- so typing 1,000
  // moves 1,000 out of the wallet and about 970 worth onto the account.
  //
  // The summary did not say that. It opened on "Current balance", then
  // named the fee on its own line, then printed "Wallet afterwards
  // -1,000.00" -- which reads as though the 30 had been forgotten. And
  // the only line that would have settled it, "Lands on the account",
  // was in DOLLARS while the fee was in euros, so the sum could not be
  // checked by eye at all.
  //
  // So: the gross first, the fee as a deduction FROM it, the net in the
  // same currency with the conversion under it, and only then the
  // bottom line. 1,000.00 - 30.00 = 970.00, and 0.00 - 1,000.00 is
  // obviously the balance minus the gross.
  const netInWallet = feePending ? null : amount;

  const Row = ({
    label,
    value,
    hint,
    tone,
  }: {
    label: React.ReactNode;
    value: React.ReactNode;
    hint?: React.ReactNode;
    tone?: "muted" | "danger" | "strong";
  }) => (
    // grid, not flex: with justify-between a long value squeezed the
    // label until "Wallet afterwards" read "Wallet".
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">
        <span
          className={cn(
            "font-medium tabular-nums",
            tone === "danger" && "font-semibold text-destructive",
            tone === "strong" && "font-semibold",
          )}
        >
          {value}
        </span>
        {hint ? (
          <span className="block text-[0.72rem] font-normal text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>
    </div>
  );

  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <p className="mb-3 text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
        What this costs
      </p>
      <div className="space-y-2.5">
        <Row
          label="Out of your wallet"
          value={formatCurrency(gross, currency)}
          tone="strong"
        />
        <Row
          label={
            feePending
              ? "Top-up fee (included)"
              : `Top-up fee (${fee_pct}%, included)`
          }
          value={
            feePending
              ? feeFailed
                ? "couldn't check"
                : "checking…"
              : `− ${formatCurrency(fee_amount, currency)}`
          }
        />
        <div className="h-px bg-border" />
        {/* ── IN THE ACCOUNT'S OWN MONEY ────────────────────────────
            A EUR ad account is credited in euros. This headlined the
            dollar conversion and put the euro figure in the hint, so a
            customer funding a euro account from a euro wallet was shown
            "$111.19" as the thing that lands — a number that appears
            nowhere in the account's life, and one the admin queue then
            contradicted with "$97.00".

            top_up_create_for_advertiser takes the fee in the payment
            currency and credits the net in it. That IS what lands. The
            dollar value is kept underneath, because the supplier side
            is quoted in dollars and an admin reading over a shoulder
            will want it — but it is no longer the headline, and it is
            not shown at all when the account is already in dollars. */}
          {/* ── NO DOLLAR FIGURE ON A EURO ACCOUNT ───────────────────
              This printed "about $111.19 at 0.872361 EUR per USD" under
              "Lands on the account €97.00" -- on a card that says, two
              rows up, Currency EUR, and next to a "Funded to date"
              figure in euros. The screen contradicted itself about the
              customer's own money.

              An ad account has ONE currency for its life. The dollar
              figure exists because the SUPPLIER settles in dollars, and
              the supplier is the one thing a customer must never be
              shown -- not by name and not by its settlement currency.
              It is also unverifiable: rates move, so it will not match
              whatever the platform shows later.

              The RATE still matters and the guard below still refuses
              when it cannot be read; the customer just is not handed a
              number in a currency their account does not have. */}
        <Row
          label="Lands on the account"
          value={
            netInWallet === null
              ? "—"
              : formatCurrency(netInWallet, currency)
          }
          hint={null}
          tone="strong"
        />
        <div className="h-px bg-border" />
        <Row
          label="Wallet now"
          value={formatCurrency(balance, currency)}
        />
        <Row
          label="Wallet afterwards"
          value={formatCurrency(remaining, currency)}
          tone={remaining < 0 ? "danger" : "strong"}
          hint={
            remaining < 0
              ? "More than you hold — top the wallet up first."
              : null
          }
        />
      </div>
    </div>
  );
}
