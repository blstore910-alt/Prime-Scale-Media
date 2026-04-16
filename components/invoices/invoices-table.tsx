"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import useInvoices from "./use-invoices";
import CreateInvoiceDialog from "./create-invoice-dialog";
import InvoiceCard from "./invoice-card";
import InvoiceRow from "./invoice-row";
import { InvoiceWithRelations } from "@/lib/types/invoice-extended";
import { toast } from "sonner";

export default function InvoicesTable() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<
    string | null
  >(null);
  const [updatingInvoiceId, setUpdatingInvoiceId] = useState<string | null>(
    null,
  );
  const [isCreateInvoiceOpen, setIsCreateInvoiceOpen] = useState(false);
  const perPage = 10;
  const isTabletScreen = useMediaQuery("(min-width: 768px)");
  const queryClient = useQueryClient();
  const { profile } = useAppContext();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const { invoices, total, isLoading, isError, error } = useInvoices({
    search: debouncedSearch,
    page,
    perPage,
  });

  const { mutate: updateInvoiceStatus } = useMutation({
    mutationKey: ["update-invoice-status", profile?.tenant_id],
    mutationFn: async ({
      invoiceId,
      status,
    }: {
      invoiceId: string;
      status: "paid" | "unpaid";
    }) => {
      if (!profile?.tenant_id) {
        throw new Error("Tenant information is missing.");
      }

      const supabase = createClient();
      const payload = {
        status,
        paid_at: status === "paid" ? new Date().toISOString() : null,
      };

      const { error } = await supabase
        .from("invoices")
        .update(payload)
        .eq("id", invoiceId)
        .eq("tenant_id", profile.tenant_id);

      if (error) {
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["invoices", profile?.tenant_id],
      });
    },
  });

  const handleDownload = async (invoice: InvoiceWithRelations) => {
    if (downloadingInvoiceId === invoice.id) return;

    setDownloadingInvoiceId(invoice.id);

    try {
      const response = await fetch(`/api/invoices/${invoice.id}/pdf`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
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

  const handleTogglePaidStatus = (invoice: InvoiceWithRelations) => {
    const nextStatus = invoice.status === "paid" ? "unpaid" : "paid";
    setUpdatingInvoiceId(invoice.id);

    updateInvoiceStatus(
      { invoiceId: invoice.id, status: nextStatus },
      {
        onSuccess: () => {
          toast.success(
            nextStatus === "paid"
              ? "Invoice marked as paid."
              : "Invoice marked as unpaid.",
          );
        },
        onError: (mutationError) => {
          toast.error("Failed to update invoice status", {
            description:
              mutationError instanceof Error
                ? mutationError.message
                : "Unknown error",
          });
        },
        onSettled: () => {
          setUpdatingInvoiceId(null);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <CreateInvoiceDialog
        open={isCreateInvoiceOpen}
        onOpenChange={setIsCreateInvoiceOpen}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Invoices</h2>
          <p className="text-sm text-muted-foreground">
            View and download all invoices for your account.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice no..."
              className="pl-8"
            />
          </div>
          <Button onClick={() => setIsCreateInvoiceOpen(true)}>
            Create Invoice
          </Button>
        </div>
      </div>

      {isTabletScreen ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Advertiser</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Paid At</TableHead>
                <TableHead>Created On</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <TableRow key={idx} className="animate-pulse">
                    {Array.from({ length: 9 }).map((__, cellIdx) => (
                      <LoaderCell key={cellIdx} />
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center text-destructive py-8"
                  >
                    <div role="alert" aria-live="assertive">
                      <p className="font-medium">Failed to load invoices.</p>
                      <p className="mt-2 text-sm">
                        {(error as Error)?.message ?? String(error)}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : invoices.length ? (
                invoices.map((invoice) => (
                  <InvoiceRow
                    key={invoice.id}
                    invoice={invoice}
                    onDownload={handleDownload}
                    isDownloading={downloadingInvoiceId === invoice.id}
                    onTogglePaidStatus={handleTogglePaidStatus}
                    isUpdatingStatus={updatingInvoiceId === invoice.id}
                  />
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No invoices found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="grid gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="h-28 rounded-md bg-muted animate-pulse"
              />
            ))
          ) : isError ? (
            <div className="text-center text-destructive py-8">
              <p className="font-medium">Failed to load invoices.</p>
              <p className="mt-2 text-sm">
                {(error as Error)?.message ?? String(error)}
              </p>
            </div>
          ) : invoices.length ? (
            invoices.map((invoice) => (
              <InvoiceCard
                key={invoice.id}
                invoice={invoice}
                onDownload={handleDownload}
                isDownloading={downloadingInvoiceId === invoice.id}
                onTogglePaidStatus={handleTogglePaidStatus}
                isUpdatingStatus={updatingInvoiceId === invoice.id}
              />
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No invoices found.
            </div>
          )}
        </div>
      )}

      <div className="p-4">
        <TablePagination
          total={total}
          page={page}
          perPage={perPage}
          onPageChange={(p) => setPage(p)}
        />
      </div>
    </div>
  );
}

function LoaderCell() {
  return (
    <TableCell>
      <div className="h-4 bg-muted rounded w-8" />
    </TableCell>
  );
}
