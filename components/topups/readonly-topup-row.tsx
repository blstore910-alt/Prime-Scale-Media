import { TableCell, TableRow } from "@/components/ui/table";
import { CURRENCY_SYMBOLS, DATE_FORMAT, TOPUP_TYPES } from "@/lib/constants";
import dayjs from "dayjs";
import React from "react";
import { Badge } from "../ui/badge";
import { CheckCircle2, MinusCircle } from "lucide-react";
import { Topup } from "@/lib/types/topup";
import { cn } from "@/lib/utils";

export default function ReadonlyTopupRow({
  topup,
}: {
  topup: Topup & {
    tenant_client_code?: string;
    account_name?: string;
    platform?: string;
  };
}) {
  return (
    <TableRow
      className={cn(
        topup.is_deleted && "bg-destructive/10 hover:bg-destructive/10"
      )}
      key={topup.id}
    >
      <TableCell>{String(topup.number).padStart(6, "0")}</TableCell>
      <TableCell className="font-medium">
        {topup.account_name || "---"}
      </TableCell>
      <TableCell>
        {TOPUP_TYPES.find((t) => t.value === topup.type)?.label}
      </TableCell>
      <TableCell>
        {CURRENCY_SYMBOLS[topup.currency]}&nbsp;
        {topup.amount_received}
      </TableCell>
      <TableCell>
        {CURRENCY_SYMBOLS["USD"]}&nbsp;
        {topup.amount_usd}
      </TableCell>
      <TableCell>
        {CURRENCY_SYMBOLS[topup.topup_currency || "USD"]}&nbsp;
        {topup.topup_amount}
      </TableCell>
      <TableCell>
        {topup.platform === "eu-meta-premium" ? (
          <span className="font-bold">
            €{topup.eur_value}
            <br />
            <span className="text-muted-foreground text-xs">
              ${topup.eur_topup}
            </span>
          </span>
        ) : (
          "N/A"
        )}
      </TableCell>
      <TableCell>{topup.fee}%</TableCell>
      <TableCell className="uppercase">{topup.source}</TableCell>
      <TableCell className="capitalize">
        <Badge variant={"outline"} className="gap-1.5 px-2">
          {topup.status === "completed" ? (
            <CheckCircle2 size={14} className="text-emerald-500" />
          ) : (
            <MinusCircle size={14} className="text-slate-400" />
          )}
          {topup.status}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap">
        {dayjs(topup.created_at).format(DATE_FORMAT)}
      </TableCell>
    </TableRow>
  );
}
