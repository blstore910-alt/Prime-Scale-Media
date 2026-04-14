"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TablePagination from "@/components/ui/table-pagination";
import { useAppContext } from "@/context/app-provider";
import { CURRENCY_SYMBOLS, DATE_FORMAT } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { InvoiceWithRelations } from "@/lib/types/invoice-extended";
import dayjs from "dayjs";
import { AlertCircle, Download, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMediaQuery } from "usehooks-ts";
import InvoiceCard from "@/components/invoices/invoice-card";
import { toast } from "sonner";
import {
  formatSubscriptionAmount,
  formatSubscriptionDate,
  getStatusBadgeClassName,
} from "./subscription-utils";
import { Subscription } from "./types";

type SubscriptionOverview = Pick<
  Subscription,
  "id" | "amount" | "start_date" | "status" | "next_payment_date" | "created_at"
>;

const formatInvoiceAmount = (value: number | string | null | undefined) => {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "0.00";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
};

export default function MySubscriptionView() {
  const { profile } = useAppContext();
  const advertiserId = profile?.advertiser?.[0]?.id ?? null;
  const tenantId = profile?.tenant_id ?? null;
  const isTabletScreen = useMediaQuery("(min-width: 768px)");
  const [page, setPage] = useState(1);
  const perPage = 5;
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<
    string | null
  >(null);

  useEffect(() => {
    setPage(1);
  }, [advertiserId]);

  const subscriptionQueryKey = useMemo(
    () => ["my-subscription", advertiserId, tenantId],
    [advertiserId, tenantId],
  );

  const {
    data: subscription,
    isLoading: subscriptionLoading,
    isError: subscriptionError,
    error: subscriptionErrorMessage,
  } = useQuery<SubscriptionOverview | null>({
    queryKey: subscriptionQueryKey,
    enabled: !!advertiserId && !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id, amount, start_date, status, next_payment_date, created_at")
        .eq("advertiser_id", advertiserId)
        .eq("tenant_id", tenantId)
        .order("start_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;

      return (data?.[0] ?? null) as SubscriptionOverview | null;
    },
  });

  const invoiceQueryKey = useMemo(
    () => ["subscription-invoices", advertiserId, tenantId, page, perPage],
    [advertiserId, tenantId, page, perPage],
  );

  const {
    data: invoiceData,
    isLoading: invoicesLoading,
    isError: invoicesError,
    error: invoicesErrorMessage,
  } = useQuery<{ items: InvoiceWithRelations[]; total: number }>({
    queryKey: invoiceQueryKey,
    enabled: !!advertiserId && !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const start = (page - 1) * perPage;
      const end = start + perPage - 1;

      const { data, error, count } = await supabase
        .from("invoices")
        .select("id, number, total, status, paid_at, created_at, items, type", {
          count: "exact",
        })
        .eq("tenant_id", tenantId)
        .eq("advertiser_id", advertiserId)
        .eq("type", "subscription")
        .order("created_at", { ascending: false })
        .range(start, end);

      if (error) throw error;

      return {
        items: (data ?? []) as InvoiceWithRelations[],
        total: count ?? (data ?? []).length,
      };
    },
  });

  const invoices = invoiceData?.items ?? [];
  const totalInvoices = invoiceData?.total ?? 0;

  const handleDownload = async (invoice: InvoiceWithRelations) => {
    if (downloadingInvoiceId === invoice.id) return;

    setDownloadingInvoiceId(invoice.id);

    try {
      const response = await fetch(`/api/invoices/${invoice.id}/pdf`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "Failed to download invoice");
      }

      const blob = await response.blob();
      const fileUrl = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = fileUrl;
      anchor.download = `invoice-${invoice.number}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      URL.revokeObjectURL(fileUrl);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to download invoice",
      );
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  const statusLabel = subscription?.status ?? "unknown";
  const statusClasses = subscription?.status
    ? getStatusBadgeClassName(subscription.status)
    : "bg-muted text-muted-foreground";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Subscription Overview</CardTitle>
          <CardDescription>
            Track your subscription status and billing details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subscriptionLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : subscriptionError ? (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <span>
                {(subscriptionErrorMessage as Error)?.message ??
                  "Failed to load subscription data."}
              </span>
            </div>
          ) : !subscription ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No subscription found for your account yet.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <DetailItem label="Start date">
                {formatSubscriptionDate(subscription.start_date)}
              </DetailItem>
              <DetailItem label="Amount">
                €{formatSubscriptionAmount(subscription.amount)}
              </DetailItem>
              <DetailItem label="Next payment date">
                {formatSubscriptionDate(subscription.next_payment_date)}
              </DetailItem>
              <DetailItem label="Status">
                <Badge className={statusClasses} variant="secondary">
                  {statusLabel}
                </Badge>
              </DetailItem>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Subscription Invoices</CardTitle>
            <CardDescription>
              Recent invoices generated for your subscription.
            </CardDescription>
          </div>
          <CardAction>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/invoices">View all</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {isTabletScreen ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Paid At</TableHead>
                    <TableHead>Created On</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoicesLoading ? (
                    Array.from({ length: 4 }).map((_, idx) => (
                      <TableRow key={`invoice-loader-${idx}`}>
                        {Array.from({ length: 6 }).map((__, cellIdx) => (
                          <LoaderCell key={`invoice-loader-${idx}-${cellIdx}`} />
                        ))}
                      </TableRow>
                    ))
                  ) : invoicesError ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-destructive py-8"
                      >
                        <div role="alert" aria-live="assertive">
                          <p className="font-medium">
                            Failed to load subscription invoices.
                          </p>
                          <p className="mt-2 text-sm">
                            {(invoicesErrorMessage as Error)?.message ??
                              String(invoicesErrorMessage)}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : invoices.length ? (
                    invoices.map((invoice) => {
                      const currency = invoice.items?.[0]?.currency;
                      const currencySymbol =
                        CURRENCY_SYMBOLS[
                          currency as keyof typeof CURRENCY_SYMBOLS
                        ] ?? "€";
                      const isPaid = invoice.status === "paid";

                      return (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-mono">
                            {invoice.number}
                          </TableCell>
                          <TableCell className="font-mono font-semibold">
                            {currencySymbol}
                            {formatInvoiceAmount(invoice.total)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              className={
                                isPaid ? "bg-green-500 hover:bg-green-600" : ""
                              }
                              variant={isPaid ? "default" : "secondary"}
                            >
                              {isPaid ? "Paid" : "Unpaid"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {invoice.paid_at
                              ? dayjs(invoice.paid_at).format(DATE_FORMAT)
                              : "-"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {dayjs(invoice.created_at).format(DATE_FORMAT) ||
                              "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={downloadingInvoiceId === invoice.id}
                              onClick={() => handleDownload(invoice)}
                            >
                              {downloadingInvoiceId === invoice.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center py-8 text-muted-foreground"
                      >
                        No subscription invoices found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="grid gap-4">
              {invoicesLoading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <div
                    key={`invoice-card-loader-${idx}`}
                    className="h-36 rounded-md bg-muted animate-pulse"
                  />
                ))
              ) : invoicesError ? (
                <div className="text-center text-destructive py-8">
                  <p className="font-medium">
                    Failed to load subscription invoices.
                  </p>
                  <p className="mt-2 text-sm">
                    {(invoicesErrorMessage as Error)?.message ??
                      String(invoicesErrorMessage)}
                  </p>
                </div>
              ) : invoices.length ? (
                invoices.map((invoice) => (
                  <InvoiceCard
                    key={invoice.id}
                    invoice={invoice}
                    onDownload={handleDownload}
                    isDownloading={downloadingInvoiceId === invoice.id}
                  />
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No subscription invoices found.
                </div>
              )}
            </div>
          )}

          <div className="p-4">
            <TablePagination
              total={totalInvoices}
              page={page}
              perPage={perPage}
              onPageChange={(nextPage) => setPage(nextPage)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 text-lg font-semibold">{children}</div>
    </div>
  );
}

function LoaderCell() {
  return (
    <TableCell>
      <div className="h-4 bg-muted rounded w-10" />
    </TableCell>
  );
}
