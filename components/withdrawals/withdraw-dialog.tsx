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
  // ALWAYS USD, whatever the account was funded in. The balance on an ad
  // account is top_ups.topup_amount and that column is USD for every
  // payment currency — so a EUR account's balance is a USD figure, and
  // showing "Comes back as EUR" beside it is how the 1:1 exploit survived
  // the fix that was meant to close it. defaultCurrency is kept only to
  // tell the customer what they funded with.
  const currency = "USD";
  const fundedIn = (defaultCurrency ?? "USD").toUpperCase();

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
        .select("topup_amount")
        .eq("account_id", adAccountId)
        .eq("status", "completed")
        .not("is_deleted", "is", true);
      if (put.error) throw put.error;
      const off = await supabase
        .from("ad_account_withdrawals")
        .select("amount, status")
        .eq("ad_account_id", adAccountId);
      if (off.error) throw off.error;
      const onAcct = (put.data ?? []).reduce(
        (a, r) => a + (Number((r as { topup_amount?: unknown }).topup_amount) || 0),
        0,
      );
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
          <DialogDescription>
            {confirming
              ? "Check the details below. Nothing moves until an admin approves it."
              : // "What is left of what we funded", not "balance". These
                // accounts are funded by hand and there is no API to read
                // a live balance from — so the only figure that exists is
                // what we put on minus what has come back off. Promising
                // a balance invites the customer to ask us for one.
                `Ask for what is left of the budget we funded on ${
                  adAccountName ?? "this ad account"
                } to come back to your wallet. This is a request — an admin reviews it first.`}
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
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="wd-amount">Amount</Label>
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
              />
              {/* A figure, or an honest dash. Never a 0 over a failed
                  read -- that would read as "there is nothing here". */}
              <p className="text-xs text-muted-foreground">
                {ceilingError ? (
                  "We couldn't work out what is left on this account just now."
                ) : ceiling === null || ceiling === undefined ? (
                  "Checking what is left on this account…"
                ) : (
                  <>
                    Up to{" "}
                    <button
                      type="button"
                      className="underline underline-offset-2"
                      onClick={() => setAmount(String(ceiling))}
                    >
                      ${ceiling.toFixed(2)}
                    </button>{" "}
                    — what we funded, less anything already asked back.
                    Money already spent at the platform is not in that
                    figure.
                  </>
                )}
              </p>
            </div>
            {/* NOT a choice, and not the funding currency either. The
                balance on an ad account is held in USD whatever it was
                funded with, so that is what comes back — offering anything
                else is what let a customer turn a USD balance into euros
                1:1 and keep the difference. */}
            <div className="space-y-2">
              <Label htmlFor="wd-cur">Comes back as</Label>
              <div
                id="wd-cur"
                className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium"
              >
                {currency}
              </div>
              {fundedIn !== "USD" ? (
                <p className="text-xs text-muted-foreground">
                  You funded this account in {fundedIn}, but the balance on it
                  is held in USD — that is what the platform spends. You can
                  exchange it in your wallet afterwards.
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wd-reason">Note (optional)</Label>
            <Input
              id="wd-reason"
              placeholder="Reason for withdrawal"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <p className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
            Withdrawals need admin approval before the balance returns to your
            wallet.
          </p>
        </div>
        )}

        <DialogFooter>
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
