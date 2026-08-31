"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import { WalletTopupWithAdvertiser } from "@/lib/types/wallet-topup";
import { useUpdateTransaction } from "@/hooks/use-update-transaction";
import {
  CheckCircle2,
  Clock,
  Eye,
  FileImage,
  Loader2,
  MoreHorizontal,
  Zap,
  // Undo,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { prechargeTopup } from "@/actions/precharge-actions";
import WalletTransactionRejectDialog from "./wallet-transaction-reject-dialog";
import PaymentSlipDialog from "./payment-slip-dialog";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);
import { CURRENCY_SYMBOLS, DATE_TIME_FORMAT } from "@/lib/constants";

const formatAmount = (value: number | string | null | undefined) => {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export default function WalletTransactionRow({
  topup,
  onViewDetails,
  onApproveClick,
}: {
  topup: WalletTopupWithAdvertiser;
  onViewDetails: () => void;
  onApproveClick: () => void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [slipOpen, setSlipOpen] = useState(false);
  const [precharging, setPrecharging] = useState(false);
  const queryClient = useQueryClient();
  const { mutate: updateTransaction, isPending } = useUpdateTransaction(topup);

  const handlePrecharge = async () => {
    setPrecharging(true);
    try {
      const res = await prechargeTopup(topup.id);
      if (!res.ok) throw new Error(res.error);
      toast.success("Precharged — wallet credited in advance");
      queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["wallets"] });
      queryClient.invalidateQueries({ queryKey: ["wallet-precharges"] });
    } catch (e) {
      toast.error("Precharge failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setPrecharging(false);
    }
  };

  const isCompleted = topup.status === "completed";
  const isRejected = topup.status === "rejected";
  const statusLabel = topup.status ?? "pending";

  const handleApprove = () => {
    onApproveClick();
  };

  const handleReject = (reason: string) => {
    updateTransaction(
      {
        action: "reject",
        rejectionReason: reason,
      },
      {
        onSuccess: () => {
          setRejectOpen(false);
        },
      },
    );
  };

  const canTakeAction = !isCompleted && !isRejected;

  const advertiserCode = topup.advertiser?.tenant_client_code ?? "-";
  const advertiserName = topup.advertiser?.profile?.full_name ?? "Unknown";
  const hasPaymentSlip = Boolean(topup.payment_slip);

  return (
    <TableRow>
      <TableCell className="font-mono">{topup.reference_no ?? "-"}</TableCell>
      <TableCell className="font-mono font-semibold">
        {CURRENCY_SYMBOLS[topup.currency as keyof typeof CURRENCY_SYMBOLS]}
        {formatAmount(topup.amount)}
      </TableCell>
      <TableCell>
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
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{advertiserCode}</span>
          <span className="text-xs text-muted-foreground">
            {advertiserName}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span>{dayjs(topup.created_at).format(DATE_TIME_FORMAT)}</span>
          {canTakeAction && (
            <span className="text-xs text-amber-600 dark:text-amber-500">
              waiting {dayjs(topup.created_at).fromNow(true)}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canTakeAction && (
              <DropdownMenuItem disabled={isPending} onClick={handleApprove}>
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
                disabled={isPending || precharging}
                onClick={handlePrecharge}
              >
                {precharging ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="mr-2 h-4 w-4" />
                )}
                Precharge (advance credit)
              </DropdownMenuItem>
            )}
            {canTakeAction && (
              <DropdownMenuItem
                disabled={isPending}
                onClick={() => setRejectOpen(true)}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject payment
              </DropdownMenuItem>
            )}
            {/* {(isCompleted || isRejected) && (
              <DropdownMenuItem disabled={isPending} onClick={handleUndo}>
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Undo className="mr-2 h-4 w-4" />
                )}
                Undo transaction
              </DropdownMenuItem>
            )} */}
            <DropdownMenuItem onClick={onViewDetails}>
              <Eye className="mr-2 h-4 w-4" />
              View details
            </DropdownMenuItem>
            {hasPaymentSlip && (
              <DropdownMenuItem onClick={() => setSlipOpen(true)}>
                <FileImage className="mr-2 h-4 w-4" />
                View payment slip
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
      <WalletTransactionRejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        isSubmitting={isPending}
        onSubmit={handleReject}
      />
      <PaymentSlipDialog
        open={slipOpen}
        onOpenChange={setSlipOpen}
        paymentSlipUrl={topup.payment_slip}
      />
    </TableRow>
  );
}
