"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { useAppContext } from "@/context/app-provider";
import { CURRENCY_SYMBOLS, DATE_FORMAT } from "@/lib/constants";
import { InvoiceWithRelations } from "@/lib/types/invoice-extended";
import dayjs from "dayjs";
import { CheckCircle, Download, Loader2, XCircle } from "lucide-react";

const formatInvoiceType = (type: string | null) => {
  if (!type) return "-";
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatAmount = (value: number | string | null | undefined) => {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export default function InvoiceRow({
  invoice,
  onDownload,
  onTogglePaidStatus,
  isDownloading = false,
  isUpdatingStatus = false,
}: {
  invoice: InvoiceWithRelations;
  onDownload?: (invoice: InvoiceWithRelations) => void | Promise<void>;
  onTogglePaidStatus?: (invoice: InvoiceWithRelations) => void | Promise<void>;
  isDownloading?: boolean;
  isUpdatingStatus?: boolean;
}) {
  const { profile } = useAppContext();
  const advertiserCode = invoice.advertiser?.tenant_client_code ?? "-";
  const companyName = invoice.company?.name ?? "-";
  const currency = invoice.items?.[0].currency;
  const invoiceType = formatInvoiceType(invoice.type);
  const isPaid = invoice.status === "paid";
  const statusLabel = isPaid ? "Paid" : "Unpaid";
  const currencySymbol =
    CURRENCY_SYMBOLS[currency as keyof typeof CURRENCY_SYMBOLS] ?? "€";

  const isAdmin = profile?.role === "admin";

  return (
    <TableRow>
      <TableCell className="font-mono">{invoice.number}</TableCell>
      <TableCell>{advertiserCode}</TableCell>
      <TableCell className="font-medium">{companyName}</TableCell>
      <TableCell className="capitalize">{invoiceType}</TableCell>
      <TableCell className="font-mono font-semibold">
        {currencySymbol}
        {formatAmount(invoice.total)}
      </TableCell>
      <TableCell>
        <Badge
          className={isPaid ? "bg-green-500 hover:bg-green-600" : ""}
          variant={isPaid ? "default" : "secondary"}
        >
          {statusLabel}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {invoice.paid_at ? dayjs(invoice.paid_at).format(DATE_FORMAT) : "-"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {dayjs(invoice.created_at).format(DATE_FORMAT) || "-"}
      </TableCell>
      <TableCell className="">
        <div className="flex justify-end gap-2">
          {isAdmin && (
            <Button
              variant={isPaid ? "destructive" : "default"}
              size="sm"
              disabled={isUpdatingStatus}
              onClick={() => onTogglePaidStatus?.(invoice)}
              className="text-white"
            >
              {isPaid ? (
                <XCircle className="h-4 w-4 mr-1" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-1" />
              )}
              {isUpdatingStatus && <Loader2 className="h-4 w-4 animate-spin" />}
              {isPaid ? "Mark Unpaid" : "Mark Paid"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={isDownloading}
            onClick={() => onDownload?.(invoice)}
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
