"use client";

import { useSearchParams } from "next/navigation";

import { setInvoicePaidStatus } from "@/actions/invoice-actions";
import { invoiceNumber } from "@/lib/payment-reference";
import CustomerName from "@/components/psm/customer-name";
import TablePagination from "@/components/ui/table-pagination";
import { useAppContext } from "@/context/app-provider";
import InvoiceDocButtons from "@/components/invoices/invoice-doc-buttons";
import { emptyRow } from "@/components/ui/empty-row";
import { DATE_FORMAT } from "@/lib/constants";
import { InvoiceWithRelations } from "@/lib/types/invoice-extended";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
  CheckCircle,
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
import PsmSortFilter from "@/components/psm/sort-filter";
import { voidInvoiceAsAdmin } from "@/actions/invoice-actions";
import { Textarea } from "@/components/ui/textarea";
import { Ban } from "lucide-react";
import { invoiceCurrencySymbol } from "@/lib/pure-invoice-currency";

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
  const [status, setStatus] = useState("all");
// ── A LINK CAN ARRIVE WITH A CUSTOMER ALREADY IN MIND ───────────────
//
// The subscriptions list, the requests queue and the accounts table all
// link here with ?q=PSM0005, because "show me this customer" is the
// question every one of those screens ends on. Without this the code in
// the URL was ignored and the admin retyped, by hand, the code they had
// just clicked.
//
// Read ONCE, as the initial state: after that the box belongs to
// whoever is typing in it, and re-syncing on every render would fight
// them.
  const initialQuery = useSearchParams().get("q") ?? "";
  const [search, setSearch] = useState(initialQuery);
  const [debouncedSearch, setDebouncedSearch] = useState(initialQuery);
  const [page, setPage] = useState(1);
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

  // Status too, or narrowing on page 3 keeps you on page 3 of a list
  // that may no longer have one.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status]);

  const { invoices, total, isLoading, isError, error } = useInvoices({
    search: debouncedSearch,
    status,
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

  // ── CANCELLING ONE THAT SHOULD NEVER HAVE BEEN ISSUED ────────────
  //
  // A subscription change always works in our favour, so lowering a
  // price pays nothing back and an invoice already issued stands at the
  // old amount. Right for a renegotiation, wrong for a typo: 2000
  // instead of 200 is also a lowering, so the customer is left owing
  // 2000 and the billing run takes it out of their wallet on the due
  // date. Nothing in the app could stop that -- "Mark unpaid" is
  // refused for a paid invoice and does nothing for an open one, so the
  // only way out was hand-written SQL.
  const [confirmVoid, setConfirmVoid] =
    useState<InvoiceWithRelations | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const { mutate: voidInvoice } = useMutation({
    mutationKey: ["void-invoice", profile?.tenant_id],
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const result = await voidInvoiceAsAdmin(id, reason);
      if (!result.ok) throw new Error(result.error);
      return result.warning ?? null;
    },
    onSuccess: async (warning) => {
      if (typeof warning === "string" && warning) {
        // Cancelling does not touch subscriptions.amount, so a wrong
        // figure is raised again the same night. The action looks and
        // says so rather than leaving the admin to find out.
        toast.warning("Cancelled — one thing left to do", {
          description: warning,
          duration: 14_000,
        });
      } else {
        toast.success("Invoice cancelled");
      }
      setConfirmVoid(null);
      setVoidReason("");
      await queryClient.invalidateQueries({
        queryKey: ["invoices", profile?.tenant_id],
      });
    },
    onError: (e: Error) =>
      toast.error("Couldn't cancel it", { description: e.message }),
    onSettled: () => setUpdatingInvoiceId(null),
  });

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
        {/* "Who owes us money" was unanswerable from this screen: the bar
            was a search box and nothing else, while every row carries
            Paid / Unpaid / Overdue / Void / Refunded. An operator paged
            through everything by hand. */}
        <PsmSortFilter
          filters={[
            {
              id: "status",
              label: "Status",
              value: status,
              onChange: (v) => setStatus(v),
              options: [
                { value: "all", label: "All statuses" },
                { value: "unpaid", label: "Unpaid" },
                { value: "overdue", label: "Overdue" },
                { value: "paid", label: "Paid" },
                { value: "void", label: "Void" },
                /* No "Refunded": nothing in the app ever writes that
                   status — it exists only as a label an RPC returns —
                   so the option could only ever answer "No invoices",
                   which reads as a fact about the books. */
              ],
            },
          ]}
          searchActive={!!search.trim()}
          onReset={() => {
            setStatus("all");
            setSearch("");
          }}
        />
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
                        // One rule, from lib/pure-invoice-currency: this
                        // row said EUR while the modal one click later
                        // said USD for the same invoice, because only one
                        // of them uppercased the code.
                        const currencySymbol = invoiceCurrencySymbol(invoice);
                        const isUpdatingStatus =
                          updatingInvoiceId === invoice.id;
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
                                    <span className="alab">Mark paid</span>
                                  </button>
                                )}
                                {/* VIEW as well as download. Reading an
                                    invoice meant saving a PDF to disk and
                                    then finding it again — on the screen an
                                    admin opens precisely to check a figure
                                    somebody has just asked about. */}
                                {/* Only where it can succeed: never on a
                                    paid invoice (the money has moved --
                                    that is a refund or a credit note) and
                                    never on one already cancelled. */}
                                {isAdmin && !isVoid && !isPaid && (
                                  <button
                                    /* No `ghost`: .psmapp .btn.ghost.danger
                                       sits later in the sheet at equal
                                       specificity and wins with
                                       border-color:transparent, the
                                       opposite of what .danger.soft is for. */
                                    className="btn sm danger soft"
                                    disabled={isUpdatingStatus}
                                    onClick={() => {
                                      setVoidReason("");
                                      setConfirmVoid(invoice);
                                    }}
                                    title="Cancel this invoice"
                                  >
                                    <Ban />
                                    <span className="alab">Cancel</span>
                                  </button>
                                )}
                                <InvoiceDocButtons
                                  invoiceId={invoice.id}
                                  fileLabel={invoiceNumber(invoice)}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    : emptyRow(colCount, {
                        noun: "invoices",
                        search: debouncedSearch,
                        // `filtered` was never passed, so EmptyState
                        // computed "narrowed" from the search box alone.
                        // Status = Overdue with an empty box therefore
                        // printed "No invoices yet." -- and no Clear
                        // button -- two hundred pixels under a header
                        // promising "Issued, paid and overdue". Eleven
                        // customers forty days late, and the dunning run
                        // skipped. The subscriptions table gets this
                        // right; this one missed it.
                        filtered: status !== "all",
                        onClear: () => {
                          setSearch("");
                          setStatus("all");
                        },
                      })}
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
                `${invoiceCurrencySymbol(confirmPaid)}${formatAmount(confirmPaid.total)}`
              : ""
          }
          strong
        />
      </ConfirmModal>

      <ConfirmModal
        open={!!confirmVoid}
        onOpenChange={(next) => {
          if (!next && !updatingInvoiceId) {
            setConfirmVoid(null);
            setVoidReason("");
          }
        }}
        title="Cancel this invoice?"
        lead="It stops being owed: the customer can no longer pay it and the daily collection will not take it from their wallet. Nothing is deleted — it stays on the record as cancelled, with your reason. If the amount itself was wrong, change the subscription too: cancelling does not touch the plan, so tonight's run would raise the same figure again."
        cta="Yes, cancel it"
        tone="danger"
        busy={!!updatingInvoiceId}
        busyLabel="Cancelling…"
        disabled={voidReason.trim().length < 3}
        onConfirm={() => {
          if (!confirmVoid || voidReason.trim().length < 3) return;
          setUpdatingInvoiceId(confirmVoid.id);
          voidInvoice({ id: confirmVoid.id, reason: voidReason.trim() });
        }}
      >
        <ConfirmFact
          label="Invoice"
          value={confirmVoid ? invoiceNumber(confirmVoid) : ""}
        />
        <ConfirmFact
          label="Customer"
          value={confirmVoid?.advertiser?.tenant_client_code ?? "—"}
        />
        <ConfirmFact
          label="Amount"
          value={
            confirmVoid
              ? `${invoiceCurrencySymbol(confirmVoid)}${formatAmount(confirmVoid.total)}`
              : ""
          }
          strong
        />
        {/* Required, and kept. A cancelled invoice with no explanation
            is indistinguishable from a mistake six months later. */}
        <div className="grid gap-2" style={{ marginTop: 10 }}>
          <label htmlFor="void-reason" style={{ fontSize: ".8rem", fontWeight: 700 }}>
            Why is it being cancelled?
          </label>
          <Textarea
            id="void-reason"
            rows={3}
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="e.g. issued at 2000 instead of 200 — reissued correctly"
          />
        </div>
      </ConfirmModal>
    </div>
  );
}
