"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InvoiceWithRelations } from "@/lib/types/invoice-extended";
import { CURRENCY_SYMBOLS } from "@/lib/constants";
import { Download, Loader2 } from "lucide-react";
import { useAppContext } from "@/context/app-provider";

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

export default function InvoiceCard({
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
  const isAdmin = profile?.role === "admin";
  const advertiserCode = invoice.advertiser?.tenant_client_code ?? "-";
  const companyName = invoice.company?.name ?? "-";
  const currency = invoice.items?.[0].currency;
  const isPaid = invoice.status === "paid";
  const statusLabel = isPaid ? "Paid" : "Unpaid";
  const currencySymbol =
    CURRENCY_SYMBOLS[currency as keyof typeof CURRENCY_SYMBOLS] ?? "$";

  return (
    <Card className="py-0">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Invoice #</span>
              <span className="font-mono font-medium">{invoice.number}</span>
            </div>
            {isAdmin && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Advertiser
                  </span>
                  <span className="font-medium">{advertiserCode}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Company</span>
                  <span className="font-medium text-sm">{companyName}</span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Type</span>
              <span className="text-sm capitalize">{invoice.type ?? "-"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Amount</span>
              <span className="font-mono font-semibold">
                {currencySymbol}
                {formatAmount(invoice.total)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge
                className={isPaid ? "bg-green-500 hover:bg-green-600" : ""}
                variant={isPaid ? "default" : "secondary"}
              >
                {statusLabel}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Paid At</span>
              <span className="text-sm">
                {invoice.paid_at ? formatDate(invoice.paid_at) : "-"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Date</span>
              <span className="text-sm">{formatDate(invoice.created_at)}</span>
            </div>
          </div>
        </div>
        <div className="border-t mt-2 pt-2 space-y-2">
          {isAdmin && (
            <Button
              variant="outline"
              disabled={isUpdatingStatus}
              className="w-full"
              onClick={() => onTogglePaidStatus?.(invoice)}
            >
              {isUpdatingStatus && <Loader2 className="h-4 w-4 animate-spin" />}
              {isPaid ? "Mark as Unpaid" : "Mark as Paid"}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={isDownloading}
            className="w-full"
            onClick={() => onDownload?.(invoice)}
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span>Download invoice</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
