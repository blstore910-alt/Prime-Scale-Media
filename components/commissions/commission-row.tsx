"use client";

import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { COMMISSION_TYPE_LABELS, CURRENCY_SYMBOLS } from "@/lib/constants";
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

export default function CommissionRow({
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
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <Badge variant={"outline"} className="font-medium text-sm">
            {commission.referred_advertiser_tenant_client_code || "-"}
          </Badge>
          <span className="text-sm">{commission.referred_advertiser_name}</span>
        </div>
      </TableCell>
      {isAdmin && (
        <>
          <TableCell>
            <Badge variant={"outline"} className="text-sm">
              {commission.affiliate_advertiser_tenant_client_code || "-"}
            </Badge>
            <p className="font-medium text-sm">
              {commission.affiliate_advertiser_name || "-"}
            </p>
          </TableCell>
        </>
      )}
      <TableCell className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
        {currencySymbol}
        {formatAmount(commission.amount)}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="capitalize">
          {COMMISSION_TYPE_LABELS[commission.type]}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={commission.status === "paid" ? "default" : "secondary"}>
          {commission.status || "-"}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatDate(commission.created_at)}
      </TableCell>
      {isAdmin ? (
        <TableCell className="text-right">
          <CommissionStatusAction
            commissionId={commission.id}
            status={commission.status}
          />
        </TableCell>
      ) : null}
    </TableRow>
  );
}
