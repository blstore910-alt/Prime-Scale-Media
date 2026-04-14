"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CURRENCY_SYMBOLS } from "@/lib/constants";
import { Commission } from "@/lib/types/commission";
import CommissionStatusAction from "./commission-status-action";

const formatAmount = (value: number | string | null | undefined) => {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const commissionTypeBadge = (type: string) => {
  switch (type) {
    case "onetime":
      return (
        <Badge variant="outline" className="capitalize">
          One-time
        </Badge>
      );
    case "monthly":
      return (
        <Badge variant="secondary" className="capitalize">
          Monthly
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="capitalize">
          {type}
        </Badge>
      );
  }
};

export default function CommissionCard({
  commission,
  isAdmin,
}: {
  commission: Commission;
  isAdmin: boolean;
}) {
  const currencySymbol =
    CURRENCY_SYMBOLS[commission.currency as keyof typeof CURRENCY_SYMBOLS] ??
    "$";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Advertiser</span>
            <div className="text-right">
              <span className="font-medium text-sm">
                {commission.referred_advertiser_tenant_client_code || "-"}
              </span>
              <span className="text-xs text-muted-foreground ml-1.5">
                ({commission.referred_advertiser_name || "-"})
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-sm">{commission.referred_advertiser_email || "-"}</span>
          </div>
          {isAdmin && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Affiliate</span>
                <span className="font-medium text-sm">
                  {commission.affiliate_advertiser_name || "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Affiliate Code
                </span>
                <span className="font-mono text-sm">
                  {commission.affiliate_advertiser_tenant_client_code || "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Affiliate Email
                </span>
                <span className="text-sm">
                  {commission.affiliate_advertiser_email || "-"}
                </span>
              </div>
            </>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Commission</span>
            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
              {currencySymbol}
              {formatAmount(commission.amount)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Currency</span>
            <span className="font-mono">{commission.currency || "-"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Type</span>
            {commissionTypeBadge(commission.type)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant={commission.status === "paid" ? "default" : "secondary"}>
              {commission.status || "-"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Date</span>
            <span className="text-sm">{formatDate(commission.created_at)}</span>
          </div>
          {isAdmin ? (
            <div className="pt-2 border-t">
              <CommissionStatusAction
                commissionId={commission.id}
                status={commission.status}
                buttonClassName="w-full"
              />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
