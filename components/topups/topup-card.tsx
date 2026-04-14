import { useAppContext } from "@/context/app-provider";
import { CURRENCY_SYMBOLS, DATE_FORMAT, TOPUP_TYPES } from "@/lib/constants";
import { Topup } from "@/lib/types/topup";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import {
  CheckCircle2,
  Eye,
  Loader2,
  MinusCircle,
  ReceiptText,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardTitle } from "../ui/card";
import PaymentSlipPreview from "./payment-slip-preview";
import useUpdateTopup from "./use-update-topup";

export default function TopupCard({
  topup,
  onViewDetails,
  onVerifyPayment,
  onReject,
}: {
  topup: Topup & {
    tenant_client_code?: string;
    account_name?: string;
    platform?: string;
  };
  onViewDetails: () => void;
  onVerifyPayment: () => void;
  onReject: () => void;
}) {
  const { profile } = useAppContext();
  const isAdmin = profile?.role === "admin";
  const statusColor =
    topup.status === "completed"
      ? "bg-green-500"
      : topup.status === "pending"
        ? "bg-yellow-500"
        : topup.status === "rejected"
          ? "bg-destructive"
        : "bg-gray-500";

  const { isPending, updateTopup } = useUpdateTopup();
  const [previewSlip, setPreviewSlip] = useState(false);

  const markPending = () => {
    updateTopup({
      topupId: topup.id,
      payload: {
        status: "pending",
      },
    });
  };

  return (
    <Card className="cursor-pointer hover:shadow-lg transition-shadow p-2">
      <CardContent className="p-2">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <div className="text-sm text-muted-foreground mt-2.5">
              <span className="font-medium">
                #{String(topup.number).padStart(6, "0")}
              </span>
              {profile?.role !== "advertiser" && (
                <>
                  <span> &middot; </span>
                  {topup.tenant_client_code || "—"}
                </>
              )}
            </div>
            <CardTitle className="">
              <span>{topup.account_name || "---"}</span>
            </CardTitle>
          </div>
          <div className="text-end">
            <Badge
              className={cn(
                statusColor,
                "capitalize rounded",
                topup.status === "rejected" && "text-white",
              )}
            >
              {topup.status}
            </Badge>
            <p className="text-muted-foreground text-sm mt-1">
              {dayjs(topup.created_at).format(DATE_FORMAT)}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-3">
            <div className="flex gap-1 flex-col ">
              <span className="text-sm text-muted-foreground">Fee:</span>
              <span className="font-semibold">{topup.fee}%</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Type:</span>
              <span className="font-medium text-sm">
                {TOPUP_TYPES.find((t) => t.value === topup.type)?.label}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3">
            <div className="flex flex-col justify-between">
              <span className="text-sm text-muted-foreground">Received:</span>
              <span className="font-semibold">
                {CURRENCY_SYMBOLS[topup.currency]} {topup.amount_received}
              </span>
            </div>

            <div className="flex flex-col justify-between">
              <span className="text-sm text-muted-foreground">USD Value:</span>
              <span className="font-semibold">
                {CURRENCY_SYMBOLS["USD"]} {topup.amount_usd}
              </span>
            </div>

            <div className="flex flex-col justify-between">
              <span className="text-sm text-muted-foreground">
                Topup Amount:
              </span>
              <span className="font-semibold">
                {CURRENCY_SYMBOLS[topup.currency || "USD"]} {topup.topup_amount}
              </span>
            </div>
          </div>

          {/* {topup.platform === "eu-meta-premium" && (
            <div className="grid grid-cols-3">
              <p className="text-sm text-muted-foreground">EU Values:</p>
              <p>&nbsp;</p>
              <p className="font-semibold">
                €{topup.eur_value}/${topup.eur_topup}
              </p>
            </div>
          )} */}
        </div>

        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
          {topup.payment_slip && (
            <Button
              variant="outline"
              className="flex-1 min-w-[120px]"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewSlip(true);
              }}
            >
              <ReceiptText className="mr-2 h-4 w-4" />
              Slip
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              className="flex-1 min-w-[120px]"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onViewDetails();
              }}
            >
              <Eye className="mr-2 h-4 w-4" />
              View
            </Button>
          )}
          {profile?.role !== "advertiser" ? (
            topup.status !== "completed" && topup.status !== "rejected" ? (
              <>
                <Button
                  variant="outline"
                  className="flex-1 min-w-[120px]"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onVerifyPayment();
                  }}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Verify
                </Button>
                {topup.status !== "rejected" && (
                  <Button
                    variant="destructive"
                    className="flex-1 min-w-[120px] text-white"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReject();
                    }}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                )}
              </>
            ) : topup.status === "completed" ? (
              <Button
                variant="outline"
                className="flex-1 min-w-[120px]"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  markPending();
                }}
              >
                {isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <MinusCircle className="mr-2 h-4 w-4" />
                )}
                Mark Pending
              </Button>
            ) : null
          ) : null}
        </div>
      </CardContent>
      {topup?.payment_slip && (
        <PaymentSlipPreview
          src={topup?.payment_slip}
          alt="Payment Slip"
          open={previewSlip}
          onClose={() => setPreviewSlip(false)}
        />
      )}
    </Card>
  );
}
