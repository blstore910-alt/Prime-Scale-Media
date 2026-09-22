import { toastResult } from "@/lib/action-warning";
import { Button } from "@/components/ui/button";
import { verifyAdTopup } from "@/actions/topup-actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Topup } from "@/lib/types/topup";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useSupplierLinks } from "@/hooks/use-supplier-link";
import SupplierPill, { SUPPLIER_PILL_CSS } from "./supplier-pill";
import Copyable from "@/components/psm/copyable";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  MinusCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Resolver, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import useGetTopup from "./use-get-topup";
import { Badge } from "../ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import { landedOnAccount } from "@/lib/pure-topup-landed";

const formSchema = z.object({
  // Plans store topup_fee_pct as numeric(5,2), so the effective fee can be
  // fractional (e.g. 2.5% after a discount). Forcing a whole number here
  // used to round the default up and — because the rounded value then
  // differed from the real fee — silently rewrite the charge on verify.
  fee: z.coerce
    .number()
    .min(0, "Fee must be 0 or greater")
    .max(100, "Fee cannot exceed 100"),
});

export default function VerifyTopupDialog({
  topupId,
  open,
  setOpen,
}: {
  topupId: string | null;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { topup, isLoading, isError, error } = useGetTopup({ topupId });
  // ── THE BUSY FLAG HAS TO LIVE UP HERE ──────────────────────────────
  //
  // isPending belongs to VerifyTopupInvoice, which is rendered INSIDE
  // DialogContent. The dialog portals without forceMount, so Escape or a
  // click on the overlay unmounts that child and takes the flag with it
  // -- mid-request. Every other money dialog in the app is saved by a
  // nested ConfirmModal absorbing the dismiss; this one has none. Its
  // submit button IS the money button.
  //
  // What followed: the row behind is only invalidated in onSuccess, so
  // it still reads "pending"; the admin reopens the same row and Verify
  // is live again. verifyAdTopup never checks status -- it delegates to
  // top_up_admin_verify, which exists only on live and which nothing in
  // this repository can read -- and the same step queues the supplier
  // push. Two verifications, two pushes.
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && busy) return;
        setOpen(next);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Verify Top-up</DialogTitle>
          <DialogDescription>
            Review the transaction details before verifying.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-2 text-destructive p-4 bg-destructive/10 rounded-md">
            <AlertCircle className="h-4 w-4" />
            <span>{error?.message}</span>
          </div>
        )}

        {topup && (
          <VerifyTopupInvoice
            topup={topup as ExtendedTopup}
            onVerified={setOpen}
            onBusyChange={setBusy}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type FormValues = z.infer<typeof formSchema>;

type ExtendedTopup = Topup & {
  account_name?: string;
  eur_value?: number;
  platform?: string;
};

function VerifyTopupInvoice({
  onBusyChange,
  topup,
  onVerified,
}: {
  topup: ExtendedTopup;
  onVerified: (open: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const {
    register,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      // Keep the real (possibly fractional) fee as the default so clicking
      // through Verify without touching the field sends p_new_fee_percent=null.
      fee: Number(topup.fee) || 0,
    },
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
  });

  const queryClient = useQueryClient();

  // Watch fee to recalculate totals live (UI preview only — server is authoritative)
  const feePercentage = watch("fee");
  const [calculatedValues, setCalculatedValues] = useState({
    feeAmount: 0,
    netAmount: 0,
  });

  // THE FEE IS TAKEN OFF THE DOLLAR FIGURE, NOT THE ONE THE CUSTOMER PAID.
  //
  // This computed both from amount_received — the amount in the currency
  // the customer transferred — and printed both in that currency. The
  // server does something different: calculateTopupAmount converts to USD
  // first and takes the fee off there, because an ad-account balance is
  // USD. So a €1,000 top-up at 0.86 showed "Fee €20.00 / Net Credit
  // €980.00" while $1,139.53 gross was in play and $23.26 came off — about
  // 16% out, on the screen where an admin edits the fee and releases the
  // money.
  //
  // The gross USD needs no exchange rate to recover: the stored
  // topup_amount is the net and fee_amount is the fee, both USD, so their
  // sum is the gross. Editing the percentage then re-splits that exact
  // figure, which is what the server will do too.
  // ── IN THE ACCOUNT'S OWN MONEY ─────────────────────────────────
  //
  // A EUR ad account is credited in euros. The customer's own RPC
  // stores the net and the fee in the payment currency, which on that
  // path is always the account's currency; only the admin create paths
  // convert to USD first. landedOnAccount tells the two apart on
  // topup_usd, which only the customer path writes.
  const landed = landedOnAccount(topup as never);
  const creditCurrency = landed.currency;
  const grossUsd =
    Number(topup.topup_amount ?? 0) + Number(topup.fee_amount ?? 0);

  useEffect(() => {
    const feeParam = Number(feePercentage);
    const feeVal = (grossUsd * feeParam) / 100;
    setCalculatedValues({
      feeAmount: feeVal,
      netAmount: grossUsd - feeVal,
    });
  }, [feePercentage, grossUsd]);

  const { mutate: verifyTopup, isPending } = useMutation({
    mutationKey: ["verify-topup"],
    mutationFn: async (vars: {
      topupId: string;
      newFeePercent: number | null;
    }) => {
      // Through the server action, not the RPC directly: verifying is what
      // tells us the money is ours, and the supplier push is queued on the
      // same step. Calling the RPC from here skipped that silently.
      const res = await verifyAdTopup(vars.topupId, vars.newFeePercent);
      if (!res.ok) throw new Error(res.error);
      // The whole result, not just data — the caller has to see
      // `warning`, which is how "verified, but the supplier was NOT
      // told; fund the account by hand" reaches the admin.
      return res;
    },
    onSuccess: (res, vars) => {
      toastResult(res, "Topup verified successfully");
      queryClient.invalidateQueries({ queryKey: ["top-ups"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["wallet"], exact: false });
      // AND THE ROW'S OWN DETAIL CACHE.
      //
      // This dialog and the Details sheet both read useGetTopup, keyed
      // ["topup-details", id], which inherits the app's 30s staleTime.
      // Opening Verify fills that cache with the PENDING row; verifying
      // invalidated the list and the wallet but never the detail. So the
      // toast said verified, the badge in the grid flipped, and Details
      // on the same card still read "pending" with the old fee for half
      // a minute — the screen disagreeing with itself about money.
      //
      // The wallet-topup sibling (hooks/use-update-transaction.ts) has
      // done this since it hit the same thing; the ad-account path was
      // never given the line.
      queryClient.invalidateQueries({
        queryKey: ["topup-details", vars.topupId],
      });
      // ── AND EVERY SCREEN THE COMMISSION LANDS ON ─────────────────────
      //
      // Verifying is what books a referral commission (the trigger on
      // top_ups). None of these were refreshed, so /commissions kept
      // "No commissions yet." from the cache, the /affiliates Earnings
      // column kept its dash and the dashboard card kept its old count
      // for five minutes -- after the owner had just caused the row.
      for (const key of [
        "commissions",
        "referral-links-with-details",
        "admin-user-referral-commissions",
        "affiliate-earnings-by-email",
        "affiliate-book",
        "stats-batch",
      ]) {
        queryClient.invalidateQueries({ queryKey: [key], exact: false });
      }
      onVerified(false);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Tell the dialog above that a write is in flight, so it refuses to
  // close. The flag cannot live up there -- only this component knows --
  // and it cannot stay only down here, because closing unmounts this
  // component and the flag with it.
  useEffect(() => {
    onBusyChange?.(isPending);
    if (!isPending) return () => onBusyChange?.(false);
    // ── AND IT HAS TO BE ABLE TO END ────────────────────────────────
    //
    // busy swallows Escape, the overlay click and the X, and both
    // buttons are disabled while it is true. If the server action never
    // settles -- an edge timeout, a dropped connection -- the admin's
    // only exit was a page reload, and the top-ups queue behind this
    // dialog was unreachable until they found that out.
    //
    // Thirty seconds is far longer than a verify takes and far shorter
    // than somebody will sit staring at it. Releasing the lock does not
    // cancel the write; it lets them close the box and look at the row,
    // which is the right next step either way.
    const t = setTimeout(() => onBusyChange?.(false), 30_000);
    return () => {
      clearTimeout(t);
      onBusyChange?.(false);
    };
  }, [isPending, onBusyChange]);

  const [ticked, setTicked] = useState<Record<string, boolean>>({});

  const handleVerify = (values: FormValues) => {
    const newFee = Number(values.fee);
    const originalFee = Number(topup.fee);
    // Tolerance so float noise on an untouched fractional fee doesn't count
    // as a change and rewrite the charge.
    const feeChanged = Math.abs(newFee - originalFee) > 0.001;

    verifyTopup({
      topupId: topup.id,
      newFeePercent: feeChanged ? newFee : null,
    });
  };

  // One read for this account, shared with the queue behind the dialog
  // by react-query's cache.
  const { supplierFor } = useSupplierLinks([String(topup.account_id ?? "")]);
  const supplier = supplierFor(String(topup.account_id ?? ""));

  const steps = [
    // ── THE API STEP IS STILL A STEP THE ADMIN DOES ───────────────
    //
    // This said "Pressing Verify queues the top-up with the supplier.
    // Nothing to do by hand." Neither half is what the owner wants:
    // nothing is pushed on its own, and the admin is supposed to push
    // it and check it. A tick-box that claims the work is already done
    // is how an account gets marked verified with no money on it.
    //
    // So the step asks the same thing the manual one asks -- did you
    // put the money on -- and only reminds them the API is the way to
    // do it for this type.
    supplier?.apiEnabled
      ? {
          key: "api",
          title: `I have funded the account${supplier?.label ? ` at ${supplier.label}` : ""}`,
          detail: `This type has an API, so there is no dashboard to log into — push it and check that ${formatCurrency(calculatedValues.netAmount, creditCurrency)} is on the account.`,
        }
      : {
          key: "funded",
          title: `I have funded the account${supplier?.label ? ` at ${supplier.label}` : ""}`,
          detail: `${formatCurrency(calculatedValues.netAmount, creditCurrency)} is on the account now.`,
        },
    {
      key: "tell",
      title: "The customer will be told",
      detail:
        "Verifying marks it completed and sends them a notification. It cannot be undone from this screen.",
    },
  ];
  const [pushing, setPushing] = useState(false);
  const allTicked = steps.every((st) => ticked[st.key]);

  return (
    <form onSubmit={handleSubmit(handleVerify)} className="space-y-6">
      <div className="border rounded-xl overflow-hidden bg-card text-card-foreground shadow-sm">
        {/* Invoice Header */}
        {/* ── TWO ROWS, EACH ONE THING LEFT AND ONE THING RIGHT ──────
            This was a left column (number, date) against a right-aligned
            column (account, type, status, supplier). Side by side on a
            wide dialog that held; on a phone the two columns stacked, so
            a left-aligned title sat above a right-aligned pile and two
            pills of different shapes -- "not nicely aligned", twice.

            Now the same two rows at every width: the number with its
            status, then the account with its supplier. Both badges are
            the same height and shape, so they read as a pair. */}
        <div className="bg-muted/30 p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-bold text-lg text-primary tracking-tight leading-tight">
                Topup #{String(topup.number).padStart(6, "0")}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Requested {dayjs(topup.created_at).format("D MMM YYYY")}
              </p>
            </div>
            <Badge
              variant={topup.status === "completed" ? "default" : "secondary"}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 capitalize",
                topup.status === "completed" &&
                  "bg-green-500 hover:bg-green-600",
                topup.status === "pending" &&
                  "bg-yellow-500 hover:bg-yellow-600",
                topup.status === "rejected" &&
                  "bg-destructive hover:bg-destructive/90",
              )}
            >
              {topup.status === "completed" ? (
                <CheckCircle2 className="w-3 h-3 mr-1" />
              ) : (
                <MinusCircle className="w-3 h-3 mr-1" />
              )}
              {topup.status}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {/* Click to copy: it is what the admin pastes into the
                  supplier's portal to find the account. */}
              <h4 className="font-semibold text-foreground truncate">
                <Copyable
                  value={
                    (topup as unknown as { account_name?: string | null })
                      .account_name ||
                    topup.account?.name ||
                    ""
                  }
                  label="account"
                />
              </h4>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">
                {topup.type.replace("-", " ")}
              </div>
            </div>
            {/* Admin-only: a customer never sees a supplier name. */}
            {topup.status === "pending" && (
              <span className="shrink-0">
                <style>{SUPPLIER_PILL_CSS}</style>
                <SupplierPill link={supplierFor(topup.account_id)} compact />
              </span>
            )}
          </div>
        </div>

        <Separator />

        {/* ── THREE LINES, ONE PERCENTAGE ─────────────────────────────
            This was a Description | Rate | Amount grid whose first line
            said "Amount Received" and whose fee line printed the rate
            twice (the input and a Rate cell) -- the owner: "description
            moet Ad account topup zijn en de rate staat er nu 3x". What
            the admin needs is the money in, the fee off, and what lands,
            with the one editable percentage where the fee is. */}
        <div className="p-5 sm:p-6 space-y-3 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium">Ad account top-up</span>
            <span className="font-semibold tabular-nums">
              {formatCurrency(
                topup.amount_received as unknown as number,
                topup.currency,
              )}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span>Fee</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5">
                <Input
                  {...register("fee")}
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  aria-label="Fee percentage"
                  className="h-6 w-14 text-right px-1 py-0 bg-transparent border-none focus-visible:ring-0 text-xs"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </span>
            </span>
            {/* The account's own currency, never a hard-coded dollar: an
                admin once topped a EUR account up by hand from a "$97.00"
                that was euros (lib/pure-topup-landed.ts). */}
            <span className="text-destructive tabular-nums">
              − {formatCurrency(calculatedValues.feeAmount, creditCurrency)}
            </span>
          </div>
          {errors.fee && (
            <p className="text-xs text-destructive">{errors.fee.message}</p>
          )}

          <Separator />

          <div className="flex items-baseline justify-between gap-3">
            <span className="text-base font-bold">Lands on the account</span>
            <span className="text-base font-bold text-primary tabular-nums">
              {formatCurrency(calculatedValues.netAmount, creditCurrency)}
            </span>
          </div>
          <p className="text-right text-xs text-muted-foreground">
            Paid {formatCurrency(Number(topup.amount_received ?? 0), topup.currency)}
            {" · "}credited in {creditCurrency}
          </p>

          {/* ── OUR MARGIN, WHILE DECIDING ────────────────────────────
              Admin-only. The supplier's cut on this type is what the
              affiliate commission is calculated from, and a fee changed
              here moves it -- so it sits under the fee, live. */}
          {supplier ? (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {supplier.feePct === null ? (
                <>
                  No supplier fee set for {supplier.typeLabel || "this type"} —
                  Settings → Ad account types. Any affiliate commission on this
                  top-up goes on hold until it is.
                </>
              ) : (
                (() => {
                  const cost =
                    Math.round(
                      ((calculatedValues.netAmount * supplier.feePct) / 100) * 100,
                    ) / 100;
                  const margin =
                    Math.round((calculatedValues.feeAmount - cost) * 100) / 100;
                  return (
                    <>
                      {supplier.typeLabel || "Supplier"} takes {supplier.feePct}% ={" "}
                      {formatCurrency(cost, creditCurrency)} · our margin{" "}
                      <b className={margin < 0 ? "text-destructive" : "text-foreground"}>
                        {formatCurrency(margin, creditCurrency)}
                      </b>
                    </>
                  );
                })()
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── THE STEPS, IN ORDER, WITH A TICK EACH ──────────────────
          Verifying is the end of a sequence, not a single act: the
          money has to be on the account before we tell the customer it
          is. Which steps there are depends on the type — an API type
          funds itself when this is pressed, a manual one does not —
          and the button waits until each has been ticked. */}
      <div className="rounded-lg border bg-muted/20 p-4">
        <p className="text-sm font-semibold">Before you verify</p>
        <div className="mt-3 grid gap-3">
          {steps.map((step) => (
            <label
              key={step.key}
              className="flex cursor-pointer items-start gap-3 text-sm"
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                checked={!!ticked[step.key]}
                disabled={isPending}
                onChange={(e) =>
                  setTicked((t) => ({ ...t, [step.key]: e.target.checked }))
                }
              />
              <span>
                <span className="font-medium">{step.title}</span>
                {step.detail ? (
                  <span className="block text-muted-foreground">
                    {step.detail}
                  </span>
                ) : null}
                {/* ── THE PUSH IS A PRESS, NOT A SIDE EFFECT ────────
                    Verifying used to enqueue the supplier push itself.
                    Shut, that was a no-op; armed, it would have moved
                    money at the supplier as a side effect of recording
                    that the money had already moved.
                    The admin pushes it here, then checks the account,
                    then ticks. */}
                {step.key === "api" ? (
                  <span
                    className="mt-2 block"
                    onClick={(e) => {
                      // Inside a <label>: without this the press also
                      // toggles the tick it sits under.
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pushing || isPending}
                      onClick={async () => {
                        setPushing(true);
                        try {
                          const { pushAdTopupToSupplier } = await import(
                            "@/actions/topup-actions"
                          );
                          const res = await pushAdTopupToSupplier(
                            String(topup.id),
                          );
                          if (!res.ok) {
                            toast.error(res.error);
                          } else if (res.data.enqueued) {
                            toast.success(
                              "Queued with the supplier — check the account in a moment.",
                            );
                          } else {
                            // The ordinary state today: both switches are
                            // shut. Say WHY rather than a bare failure,
                            // because "nothing happened" is the one
                            // outcome an admin must not misread.
                            toast.warning(
                              `Not pushed — ${res.data.reason}. Fund it in the supplier's portal instead.`,
                              { duration: 9000 },
                            );
                          }
                        } finally {
                          setPushing(false);
                        }
                      }}
                    >
                      {pushing ? "Pushing…" : "Push to supplier"}
                    </Button>
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button
          type="button"
          variant="ghost"
          onClick={() => onVerified(false)}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isPending || !allTicked}
          title={
            allTicked ? undefined : "Tick every step above first."
          }
          className="w-full sm:w-auto"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Check className="h-4 w-4 mr-2" />
          )}
          Verify Payment
        </Button>
      </DialogFooter>
    </form>
  );
}
