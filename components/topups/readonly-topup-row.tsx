import { TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils-pure";
import { DATE_FORMAT, TOPUP_TYPES } from "@/lib/constants";
import dayjs from "dayjs";
import React from "react";
import { Badge } from "../ui/badge";
import { CheckCircle2, MinusCircle } from "lucide-react";
import { Topup } from "@/lib/types/topup";
import { cn } from "@/lib/utils";
import { sameSlug } from "@/lib/pure-slug-key";

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
      <TableCell data-label="#:">{String(topup.number).padStart(6, "0")}</TableCell>
      <TableCell className="font-medium" data-label="Account:">
        {topup.account_name || "---"}
      </TableCell>
      <TableCell data-label="Type:">
        {TOPUP_TYPES.find((t) => t.value === topup.type)?.label}
      </TableCell>
      {/* ── THROUGH A FORMATTER ────────────────────────────────────────
          These five money cells printed the raw column. On values still
          stored as `real` that is 1139.5300292968750 on a customer's own
          history, and EUR 10,000 renders as "10000" where the rest of
          the app says EUR 10,000.00. CURRENCY_SYMBOLS[code] also returns
          NOTHING for an unmapped or lowercase code, so a money cell
          could appear with no symbol at all — this same file guards that
          correctly further down. */}
      <TableCell data-label="Received:">
        {formatCurrency(Number(topup.amount_received), topup.currency ?? "EUR")}
      </TableCell>
      <TableCell data-label="USD value:">
        {formatCurrency(Number(topup.amount_usd), "USD")}
      </TableCell>
      <TableCell data-label="$ Top up:">
        {formatCurrency(
          Number(topup.topup_amount),
          topup.topup_currency || "USD",
        )}
      </TableCell>
      <TableCell data-label="EU values:">
        {/* sameSlug: two spellings, one type. lib/pure-slug-key. */}
        {sameSlug(topup.platform, "eu-meta-premium") ? (
          <span className="font-bold">
            {formatCurrency(Number(topup.eur_value), "EUR")}
            <br />
            <span className="text-muted-foreground text-xs">
              {/* EUR. The column is eur_topup and the line above it is
                  drawn with a euro sign; this one had a dollar, so the
                  same figure appeared twice under two symbols. */}
              {formatCurrency(Number(topup.eur_topup), "EUR")}
            </span>
          </span>
        ) : (
          "N/A"
        )}
      </TableCell>
      <TableCell data-label="Fee:">{topup.fee}%</TableCell>
      <TableCell className="capitalize" data-label="Status:">
        <Badge variant={"outline"} className="gap-1.5 px-2">
          {topup.status === "completed" ? (
            <CheckCircle2 size={14} className="text-emerald-500" />
          ) : (
            <MinusCircle size={14} className="text-slate-400" />
          )}
          {topup.status}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap" data-label="Date:">
        {dayjs(topup.created_at).format(DATE_FORMAT)}
      </TableCell>
    </TableRow>
  );
}
