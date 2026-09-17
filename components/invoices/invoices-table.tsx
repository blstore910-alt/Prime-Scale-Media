"use client";

import { setInvoicePaidStatus } from "@/actions/invoice-actions";
import { invoiceNumber } from "@/lib/payment-reference";
import CustomerName from "@/components/psm/customer-name";
import TablePagination from "@/components/ui/table-pagination";
import { useAppContext } from "@/context/app-provider";
import { CURRENCY_SYMBOLS, DATE_FORMAT } from "@/lib/constants";
import { InvoiceWithRelations } from "@/lib/types/invoice-extended";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
  CheckCircle,
  Download,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import { invoiceStatusView } from "@/lib/invoice-status";
import { toast } from "sonner";
import CreateInvoiceDialog from "./create-invoice-dialog";
import useInvoices from "./use-invoices";

const formatInvoiceType = (type: string | null) => {
  if (!type) return "—";
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

const loadingRow = (colSpan: number) => (
  <tr>
    <td colSpan={colSpan} style={{ textAlign: "center", padding: 28 }}>
      <Loader2 className="animate-spin" style={{ display: "inline" }} />
    </td>
  </tr>
);

const stateRow = (colSpan: number, msg: string, danger = false) => (
  <tr>
    <td
      colSpan={colSpan}
      style={{
        textAlign: "center",
        padding: 28,
        color: danger ? "var(--danger)" : "var(--txt-2)",
      }}
    >
      {msg}
    </td>
  </tr>
);

// Invoices ledger (admin / super-admin), ported to the PSM mockup look.
// Reuses the real useInvoices hook, the mark-paid/unpaid mutation, the PDF
// download and the CreateInvoiceDialog — presentation only, every column,
// search and action preserved.
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
  const queryClient = useQueryClient();
  const { profile } = useAppContext();

  const isAdmin = profile?.role === "admin";

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
      const result = await setInvoicePaidStatus(invoiceId, status);
      if (!result.ok) throw new Error(result.error);
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
      anchor.download = `invoice-${invoiceNumber(invoice)}.pdf`;
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

  // Marking an invoice paid is a statement about money that did or did not
  // arrive, made with one click next to a Download button. It settles a debt
  // in the books without anything moving, and the customer's own billing
  // page changes with it — so it gets asked first, like the customer's own
  // Pay now does.
  const [confirmPaid, setConfirmPaid] =
    useState<InvoiceWithRelations | null>(null);

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
          setConfirmPaid(null);
        },
      },
    );
  };

  const colCount = isAdmin ? 8 : 6;

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <CreateInvoiceDialog
        open={isCreateInvoiceOpen}
        onOpenChange={setIsCreateInvoiceOpen}
      />

      <div className="phead phead-actions">
        <div className="ptxt">
          <h1>Invoices</h1>
          <p>{isAdmin ? "Issued, paid and overdue." : "View and download your invoices."}</p>
        </div>
        {isAdmin && (
          <div className="pacts">
            <button
              className="btn"
              onClick={() => setIsCreateInvoiceOpen(true)}
            >
              <Plus /> <span className="blab">Create Invoice</span>
            </button>
          </div>
        )}
      </div>

      <div className="fbar">
        <label className="fsr">
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice no…"
          />
        </label>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="tblwrap">
          <table className="tbl wide">
            <thead>
              <tr>
                <th style={{ paddingLeft: 14 }}>Invoice #</th>
                {isAdmin && (
                  <>
                    <th>Advertiser</th>
                    <th>Company</th>
                  </>
                )}
                <th>Type</th>
                <th className="r">Amount</th>
                <th>Status</th>
                <th className="r nw">Created On</th>
                <th className="r">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? loadingRow(colCount)
                : isError
                  ? stateRow(
                      colCount,
                      (error as Error)?.message ?? "Failed to load invoices.",
                      true,
                    )
                  : invoices.length
                    ? invoices.map((invoice) => {
                        const isPaid = invoice.status === "paid";
                        const st = invoiceStatusView(invoice.status);
                        // Nothing to mark paid on an invoice that is already
                        // settled one way or another.
                        const isVoid = st.settled && !isPaid;
                        const currencySymbol =
                          CURRENCY_SYMBOLS[
                            invoice.currency as keyof typeof CURRENCY_SYMBOLS
                          ] ?? "€";
                        const isUpdatingStatus =
                          updatingInvoiceId === invoice.id;
                        const isDownloading =
                          downloadingInvoiceId === invoice.id;
                        return (
                          <tr key={invoice.id}>
                            <td
                              className="mono"
                              style={{ fontWeight: 600, whiteSpace: "nowrap" }}
                              data-label="Invoice #"
                            >
                              {/* The SAME identity the PDF filename, the
                                  advertiser's own list and the payment
                                  reference use. This printed the bare
                                  sequence while the download two lines up
                                  already used invoiceNumber(), so one
                                  invoice had two names depending on which
                                  one you happened to read — and those two
                                  people phone each other about it. */}
                              {invoiceNumber(invoice)}
                            </td>
                            {isAdmin && (
                              <>
                                <td data-label="Advertiser">
                                  {/* Code first, name beneath. */}
                                  <CustomerName
                                    clientCode={
                                      invoice.advertiser?.tenant_client_code
                                    }
                                    name={
                                      invoice.advertiser?.profile?.full_name
                                    }
                                    full
                                  />
                                </td>
                                {/* One line, capped, with the whole name
                                    in the title. "Test Advertiser BV" was
                                    drawn on three lines here. */}
                                <td className="clip" data-label="Company">
                                  <span
                                    style={{ fontWeight: 600 }}
                                    title={invoice.company?.name ?? undefined}
                                  >
                                    {invoice.company?.name ?? "—"}
                                  </span>
                                </td>
                              </>
                            )}
                            <td
                              className="muted"
                              style={{ textTransform: "capitalize" }}
                              data-label="Type"
                            >
                              {formatInvoiceType(invoice.type)}
                            </td>
                            <td
                              className="r mono"
                              style={{ fontWeight: 700 }}
                              data-label="Amount"
                            >
                              {currencySymbol}
                              {formatAmount(invoice.total)}
                            </td>
                            {/* Paid At used to be its own column, which
                                meant a whole column of em-dashes on any
                                list of unpaid invoices — and it is what
                                pushed this table past the edge of the
                                window. The date belongs TO the "Paid"
                                badge; it only exists when that badge does. */}
                            {/* The REAL status, not paid-or-not. This
                                drew every non-paid invoice as "Unpaid",
                                so a VOIDED invoice — one that has been
                                superseded and is owed by nobody — sat in
                                the list looking exactly like a debt, with
                                a Mark Paid button next to it. */}
                            <td data-label="Status" className="nw">
                              <span className={`badge ${st.tone}`}>
                                {st.label}
                              </span>
                              {isPaid && invoice.paid_at && (
                                <div
                                  className="muted"
                                  style={{ fontSize: ".76rem", marginTop: 2 }}
                                >
                                  {dayjs(invoice.paid_at).format(DATE_FORMAT)}
                                </div>
                              )}
                            </td>
                            <td className="r muted" data-label="Created On">
                              {dayjs(invoice.created_at).format(DATE_FORMAT)}
                            </td>
                            {/* Two buttons stretched to a 1fr 1fr grid,
                                each width:100%, demanded ~210px of a cell
                                that had none to give — which is what put
                                the scrollbar under this table. The shared
                                .actrow sizes them to their own labels, and
                                Download is an icon with a title: it is the
                                secondary action on the row and its glyph is
                                unambiguous. */}
                            <td className="r fullcell" data-label="Actions">
                              <div className="actrow">
                                {/* Not on a PAID invoice. setInvoicePaidStatus
                                    refuses every paid→unpaid transition
                                    unconditionally, so "Mark Unpaid" was a
                                    control that produced a red toast 100% of
                                    the time — there is no state in which it
                                    can succeed. Correcting a wrongly-paid
                                    invoice is an adjustment, not a toggle. */}
                                {isAdmin && !isVoid && !isPaid && (
                                  <button
                                    className="btn ghost sm"
                                    disabled={isUpdatingStatus}
                                    onClick={() => setConfirmPaid(invoice)}
                                  >
                                    {isUpdatingStatus ? (
                                      <Loader2 className="animate-spin" />
                                    ) : (
                                      <CheckCircle />
                                    )}
                                    Mark paid
                                  </button>
                                )}
                                <button
                                  className="btn ghost sm"
                                  disabled={isDownloading}
                                  onClick={() => handleDownload(invoice)}
                                  title="Download invoice"
                                  aria-label="Download invoice"
                                >
                                  {isDownloading ? (
                                    <Loader2 className="animate-spin" />
                                  ) : (
                                    <Download />
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    : stateRow(colCount, "No invoices found.")}
            </tbody>
          </table>
        </div>
        <div style={{ padding: 12 }}>
          <TablePagination
            total={total}
            page={page}
            perPage={perPage}
            onPageChange={(p) => setPage(p)}
          />
        </div>
      </div>

      <ConfirmModal
        open={!!confirmPaid}
        onOpenChange={(next) => {
          if (!next) setConfirmPaid(null);
        }}
        title={
          confirmPaid?.status === "paid"
            ? "Reopen this invoice?"
            : "Mark this invoice as paid?"
        }
        lead={
          confirmPaid?.status === "paid"
            ? "It goes back to unpaid for the customer too, and dunning treats it as owed again."
            : "This settles it in the books. No money moves — only do it when the payment has actually arrived."
        }
        cta={
          confirmPaid?.status === "paid" ? "Yes, reopen it" : "Yes, mark it paid"
        }
        tone={confirmPaid?.status === "paid" ? "danger" : "default"}
        busy={!!updatingInvoiceId}
        busyLabel="Saving…"
        onConfirm={() => confirmPaid && handleTogglePaidStatus(confirmPaid)}
      >
        <ConfirmFact label="Invoice" value={confirmPaid ? invoiceNumber(confirmPaid) : ""} />
        <ConfirmFact
          label="Customer"
          value={confirmPaid?.advertiser?.tenant_client_code ?? "—"}
        />
        <ConfirmFact
          label="Amount"
          value={
            confirmPaid
              ? // invoices.currency first, like the row above it and like
                // the RPC that takes the money. Reading items[0] here asked
                // an admin to confirm €2,000 for a $2,000 invoice whose
                // items array was empty.
                `${CURRENCY_SYMBOLS[((confirmPaid.currency ?? confirmPaid.items?.[0]?.currency ?? "EUR") as string).toUpperCase() as keyof typeof CURRENCY_SYMBOLS] ?? "€"}${formatAmount(confirmPaid.total)}`
              : ""
          }
          strong
        />
      </ConfirmModal>
    </div>
  );
}
