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
    return () => onBusyChange?.(false);
  }, [isPending, onBusyChange]);

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

  return (
    <form onSubmit={handleSubmit(handleVerify)} className="space-y-6">
      <div className="border rounded-xl overflow-hidden bg-card text-card-foreground shadow-sm">
        {/* Invoice Header */}
        <div className="bg-muted/30 p-6 flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h3 className="font-bold text-lg text-primary tracking-tight">
              Topup #{String(topup.number).padStart(6, "0")}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Requested at: {dayjs(topup.created_at).format("D MMM, YYYY")}
            </p>
          </div>
          <div className="text-right">
            <h4 className="font-semibold text-foreground">
              {(topup as unknown as { account_name?: string | null })
                .account_name ||
                topup.account?.name ||
                "Unknown Account"}
            </h4>
            <div className="text-xs text-muted-foreground uppercase mt-1 tracking-wider">
              {topup.type.replace("-", " ")}
            </div>
            <Badge
              variant={topup.status === "completed" ? "default" : "secondary"}
              className={cn(
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
            {/* ── THE TOP-UP ITSELF IS DONE OVER THERE ───────────────
                This dialog is where an admin decides to release the
                money, and for every type but one that means opening
                the supplier's own dashboard and moving it by hand.
                Nothing on this screen said which supplier. Admin-only:
                a customer never sees a supplier name. */}
            {topup.status === "pending" && (
              <div className="mt-3 flex justify-end">
                <style>{SUPPLIER_PILL_CSS}</style>
                <SupplierPill link={supplierFor(topup.account_id)} />
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Invoice Body */}
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-12 gap-4 text-sm">
            <div className="col-span-6 text-muted-foreground font-medium uppercase text-xs tracking-wider">
              Description
            </div>
            <div className="col-span-2 text-right text-muted-foreground font-medium uppercase text-xs tracking-wider">
              Rate
            </div>
            <div className="col-span-4 text-right text-muted-foreground font-medium uppercase text-xs tracking-wider">
              Amount
            </div>

            {/* Line Item: Amount Received */}
            <div className="col-span-6 font-medium">Amount Received</div>
            <div className="col-span-2 text-right text-muted-foreground">-</div>
            <div className="col-span-4 text-right font-semibold">
              {formatCurrency(
                topup.amount_received as unknown as number,
                topup.currency,
              )}
            </div>

            <Separator className="col-span-12 my-2" />

            {/* Line Item: Service Fee */}
            <div className="col-span-6 flex items-center gap-2">
              <span>Fee</span>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded">
                  <Input
                    {...register("fee")}
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className="h-6 w-16 text-right px-1 py-0 bg-transparent border-none focus-visible:ring-0 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                {errors.fee && (
                  <p className="text-xs text-destructive">
                    {errors.fee.message}
                  </p>
                )}
              </div>
            </div>
            <div className="col-span-2 text-right text-muted-foreground">
              {feePercentage}%
            </div>
            <div className="col-span-4 text-right text-destructive">
              - {formatCurrency(calculatedValues.feeAmount, "USD")}
            </div>

            <Separator className="col-span-12 my-2" />

            {/* Total */}
            <div className="col-span-6 text-base font-bold">Net Credit</div>
            <div className="col-span-6 text-right text-base font-bold text-primary">
              {formatCurrency(calculatedValues.netAmount, "USD")}
            </div>
            {/* Says which currency is which, because two are on screen. */}
            <div className="col-span-12 mt-1 text-right text-xs text-muted-foreground">
              Paid {formatCurrency(Number(topup.amount_received ?? 0), topup.currency)}
              {" · "}the ad account is credited in USD
            </div>
          </div>
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
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
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
