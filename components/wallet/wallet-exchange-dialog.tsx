"use client";

import { useT } from "@/hooks/use-t";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import { createClient } from "@/lib/supabase/client";
import { userFacingErrorMessage } from "@/lib/pure-error";
import useUsdToEur from "@/hooks/use-usd-to-eur";
import {
  exchangeQuote,
  getRate,
  neededFromAmount,
} from "@/lib/pure-exchange";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownUp, ArrowLeftRight, Loader2 } from "lucide-react";
import { TopupStyles, currencySymbol } from "@/components/topups/topup-ui";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type Currency = "USD" | "EUR";

type FormValues = {
  from_currency: Currency;
  from_amount: number;
};

// getRate, the fee and the "how much must I convert" arithmetic all moved
// to lib/pure-exchange.ts. They lived here as private consts, so the only
// screen that could answer "would the other wallet cover this?" was this
// dialog — and by then the customer has already been sent somewhere. The
// billing card asked the cruder `other > 0` instead and offered
// "Exchange to pay EUR 200.00" to somebody holding one cent.

export default function WalletExchangeDialog({
  open,
  onOpenChange,
  walletId,
  initialFrom = "USD",
  usdBalance,
  eurBalance,
  needAmount = null,
  needCurrency = null,
  needLabel = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletId: string | null;
  /** Which wallet the customer pressed Exchange on. */
  initialFrom?: Currency;
  usdBalance: number;
  eurBalance: number;
  /**
   * ── WHY THE DIALOG NEEDS TO KNOW WHAT IT WAS OPENED FOR ───────────
   *
   * The billing card sends a customer here with "Exchange to pay
   * EUR 5.00" — and then the dialog opened on an empty amount box with
   * no idea that five euros was the point. They had to convert the
   * invoice figure into the other currency themselves, in their head,
   * including a 0.6% fee, and a cent short means the payment they came
   * to make is refused.
   *
   * With these three the dialog can say what is needed, prefill the
   * amount that lands it, and show the shortfall closing.
   */
  needAmount?: number | null;
  needCurrency?: Currency | null;
  needLabel?: string | null;
}) {
  const { t: tr } = useT();
  const queryClient = useQueryClient();
  // ── THE CUSTOMER-SIDE RATE READ, NOT THE ADMIN ONE ────────────────
  //
  // This was `useExchangeRates`, whose select is
  // `"*, profile:user_profiles(*)"` — every column of `exchange_rates`
  // plus an embedded profile, shipped to the customer's browser. And the
  // dialog is mounted unconditionally on the dashboard, so it ran on
  // every page load with the dialog shut. The dashboard card was moved
  // to `useUsdToEur` for exactly this reason and the dialog was missed.
  // `useUsdToEur` selects one column, `eur`, and returns null rather
  // than 1 when it cannot be read.
  const {
    rate: advEurRate,
    isLoading: ratesLoading,
    isError: ratesError,
  } = useUsdToEur();

  const eurRateRaw = Number(advEurRate ?? 0);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
    setValue,
  } = useForm<FormValues>({
    defaultValues: {
      // ── OPEN ON THE WALLET THEY PRESSED ──────────────────────────
      //
      // All three Exchange buttons called the opener with no currency
      // and this hard-defaulted to converting FROM USD. So a customer
      // holding both balances, pressing Exchange inside the card headed
      // "EUR wallet", got a USD -> EUR conversion whose every figure was
      // internally consistent and in the wrong direction. Reversing it
      // costs the 0.6% again plus the spread. Top up was fixed for this
      // exact fault; Exchange was not.
      from_currency: initialFrom === "EUR" ? "EUR" : "USD",
      // NOT 0. The box rendered a literal "0" that the customer has to
      // delete first -- type 10 on top of it and you get 010, and the
      // figures below follow that. Empty, with the placeholder doing
      // the explaining.
      from_amount: undefined,
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
  // Every figure below comes from the one helper that reproduces the
  // server's own steps — gross, fee rounded to the cent, then net. The
  // dialog used to pre-round the gross and take 0.6% of THAT, which is a
  // different number from the one the database credits.
  const quote = exchangeQuote(fromAmount, rate);
  const amountRegister = register("from_amount", {
    required: "Amount is required",
    valueAsNumber: true,
    min: {
      // Zero passed the form and was refused by the RPC, so the only way
      // to find out was a red toast.
      value: 0.01,
      message: tr("exch.enterAnAmountAboveZero"),
    },
  });
  const hasUsd = usdBalance > 0;
  const hasEur = eurBalance > 0;
  const hasSingleBalance = (hasUsd && !hasEur) || (!hasUsd && hasEur);

  const feeAmount = quote.fee;
  const exchangeableAmount = quote.lands;

  // ── WHAT THE CUSTOMER CAME HERE FOR ────────────────────────────────
  //
  // Only when the shortfall is in the currency this conversion lands in.
  // Opening Exchange from the wallet card passes nothing and none of
  // this renders.
  const need =
    needAmount != null && needAmount > 0 && needCurrency ? needAmount : null;
  const needIsTarget = need != null && needCurrency === toCurrency;
  const needRate = needIsTarget
    ? getRate(eurRateRaw, toCurrency === "USD" ? "EUR" : "USD", toCurrency)
    : 0;
  const needFrom = needIsTarget ? neededFromAmount(need, needRate) : 0;
  const needSymbol = needCurrency === "USD" ? "$" : "€";
  const fromSymbol = fromCurrency === "USD" ? "$" : "€";
  // Is there even enough on the other side to do it? Saying so before
  // they type is the difference between a closed loop and a refusal.
  const haveOnFromSide = fromCurrency === "USD" ? usdBalance : eurBalance;
  const needIsReachable = needIsTarget && needFrom > 0 && haveOnFromSide >= needFrom;
  const shortOf = needIsTarget && need != null ? Math.max(0, Math.round((need - exchangeableAmount) * 100) / 100) : 0;

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    // The wallet they pressed comes first. Only when that side is empty
    // does the single-balance override step in — converting from a
    // balance of zero is the one thing worse than the wrong direction.
    const wanted: Currency = initialFrom === "EUR" ? "EUR" : "USD";
    const wantedHasMoney = wanted === "USD" ? hasUsd : hasEur;
    if (wantedHasMoney) {
      setValue("from_currency", wanted, { shouldDirty: true });
    } else if (hasUsd && !hasEur) {
      setValue("from_currency", "USD", { shouldDirty: true });
    } else if (!hasUsd && hasEur) {
      setValue("from_currency", "EUR", { shouldDirty: true });
    }
  }, [open, hasUsd, hasEur, setValue, initialFrom]);

  // ── AND PREFILL THE AMOUNT THAT ACTUALLY LANDS IT ──────────────────
  //
  // Rounded UP to the cent by neededFromAmount, because rounding down is
  // how "exactly enough" becomes a cent short and the invoice it was
  // meant for is refused anyway.
  //
  // It waits for the rate: the rates query is async, so on the first
  // render needRate is 0 and the requirement is unknowable. Filling in a
  // figure computed from a rate of zero would be the confident-zero
  // fault, in a box the customer is about to press a money button
  // under.
  useEffect(() => {
    if (!open) return;
    // ---- FLIPPING THE DIRECTION EMPTIES THE BOX -------------------
    //
    // The prefill is computed for one direction: "you need EUR 92, so
    // convert $106.11". Flip From to the other currency and the amber
    // panel and the "covers what you need" line both disappear -- but
    // this returned early and left 106.11 sitting in the box, now
    // meaning EUR 106.11 -> USD, in the wrong direction, with nothing
    // on screen tying it to the invoice any more.
    if (!needIsTarget || needFrom <= 0) {
      setValue("from_amount", 0, { shouldDirty: false });
      return;
    }
    setValue("from_amount", needFrom, { shouldDirty: true });
    // needFrom is derived from needRate, which arrives with the rates.
  }, [open, needIsTarget, needFrom, setValue]);

  const { mutate, isPending } = useMutation({
    mutationKey: ["wallet-exchange", walletId],
    mutationFn: async (values: FormValues) => {
      if (!walletId) {
        throw new Error(tr("exch.missingWalletContext"));
      }

      const supabase = createClient();
      const { data, error } = await supabase.rpc("wallet_exchange", {
        p_wallet_id: walletId,
        p_from_currency: values.from_currency,
        p_amount: values.from_amount,
      });

      if (error) throw error;
      // ── READ THE ANSWER ───────────────────────────────────────────
      //
      // Only a thrown `error` used to stop this. A null row, or a row
      // carrying a refusal, resolved happily and the customer was told
      // "Exchange completed — your wallet balances have been updated"
      // over balances that had not moved. On a conversion their only
      // recourse is to compare two numbers afterwards and work it out.
      if (!data) {
        throw new Error(
          tr("exch.theExchangeDidNotGo"),
        );
      }
      return data;
    },
    onSuccess: () => {
      toast.success(tr("label.exch.exchangeCompleted"), {
        description: tr("exch.yourWalletBalancesHaveBeen"),
      });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      queryClient.invalidateQueries({
        queryKey: ["wallet-exchanges", walletId],
      });
      // The advertiser's own history keys on a different name, and without
      // this the exchange the customer just made does not appear in it until
      // the staleTime runs out — money visibly leaves one balance and the
      // record of where it went arrives a minute later.
      queryClient.invalidateQueries({
        queryKey: ["adv-wallet-exchanges", walletId],
      });
      // ── AND THE FINANCIAL REPORT ──────────────────────────────────
      //
      // ["finance-report", audience] is invalidated by NOTHING in the
      // repo, sits inside a CSS-toggled view so it never remounts, has
      // staleTime 60s and refetchOnWindowFocus false. With no mount, no
      // focus refetch and no invalidation there is no refetch trigger
      // at all -- so the screen headed "every top-up, funding, fee,
      // invoice and return in one place", with an Export CSV button on
      // it, showed pre-action figures for the whole session.
      queryClient.invalidateQueries({ queryKey: ["finance-report"] });
      onOpenChange(false);
      reset();
    },
    onError: (err: Error) => {
      // ── NOT THE RAW DATABASE MESSAGE ───────────────────────────────
      //
      // Walked on production: this printed
      //   insert or update on table "wallet_exchanges" violates foreign
      //   key constraint "wallet_exchanges_created_by_fkey"
      // to the customer, in a toast, on their own wallet. A constraint
      // name is not something anybody can act on, and it names internal
      // tables and columns.
      //
      // userFacingErrorMessage is what make-query-client already uses
      // for this class; it keeps a sentence we wrote and replaces one
      // we did not.
      toast.error(tr("label.exch.exchangeFailed"), {
        description: userFacingErrorMessage(
          err,
          "We could not convert that just now. Nothing has left your wallet — try again, or tell us if it keeps happening.",
        ),
      });
      // ── AND DROP THE CONFIRMATION ──────────────────────────────────
      //
      // Same shape as the ad-account top-up and the wallet adjustment:
      // `confirming` survived an error and `busy` went false, so the
      // modal stayed open with a live confirm button. A call that
      // COMMITTED and whose response was lost — a 504, a dropped
      // connection, a suspended tab — reads exactly like one that
      // failed, and the second press converts the amount again at
      // whatever rate is active by then.
      //
      // wallet_exchange exists only on the live database, so nothing
      // here can say whether it is idempotent. Sending them back to the
      // form re-reads both balances, which is where the answer is.
      //
      // ---- AND IT HAS TO ACTUALLY RE-READ THEM -------------------
      //
      // That last sentence was the intention and not the code: every
      // invalidate sat in onSuccess, so after a lost response the
      // dialog went back to the form still showing the balance from
      // before the call, with the amount still typed and Exchange live
      // -- over a conversion that may well have committed. The RPC has
      // no idempotency key; its only backstop is the balance check, so
      // a customer holding twice the amount converts it twice and pays
      // the fee twice.
      //
      // So: ask for both balances again, and empty the box. If the
      // money did move, the next thing they see is the new balance.
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      queryClient.invalidateQueries({ queryKey: ["adv-wallet-activity"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      setValue("from_amount", 0, { shouldDirty: false });
      setConfirming(null);
    },
  });

  // An exchange is not reversible at the rate you got, so it gets asked
  // for twice. The first click only builds the confirmation; the money moves
  // from the modal.
  const [confirming, setConfirming] = useState<{
    values: FormValues;
    rate: number;
  } | null>(null);
  const onSubmit = (values: FormValues) => setConfirming({ values, rate });

  // If the customer edits the form behind the modal, or it closes, drop the
  // pending confirmation — never let a confirmation outlive the figures it
  // was built from.
  useEffect(() => {
    if (!open) setConfirming(null);
  }, [open]);

  // ── AND THAT INCLUDES THE RATE ─────────────────────────────────────
  //
  // The comment above says the confirmation must not outlive the figures
  // it was built from, but the effect that implemented it watched only
  // `open`. The modal read `rate` live while sending the amount captured
  // at submit — so a rate that went unreadable while the modal sat there
  // printed "1 USD = 0.000000 EUR", a fee of 0.00 and "Added to your
  // wallet 0.00" over a live "Yes, exchange it" that still sent the real
  // amount. Now the rate is captured too, and if it moves the
  // confirmation goes rather than quietly becoming a different deal.
  useEffect(() => {
    if (!confirming) return;
    if (rate === confirming.rate) return;
    setConfirming(null);
    toast.message(rate > 0 ? tr("label.exch.theRateMoved") : tr("exch.weLostTodaySRate"), {
      description:
        tr("exch.nothingHasLeftYourWallet"),
    });
  }, [rate, confirming, tr]);

  // What the modal shows IS what the modal sends.
  const confirmFrom: Currency = confirming?.values.from_currency ?? fromCurrency;
  const confirmTo: Currency = confirmFrom === "USD" ? "EUR" : "USD";
  const confirmAmount = Number(confirming?.values.from_amount ?? 0);
  const confirmQuote = exchangeQuote(confirmAmount, confirming?.rate ?? 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="tpx sm:max-w-[440px]">
        <TopupStyles />
        <DialogHeader>
          <DialogTitle>{tr("label.exch.exchangeBalance")}</DialogTitle>
          <DialogDescription>
            {tr("exch.convertBetweenUsdAndEur")}</DialogDescription>
        </DialogHeader>
        {/* ── WHY THEY ARE HERE ──────────────────────────────────────
            The billing card sends somebody here with "Exchange to pay
            EUR 5.00" and this dialog used to open on an empty box that
            knew nothing about five euros. They had to do the conversion
            and the 0.6% fee in their head, and a cent short means the
            payment they came for is refused anyway. */}
        {need != null && needIsTarget ? (
          <div className="tpx-note" data-tone="warn">
            <AlertTriangle />
            <div>
            <div style={{ fontWeight: 700, color: "var(--tpx-ink)" }}>
              {tr("exch.youNeed", { needSymbol: String(needSymbol), v: String(need.toFixed(2)), v2: String(needLabel ? ` ${needLabel}` : "") })}</div>
            <div className="mt-1 text-muted-foreground">
              {ratesLoading
                ? tr("exch.workingOutWhatThatCosts")
                : ratesError || !needRate
                  ? tr("exch.weCouldnTReadToday")
                  : needIsReachable
                    ? tr("exch.convertingLandsItFeeIncluded", { fromSymbol: String(fromSymbol), v: String(needFrom.toFixed(2)) })
                    : tr("exch.yourWalletHoldsAndIs", { fromCurrency: String(fromCurrency), fromSymbol: String(fromSymbol), v: String(haveOnFromSide.toFixed(2)), fromSymbol2: String(fromSymbol), v2: String(needFrom.toFixed(2)) })}
            </div>
            </div>
          </div>
        ) : null}
        {/* ── PAY, SWAP, GET ──────────────────────────────────────────
            De eigenaar, 01-10: "exchange ook 10x meer wow". The shape
            every exchange app uses: what leaves on top, a round swap
            button, what lands underneath on the dark card -- and the
            rate and fee as a small receipt. Same form, same figures,
            same confirmation; only the look changed. */}
        <form className="flex flex-col gap-3" onSubmit={handleSubmit(onSubmit)}>
          <input type="hidden" {...register("from_currency")} />
          <div className="tpx-x-pay">
            <div className="tpx-x-top">
              <span className="tpx-lbl">{tr("exch.youPay")}</span>
              <button
                type="button"
                className="tpx-link"
                onClick={() =>
                  setValue("from_amount", Number((fromCurrency === "USD" ? usdBalance : eurBalance).toFixed(2)), {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
              >
                {tr("exch.max")} {currencySymbol(fromCurrency)}
                {(fromCurrency === "USD" ? usdBalance : eurBalance).toFixed(2)}
              </button>
            </div>
            <div className="tpx-x-row">
              <span className="tpx-x-chip">
                <i>{currencySymbol(fromCurrency)}</i>
                {fromCurrency}
              </span>
              <input
                id="from-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                onFocus={(e) => e.currentTarget.select()}
                {...amountRegister}
              />
            </div>
            {errors.from_amount && (
              <p className="tpx-err">{errors.from_amount.message}</p>
            )}
          </div>

          <button
            type="button"
            className="tpx-swap"
            disabled={hasSingleBalance}
            aria-label={tr("exch.swap")}
            onClick={() =>
              setValue("from_currency", toCurrency, { shouldDirty: true })
            }
          >
            <ArrowDownUp className="h-4 w-4" />
          </button>

          <div className="tpx-x-get">
            <span className="tpx-lbl">{tr("label.exch.youLlReceive")}</span>
            <div className="tpx-x-row">
              <span className="tpx-x-chip">
                <i>{currencySymbol(toCurrency)}</i>
                {toCurrency}
              </span>
              <b>{rate ? exchangeableAmount.toFixed(2) : "—"}</b>
            </div>
          </div>

          <div className="tpx-receipt">
            <div className="tpx-receipt-row">
              <span>{tr("label.tax.rate")}</span>
              <span>
                {ratesLoading
                  ? tr("acct.loading")
                  : ratesError || !rate
                    ? tr("label.exch.unavailable")
                    : `1 ${fromCurrency} = ${rate.toFixed(6)} ${toCurrency}`}
              </span>
            </div>
            <div className="tpx-receipt-row">
              <span>{tr("exch.exchangeFee06")}</span>
              <span>{rate ? `${feeAmount.toFixed(2)} ${toCurrency}` : "-"}</span>
            </div>
            {/* Does this actually close the gap they came to close? A
                figure that is internally consistent and 3 cents short
                sends the customer back through the whole loop. */}
            {needIsTarget && need != null && fromAmount > 0 && rate ? (
              <div className="tpx-receipt-row" data-tone={shortOf > 0 ? "danger" : "strong"}>
                <span>{tr("exch.coversTheYouNeed", { needSymbol: String(needSymbol), v: String(need.toFixed(2)) })}</span>
                <span style={shortOf > 0 ? undefined : { color: "#16A36F" }}>
                  {shortOf > 0
                    ? tr("exch.short", { needSymbol: String(needSymbol), v: String(shortOf.toFixed(2)) })
                    : tr("label.acct.yes")}
                </span>
              </div>
            ) : null}
          </div>

          <div className="tpx-actions">
            <button
              type="submit"
              className="tpx-cta"
              disabled={
                isPending ||
                !rate ||
                fromAmount <= 0 ||
                fromAmount > (fromCurrency === "USD" ? usdBalance : eurBalance)
              }
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowLeftRight className="h-4 w-4" />
              )}
              {tr("exch.exchangeCta", { from: fromCurrency, to: toCurrency })}
            </button>
          </div>
        </form>

        <ConfirmModal
          open={!!confirming}
          onOpenChange={(next) => {
            if (!next) setConfirming(null);
          }}
          title={tr("exch.exchangeThisMoney")}
          lead={tr("exch.youAreConvertingIntoAt", { fromCurrency: String(fromCurrency), toCurrency: String(toCurrency) })}
          cta={tr("label.exch.yesExchangeIt")}
          busy={isPending}
          busyLabel={tr("label.exch.exchanging")}
          onConfirm={() => confirming && mutate(confirming.values)}
        >
          <ConfirmFact
            label={tr("exch.takenFromYourWallet")}
            value={`${confirmAmount.toFixed(2)} ${confirmFrom}`}
            strong
          />
          <ConfirmFact
            label={tr("label.tax.rate")}
            value={`1 ${confirmFrom} = ${(confirming?.rate ?? 0).toFixed(6)} ${confirmTo}`}
          />
          <ConfirmFact
            label={tr("exch.exchangeFee062")}
            value={`${confirmQuote.fee.toFixed(2)} ${confirmTo}`}
          />
          <ConfirmFact
            label={tr("exch.addedToYourWallet")}
            value={`${confirmQuote.lands.toFixed(2)} ${confirmTo}`}
            strong
          />
        </ConfirmModal>
      </DialogContent>
    </Dialog>
  );
}
