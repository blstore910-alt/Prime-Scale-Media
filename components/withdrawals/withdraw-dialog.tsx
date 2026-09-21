"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestAdAccountWithdrawal } from "@/actions/withdrawal-actions";
import { createClient } from "@/lib/supabase/client";
import { landedOnAccount } from "@/lib/pure-topup-landed";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

// Advertiser-facing: request a withdrawal from one ad account back to
// their wallet. The amount is theirs to enter; an admin reviews and
// approves before the wallet is credited.
export default function WithdrawDialog({
  open,
  onOpenChange,
  adAccountId,
  adAccountName,
  defaultCurrency = "USD",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adAccountId: string;
  adAccountName?: string | null;
  defaultCurrency?: "USD" | "EUR";
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  // NOT state. The account decides this, and holding it in state froze it
  // at whatever the first render saw: the details sheet renders this dialog
  // as soon as its query has data, and react-query serves a previously
  // visited account from cache synchronously — so opening account A (USD),
  // then B (EUR), then A again reused the same instance and kept "EUR".
  // The dialog then said "Comes back as EUR" while the server, which now
  // reads the currency off the account, refused the mismatch. The customer
  // could not withdraw at all, and the error contradicted the screen.
  // ── THE ACCOUNT'S OWN CURRENCY ────────────────────────────────────
  //
  // This was pinned to USD on the premise that "topup_amount is USD for
  // every payment currency". It is not: that column is USD on the ADMIN
  // create paths and the PAYMENT currency on the customer's own RPC,
  // which puts the dollar figure in topup_usd instead —
  // lib/pure-topup-landed.ts exists to tell them apart.
  //
  // Measured on production: AA-PSM0005-EU-01 is a EUR account holding
  // EUR 194.00, with topup_usd summing to 222.38. The dialog offered
  // "Max $194.00" and approving would have credited 194 DOLLARS for 194
  // euros — about EUR 25 short, every round trip, on a screen that says
  // Currency: EUR two panels away.
  //
  // An ad account has one currency for its life. What went on in euros
  // comes back in euros. ad_account_withdrawal_approve already branches
  // on the withdrawal's currency and credits eur_balance or usd_balance
  // accordingly, so the RPC was right all along and only its caller was
  // wrong.
  const currency = (defaultCurrency ?? "USD").trim().toUpperCase() === "EUR"
    ? "EUR"
    : "USD";
  const fundedIn = currency;

  // ── THE FIGURE THE SERVER WILL MEASURE THIS AGAINST ────────────────
  //
  // This dialog had NO balance query at all: no maximum on the input,
  // no figure anywhere. The customer typed blind and met the real
  // number as a rejection toast -- and /accounts and their own
  // dashboard each compute it a third and fourth way, so nothing on
  // any screen matched what the guard would allow.
  //
  // Same expression the approve guard uses: everything completed and
  // not struck out, minus every withdrawal that is not rejected or
  // cancelled -- pending ones included, because they are spoken for.
  const { data: ceiling, isError: ceilingError } = useQuery<number | null>({
    queryKey: ["withdraw-ceiling", adAccountId],
    enabled: open && !!adAccountId,
    staleTime: 15_000,
    queryFn: async () => {
      const supabase = createClient();
      const put = await supabase
        .from("top_ups")
        // topup_usd and currency as well: without them landedOnAccount
        // cannot tell a customer row from an admin one and reads every
        // amount as dollars.
        .select("topup_amount, topup_usd, currency")
        .eq("account_id", adAccountId)
        .eq("status", "completed")
        .not("is_deleted", "is", true);
      if (put.error) throw put.error;
      const off = await supabase
        .from("ad_account_withdrawals")
        .select("amount, status")
        .eq("ad_account_id", adAccountId);
      if (off.error) throw off.error;
      // Only what landed in THIS account's currency. Rows in another
      // one are not converted here — the wallet's exchange is the only
      // place in this app allowed to turn one currency into another.
      const onAcct = (put.data ?? []).reduce((a, r) => {
        const landed = landedOnAccount(
          r as Parameters<typeof landedOnAccount>[0],
        );
        return landed.currency === currency ? a + (Number(landed.amount) || 0) : a;
      }, 0);
      const taken = (off.data ?? [])
        .filter((r) => {
          const st = String((r as { status?: unknown }).status ?? "").toLowerCase();
          return st !== "rejected" && st !== "cancelled";
        })
        .reduce((a, r) => a + (Number((r as { amount?: unknown }).amount) || 0), 0);
      return Math.max(0, Math.round((onAcct - taken) * 100) / 100);
    },
  });
  const [reason, setReason] = useState("");
  // Second step, in the same dialog rather than a dialog on top of a dialog:
  // stacked modals are awkward on a phone and easy to dismiss by accident,
  // which is the opposite of what a confirmation is for.
  const [confirming, setConfirming] = useState(false);

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await requestAdAccountWithdrawal({
        ad_account_id: adAccountId,
        amount: Number(amount),
        currency,
        reason: reason.trim() || undefined,
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      toast.success("Request sent — an admin will review it.");
      queryClient.invalidateQueries({ queryKey: ["ad-account-withdrawals"] });
      // ── THE CUSTOMER'S OWN SCREENS ────────────────────────────────
      //
      // ["ad-account-withdrawals"] is read by ADMIN screens only, so a
      // customer pressing Withdraw got "Request sent" and then no sign
      // of it anywhere: not the wallet, not the account sheet, not
      // Requests. There is no duplicate guard on the RPC, so the
      // natural next step is to file it again.
      queryClient.invalidateQueries({ queryKey: ["adv-account-returns"] });
      queryClient.invalidateQueries({ queryKey: ["adv-wallet-activity"] });
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
      setAmount("");
      setReason("");
      setConfirming(false);
      onOpenChange(false);
    },
    onError: (e: Error) => {
      // Back to the form, not stuck on the confirmation: whatever was wrong,
      // the next thing they need is the fields.
      setConfirming(false);
      toast.error("Couldn't send the request", { description: e.message });
    },
  });

  const numeric = Number(amount);
  const valid = Number.isFinite(numeric) && numeric > 0;
  const formatted = valid
    ? // "en-US", like every other formatter in this app. `undefined`
      // uses the BROWSER's locale, so this one dialog rendered
      // 1.234,56 EUR on a Dutch or German browser while the wallet card
      // behind it rendered EUR 1,234.56 — the same money, two
      // conventions, decided by the customer's machine, on a money
      // confirmation.
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numeric)
    : "";

  // Closing the dialog always returns it to step one, so reopening never
  // lands on a confirmation for figures that are no longer on screen.
  const handleOpenChange = (next: boolean) => {
    if (!next) setConfirming(false);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {confirming
              ? "Send this request?"
              : "Request a withdrawal"}
          </DialogTitle>
          {/* -- ONE SENTENCE, AND THE CODE AS A CHIP --------------------
              This was a three-line paragraph with a client code in the
              middle of it, so the code broke across lines and the one
              fact that matters -- an admin has to approve it -- ended up
              at the end of the third line. */}
          <DialogDescription asChild>
            {confirming ? (
              <p>Nothing moves until an admin approves it.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span>Bring money back from</span>
                <span className="inline-flex max-w-full items-center rounded-md border bg-muted/60 px-1.5 py-0.5 font-mono text-[0.78rem] font-semibold tracking-tight text-foreground">
                  <span className="truncate">
                    {adAccountName ?? "this ad account"}
                  </span>
                </span>
                <span>to your wallet.</span>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        {confirming ? (
          <div className="space-y-4">
            <dl className="rounded-lg border divide-y text-sm">
              <div className="flex items-baseline justify-between gap-4 px-3 py-2.5">
                <dt className="text-muted-foreground">Ad account</dt>
                <dd className="font-semibold text-right truncate">
                  {adAccountName ?? "This ad account"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-3 py-2.5">
                <dt className="text-muted-foreground">Amount</dt>
                <dd className="font-semibold tabular-nums">{formatted}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-3 py-2.5">
                <dt className="text-muted-foreground">Returns to</dt>
                <dd className="font-semibold">Your wallet</dd>
              </div>
              {reason.trim() && (
                <div className="flex items-baseline justify-between gap-4 px-3 py-2.5">
                  <dt className="text-muted-foreground">Note</dt>
                  <dd className="text-right">{reason.trim()}</dd>
                </div>
              )}
            </dl>

            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-900 dark:text-amber-100 space-y-1.5">
              <p className="font-semibold">Only send this if you are sure.</p>
              <p>
                Anything still running on this ad account is left without that
                budget once the balance is pulled back. To undo it you would
                have to top the account up again.
              </p>
            </div>
          </div>
        ) : (
        // -- ONE COLUMN ---------------------------------------------
        // It was two columns of very different lengths: a number on the
        // left and a four-line essay about currency on the right, so
        // nothing lined up and the eye had two places to be. The
        // currency is not a choice -- it is always USD -- so it belongs
        // ON the field as a suffix, not beside it as a second control
        // with its own heading and its own paragraph.
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor="wd-amount">Amount to bring back</Label>
              {/* The ceiling as a figure you can tap, not a sentence
                  buried under the field. Never a 0 over a failed read. */}
              {ceilingError ? (
                <span className="text-xs text-muted-foreground">
                  balance unavailable
                </span>
              ) : ceiling === null || ceiling === undefined ? (
                <span className="text-xs text-muted-foreground">
                  checking...
                </span>
              ) : (
                <button
                  type="button"
                  className="text-xs font-semibold tabular-nums text-primary underline-offset-2 hover:underline"
                  onClick={() => setAmount(String(ceiling))}
                >
                  Up to {currency === "EUR" ? "€" : "$"}
                  {ceiling.toFixed(2)}
                </button>
              )}
            </div>
            <div className="relative">
              <Input
                id="wd-amount"
                type="number"
                min="0"
                max={ceiling ?? undefined}
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pr-14 tabular-nums"
              />
              {/* NOT a choice, and not the funding currency either. The
                  balance on an ad account is held in USD whatever it was
                  funded with, so that is what comes back -- offering
                  anything else is what let a customer turn a USD balance
                  into euros 1:1 and keep the difference. */}
              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-sm font-semibold text-muted-foreground">
                {currency}
              </span>
            </div>
            {/* ── THIS FIGURE IS NOT A BALANCE, AND IT SAID SO ONLY
                    FOR USD ACCOUNTS ────────────────────────────────────
                The ceiling is everything we put on the account, minus
                every withdrawal that has not been rejected. It does NOT
                subtract what the account has SPENT -- nothing on either
                side of this journey reads the live balance at the
                platform.

                So an account funded EUR 194 that has spent EUR 150 still
                offers EUR 194 back. Labelling that "Max" reads as
                "available", which is the one thing it is not. The honest
                sentence existed, and was shown only when the account was
                funded in dollars; a EUR account got the currency note
                instead and no explanation of the figure at all.

                Both now, always. And it says who checks: we do, before
                approving -- which is the same principle as the supplier
                push, where the admin verifies rather than the machine
                assuming. */}
            <p className="text-xs text-muted-foreground">
              That is what we funded, less anything already asked back — it
              does not subtract what the account has spent, so we check the
              real balance before approving.
              {fundedIn !== "USD"
                ? " It comes back in USD, which is what the platform spends; exchange it in your wallet afterwards."
                : ""}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wd-reason">Note for us (optional)</Label>
            <Input
              id="wd-reason"
              placeholder="e.g. campaign finished"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            <span className="shrink-0 font-semibold">Heads up</span>
            <span>
              An admin approves this before the money reaches your wallet,
              and anything still running on the account loses that budget.
            </span>
          </div>
        </div>
        )}

        <DialogFooter className="mt-1 gap-2 sm:gap-2">
          {confirming ? (
            <>
              <Button
                variant="outline"
                onClick={() => setConfirming(false)}
                disabled={isPending}
              >
                Back
              </Button>
              <Button onClick={() => mutate()} disabled={isPending}>
                {isPending ? "Sending…" : "Yes, send the request"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => setConfirming(true)} disabled={!valid}>
                Review request
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
