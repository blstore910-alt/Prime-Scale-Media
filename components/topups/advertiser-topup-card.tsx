import { DATE_FORMAT } from "@/lib/constants";
import { Topup } from "@/lib/types/topup";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";

import { Badge } from "../ui/badge";

import { Card, CardContent } from "../ui/card";

export default function AdvertiserTopupCard({
  topup,
}: {
  topup: Topup & {
    account_name?: string;
  };
}) {
  const statusColor =
    topup.status === "completed"
      ? "bg-green-500 hover:bg-green-600"
      : topup.status === "pending"
        ? "bg-yellow-500 hover:bg-yellow-600"
        : "bg-destructive hover:bg-destructive/90";

  const formatCurrency = (
    amount: number | string | null | undefined,
    currency: string,
  ) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
    }).format(Number(amount ?? 0));
  };

  return (
    <Card className="shadow-none transition-shadow p-0">
      <CardContent className="p-3 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        {/* Left Section: ID & Account */}
        <div className="md:col-span-3 flex flex-col gap-1">
          <div className="flex justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground/80">
                  #{String(topup.number).padStart(6, "0")}
                </span>
                <span className="text-xs text-muted-foreground">
                  &bull; {dayjs(topup.created_at).format(DATE_FORMAT)}
                </span>
              </div>
              <h3
                className="font-medium text-foreground text-sm truncate"
                title={topup.account_name}
              >
                {topup.account_name || "Unknown Account"}
              </h3>
            </div>
            <div className="sm:hidden">
              <Badge
                className={cn(statusColor, "capitalize whitespace-nowrap")}
              >
                {topup.status}
              </Badge>
            </div>
          </div>
        </div>

        {/* Middle Section: Stats */}
        <div className="md:col-span-6 grid grid-cols-3 gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Amount Paid
            </span>
            <span className="text-sm font-semibold truncate font-mono">
              {formatCurrency(topup.amount_received, topup.currency)}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Fee
            </span>
            <span className="text-sm font-semibold truncate font-mono">
              {topup.fee}%
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Topup
            </span>
            <span className="text-sm font-bold font-mono text-primary truncate">
              {formatCurrency(
                topup.topup_amount,
                topup.topup_currency ||
                  (topup.currency === "USD" ? "USD" : "EUR"),
              )}
            </span>
          </div>
        </div>

        {/* Right Section: Status & Actions */}
        <div className="md:col-span-3 flex items-center justify-between md:justify-end">
          <Badge
            className={cn(
              statusColor,
              "capitalize whitespace-nowrap sm:inline-block hidden",
            )}
          >
            {topup.status}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
