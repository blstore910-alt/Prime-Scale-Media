"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WalletTopupWithAdvertiser } from "@/lib/types/wallet-topup";
import { useUpdateTransaction } from "@/hooks/use-update-transaction";
import dayjs from "dayjs";
import {
  CheckCircle2,
  Clock,
  Eye,
  FileImage,
  Loader2,
  MoreHorizontal,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import PaymentSlipDialog from "./payment-slip-dialog";
import WalletTransactionRejectDialog from "./wallet-transaction-reject-dialog";
import { DATE_TIME_FORMAT } from "@/lib/constants";

const formatAmount = (value: number | string | null | undefined) => {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const getCurrencySymbol = (currency?: string | null) => {
  if (!currency) return "";
  if (currency === "USD") return "$";
  if (currency === "EUR") return "€";
  return currency;
};

export default function WalletTransactionCard({
  topup,
  onViewDetails,
  onApproveClick,
}: {
  topup: WalletTopupWithAdvertiser;
  onViewDetails: () => void;
  onApproveClick: () => void;
}) {
  const { mutate: updateTransaction, isPending } = useUpdateTransaction(topup);
  const [rejectOpen, setRejectOpen] = useState(false);
  const isCompleted = topup.status === "completed";
  const isRejected = topup.status === "rejected";
  const statusLabel = topup.status ?? "pending";

  const advertiserCode = topup.advertiser?.tenant_client_code ?? "-";
  const advertiserName = topup.advertiser?.profile?.full_name ?? "Unknown";
  const canTakeAction = !isCompleted && !isRejected;
  const hasPaymentSlip = Boolean(topup.payment_slip);
  const [slipOpen, setSlipOpen] = useState(false);

  const handleReject = (reason: string) => {
    updateTransaction({
      action: "reject",
      data: {
        status: "rejected",
        rejection_reason: reason,
      },
      rejectionReason: reason,
    });
  };

  return (
    <Card className="cursor-pointer hover:shadow-lg transition-shadow p-2">
      <CardContent className="p-2">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <CardTitle className="text-sm mt-1">{advertiserCode}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {advertiserName}
            </p>
          </div>
          <div className="text-end">
            <Badge variant="outline" className="capitalize gap-1">
              {isCompleted ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              ) : isRejected ? (
                <XCircle className="h-3.5 w-3.5 text-red-600" />
              ) : (
                <Clock className="h-3.5 w-3.5 text-amber-600" />
              )}
              {statusLabel}
            </Badge>
            <p className="text-muted-foreground text-xs mt-2">
              {dayjs(topup.created_at).format(DATE_TIME_FORMAT)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="text-sm text-muted-foreground">
            <span className="font-mono font-medium">
              Ref: {topup.reference_no ?? "-"}
            </span>
          </div>
          <div style={{ textAlign: "right" }}>
            <span className="text-muted-foreground">Amount: </span>
            <span className="font-medium">
              {getCurrencySymbol(topup.currency)} {formatAmount(topup.amount)}
            </span>
          </div>
        </div>

        <div className="flex gap-2 mt-4 pt-4 border-t">
          <Button
            variant="outline"
            className="flex-1"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails();
            }}
          >
            <Eye className="mr-2 h-4 w-4" />
            View
          </Button>
          {(hasPaymentSlip || canTakeAction) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex-1" size="sm">
                  <MoreHorizontal className="mr-2 h-4 w-4" />
                  Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {hasPaymentSlip && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      setSlipOpen(true);
                    }}
                  >
                    <FileImage className="mr-2 h-4 w-4" />
                    Payment Slip
                  </DropdownMenuItem>
                )}
                {canTakeAction && (
                  <DropdownMenuItem
                    disabled={isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      onApproveClick();
                    }}
                  >
                    {isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Approve payment
                  </DropdownMenuItem>
                )}
                {canTakeAction && (
                  <DropdownMenuItem
                    disabled={isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRejectOpen(true);
                    }}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject payment
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardContent>
      <PaymentSlipDialog
        open={slipOpen}
        onOpenChange={setSlipOpen}
        paymentSlipUrl={topup.payment_slip}
      />
      <WalletTransactionRejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        isSubmitting={isPending}
        onSubmit={handleReject}
      />
    </Card>
  );
}
