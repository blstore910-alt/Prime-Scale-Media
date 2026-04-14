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
import { Separator } from "@/components/ui/separator";
import { Topup } from "@/lib/types/topup";
import dayjs from "dayjs";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  MinusCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import useGetTopup from "./use-get-topup";
import useUpdateTopup from "./use-update-topup";
import { Badge } from "../ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
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
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type FormValues = {
  fee: number;
};

type ExtendedTopup = Topup & {
  account_name?: string;
  eur_value?: number;
  platform?: string;
};

function VerifyTopupInvoice({
  topup,
  onVerified,
}: {
  topup: ExtendedTopup;
  onVerified: (open: boolean) => void;
}) {
  const { register, watch, handleSubmit } = useForm<FormValues>({
    defaultValues: {
      fee: Number(topup.fee) || 0,
    },
  });

  const { updateTopup, isPending } = useUpdateTopup();

  // Watch fee to recalculate totals live
  const feePercentage = watch("fee");
  const [calculatedValues, setCalculatedValues] = useState({
    feeAmount: 0,
    netAmount: 0,
  });

  useEffect(() => {
    const amount = Number(topup.amount_received);
    const feeParam = Number(feePercentage);

    const feeVal = (amount * feeParam) / 100;
    const netVal = amount - feeVal;

    setCalculatedValues({
      feeAmount: feeVal,
      netAmount: netVal,
    });
  }, [feePercentage, topup.amount_received]);

  const handleVerify = async (values: FormValues) => {
    const newFee = Number(values.fee);
    const originalFee = Number(topup.fee);

    const payload: Partial<Topup> = {
      status: "completed",
      verified_at: new Date().toISOString(),
    };

    if (newFee !== originalFee) {
      const amountReceivedEur = Number(topup.amount_received);
      const rate = Number(topup.rate);

      const feeAmountEur = amountReceivedEur * (newFee / 100);
      const eurTopup = amountReceivedEur - feeAmountEur;

      const topupUsd = eurTopup * rate;

      payload.fee = newFee;
      payload.fee_amount = Number(feeAmountEur.toFixed(2));
      payload.eur_topup = Number(eurTopup.toFixed(2));
      payload.topup_usd = Number(topupUsd.toFixed(2));

      payload.topup_amount = Number(eurTopup.toFixed(2));
    } else {
      payload.fee = originalFee;
    }

    const supabase = createClient();
    const { data: affiliate } = await supabase
      .from("affiliates")
      .select()
      .eq("advertiser_id", topup.advertiser_id)
      .single();
    if (affiliate) {
      payload.affiliate_id = affiliate.id;
    }
    updateTopup(
      {
        topupId: topup.id,
        payload,
      },
      {
        onSuccess: () => {
          toast.success("Topup verified successfully");
          onVerified(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

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
              {topup.account?.name || "Unknown Account"}
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
              <div className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded">
                <Input
                  {...register("fee")}
                  type="number"
                  step="0.01"
                  className="h-6 w-16 text-right px-1 py-0 bg-transparent border-none focus-visible:ring-0 text-xs"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </div>
            <div className="col-span-2 text-right text-muted-foreground">
              {feePercentage}%
            </div>
            <div className="col-span-4 text-right text-destructive">
              - {formatCurrency(calculatedValues.feeAmount, topup.currency)}
            </div>

            <Separator className="col-span-12 my-2" />

            {/* Total */}
            <div className="col-span-6 text-base font-bold">Net Credit</div>
            <div className="col-span-6 text-right text-base font-bold text-primary">
              {formatCurrency(calculatedValues.netAmount, topup.currency)}
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
