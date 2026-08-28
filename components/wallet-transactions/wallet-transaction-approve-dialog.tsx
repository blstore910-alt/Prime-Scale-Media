"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CURRENCY_SYMBOLS } from "@/lib/constants";
import { WalletTopupWithAdvertiser } from "@/lib/types/wallet-topup";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useRef } from "react";

interface WalletTransactionApproveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topup: WalletTopupWithAdvertiser;
  onConfirm: () => void;
  isPending: boolean;
}

export default function WalletTransactionApproveDialog({
  open,
  onOpenChange,
  topup,
  onConfirm,
  isPending,
}: WalletTransactionApproveDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const requestedAmount = Number(topup.amount ?? 0);

  const advertiserCode = topup.advertiser?.tenant_client_code ?? "-";
  const advertiserName = topup.advertiser?.profile?.full_name ?? "Unknown";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[500px]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelButtonRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Confirm Transaction Approval
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-4 pt-2">
              <p>
                You are about to approve the following wallet transaction.
                Please review the details carefully before confirming.
              </p>

              <div className="rounded-lg bg-muted p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <span className="text-sm text-muted-foreground">
                    Reference No:
                  </span>
                  <span className="font-mono font-semibold text-sm">
                    {topup.reference_no ?? "-"}
                  </span>
                </div>

                <div className="flex justify-between items-start gap-2">
                  <span className="text-sm text-muted-foreground">
                    Requested amount:
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono font-bold text-lg">
                      {
                        CURRENCY_SYMBOLS[
                          topup.currency as keyof typeof CURRENCY_SYMBOLS
                        ]
                      }
                    </span>
                    <span className="font-mono font-bold text-lg">
                      {requestedAmount.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-start">
                  <span className="text-sm text-muted-foreground">
                    Advertiser:
                  </span>
                  <div className="text-right">
                    <p className="font-medium text-sm">{advertiserCode}</p>
                    <p className="text-xs text-muted-foreground">
                      {advertiserName}
                    </p>
                  </div>
                </div>

                <div className="flex justify-between items-start">
                  <span className="text-sm text-muted-foreground">
                    Created Date:
                  </span>
                  <span className="text-sm">
                    {new Date(topup.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <p className="text-sm text-amber-600 dark:text-amber-500">
                ⚠️ This action will mark the transaction as completed and credit
                the advertiser&apos;s wallet with the requested amount above.
                If the actual transfer amount differs, reject the request and
                ask the advertiser to resubmit.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            ref={cancelButtonRef}
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm()}
            disabled={isPending || requestedAmount <= 0}
            className="bg-green-600 hover:bg-green-700 focus:ring-green-600"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Approving...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Confirm Approval
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
