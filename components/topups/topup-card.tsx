import { useAppContext } from "@/context/app-provider";
import { CURRENCY_SYMBOLS, DATE_FORMAT } from "@/lib/constants";
import { Topup } from "@/lib/types/topup";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import { CheckCircle2, Eye, Loader2, MinusCircle, XCircle } from "lucide-react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardTitle } from "../ui/card";
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">
                Payment Amount
              </span>
              <span className="font-semibold">
                {CURRENCY_SYMBOLS[topup.currency]} {topup.amount_received}
                {topup.currency === "EUR" && topup.topup_usd ? (
                  <span className="text-sm text-muted-foreground ml-1">
                    ({CURRENCY_SYMBOLS["USD"]} {topup.amount_usd})
                  </span>
                ) : topup.currency === "USD" && topup.eur_topup ? (
                  <span className="text-sm text-muted-foreground ml-1">
                    ({CURRENCY_SYMBOLS["EUR"]} {topup.eur_value})
                  </span>
                ) : null}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Fee Amount</span>
              <span className="font-semibold">
                {CURRENCY_SYMBOLS[topup.currency]} {topup.fee_amount} (
                {topup.fee}%)
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">
                Topup Amount
              </span>
              <span className="font-semibold">
                {CURRENCY_SYMBOLS[topup.currency]} {topup.topup_amount}
                {topup.currency === "EUR" && topup.topup_usd ? (
                  <span className="text-sm text-muted-foreground ml-1">
                    ({CURRENCY_SYMBOLS["USD"]} {topup.topup_usd})
                  </span>
                ) : topup.currency === "USD" && topup.eur_topup ? (
                  <span className="text-sm text-muted-foreground ml-1">
                    ({CURRENCY_SYMBOLS["EUR"]} {topup.eur_topup})
                  </span>
                ) : null}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
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
          {profile?.role !== "advertiser" && (
            <>
              {topup.status === "pending" && (
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
                </>
              )}
              {topup.status === "completed" && (
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
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
