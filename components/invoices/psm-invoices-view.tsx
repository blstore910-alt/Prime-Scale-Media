"use client";

import { CURRENCY_SYMBOLS, DATE_FORMAT } from "@/lib/constants";
import { invoiceNumber } from "@/lib/payment-reference";
import PsmSortFilter from "@/components/psm/sort-filter";
import { InvoiceWithRelations } from "@/lib/types/invoice-extended";
import dayjs from "dayjs";
import { Parser } from "json2csv";
import { Download, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import TablePagination from "@/components/ui/table-pagination";
import useInvoices from "./use-invoices";

const fmtAmount = (v: number | string | null | undefined) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(v ?? 0));

const symbolFor = (inv: InvoiceWithRelations) =>
  CURRENCY_SYMBOLS[
    inv.items?.[0]?.currency as keyof typeof CURRENCY_SYMBOLS
  ] ?? "€";

// Faithful port of the mockup invoices/billing list for advertiser &
// affiliate (rendered inside the .psmapp shell). Real data via
// useInvoices; search is server-side, sort/status/date filter the
// current page, export downloads the loaded rows as CSV.
export default function PsmInvoicesView() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("newest");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("all");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const perPage = 10;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced]);

  const { invoices, total, isLoading, isError, error } = useInvoices({
    search: debounced,
    page,
    perPage,
  });

  const rows = useMemo(() => {
    let list = [...invoices];
    if (status !== "all")
      list = list.filter((i) =>
        status === "paid" ? i.status === "paid" : i.status !== "paid",
      );
    if (range !== "all") {
      const now = dayjs();
      list = list.filter((i) => {
        const d = dayjs(i.created_at);
        if (range === "7") return d.isAfter(now.subtract(7, "day"));
        if (range === "30") return d.isAfter(now.subtract(30, "day"));
        if (range === "month") return d.isAfter(now.startOf("month"));
        return true;
      });
    }
    list.sort((a, b) => {
      if (sort === "amount_desc") return Number(b.total) - Number(a.total);
      if (sort === "amount_asc") return Number(a.total) - Number(b.total);
      const da = dayjs(a.created_at).valueOf();
      const db = dayjs(b.created_at).valueOf();
      return sort === "oldest" ? da - db : db - da;
    });
    return list;
  }, [invoices, status, range, sort]);

  const handleDownload = async (invoice: InvoiceWithRelations) => {
    if (downloadingId === invoice.id) return;
    setDownloadingId(invoice.id);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/pdf`);
      if (!res.ok) {
        const p = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(p?.error || "Failed to download invoice");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${invoiceNumber(invoice)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to download invoice");
    } finally {
      setDownloadingId(null);
    }
  };

  const exportCsv = () => {
    if (!rows.length) {
      toast.error("Nothing to export on this page.");
      return;
    }
    try {
      const parser = new Parser({
        fields: ["number", "type", "total", "status", "paid_at", "created_at"],
      });
      const csv = parser.parse(
        rows.map((r) => ({
          number: r.number,
          type: r.type,
          total: r.total,
          status: r.status,
          paid_at: r.paid_at,
          created_at: r.created_at,
        })),
      );
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8;" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "invoices.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Exported CSV");
    } catch {
      toast.error("Could not export CSV.");
    }
  };

  return (
    <div
      className="psmview"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <div className="phead phead-actions">
        <div className="ptxt">
          <h1>Invoices</h1>
          <p>Issued, paid and overdue.</p>
        </div>
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
        <PsmSortFilter
          sort={sort}
          onSortChange={setSort}
          sortOptions={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
            { value: "amount_desc", label: "Amount — highest first" },
            { value: "amount_asc", label: "Amount — lowest first" },
          ]}
          filters={[
            {
              id: "range",
              label: "Date range",
              value: range,
              onChange: setRange,
              options: [
                { value: "all", label: "All dates" },
                { value: "7", label: "Last 7 days" },
                { value: "30", label: "Last 30 days" },
                { value: "month", label: "This month" },
              ],
            },
            {
              id: "status",
              label: "Status",
              value: status,
              onChange: setStatus,
              options: [
                { value: "all", label: "All statuses" },
                { value: "paid", label: "Paid" },
                { value: "unpaid", label: "Unpaid" },
              ],
            },
          ]}
          searchActive={!!search.trim()}
          onReset={() => {
            setSort("newest");
            setRange("all");
            setStatus("all");
            setSearch("");
          }}
        />
        <button className="fexp" onClick={exportCsv}>
          <Download /> Export
        </button>
      </div>

      <div className="card" style={{ padding: "16px 8px 8px" }}>
        <div className="tblwrap">
          <table className="tbl wide">
            <thead>
              <tr>
                <th style={{ paddingLeft: 14 }}>Invoice #</th>
                <th>Type</th>
                <th className="r">Amount</th>
                <th className="r">Status</th>
                <th className="r">Paid at</th>
                <th className="r">Created on</th>
                <th className="r">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: 28 }}>
                    <Loader2
                      className="animate-spin"
                      style={{ display: "inline" }}
                    />
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: "center",
                      padding: 28,
                      color: "var(--danger)",
                    }}
                  >
                    {(error as Error)?.message ?? "Failed to load invoices."}
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((inv) => {
                  const paid = inv.status === "paid";
                  return (
                    <tr key={inv.id}>
                      <td data-label="Invoice #" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                        {invoiceNumber(inv)}
                      </td>
                      <td
                        data-label="Type"
                        style={{ textTransform: "capitalize" }}
                        className="muted"
                      >
                        {inv.type ?? "—"}
                      </td>
                      <td data-label="Amount" className="r mono" style={{ fontWeight: 700 }}>
                        {symbolFor(inv)}
                        {fmtAmount(inv.total)}
                      </td>
                      <td data-label="Status" className="r">
                        <span className={`badge ${paid ? "ok" : "pend"}`}>
                          {paid ? "Paid" : "Unpaid"}
                        </span>
                      </td>
                      <td data-label="Paid at" className="r muted">
                        {inv.paid_at
                          ? dayjs(inv.paid_at).format(DATE_FORMAT)
                          : "—"}
                      </td>
                      <td data-label="Created on" className="r muted">
                        {dayjs(inv.created_at).format(DATE_FORMAT)}
                      </td>
                      <td data-label="Invoice" className="r">
                        <button
                          className="btn ghost sm"
                          onClick={() => handleDownload(inv)}
                          disabled={downloadingId === inv.id}
                        >
                          {downloadingId === inv.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Download />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: "center",
                      padding: 28,
                      color: "var(--muted)",
                    }}
                  >
                    No invoices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: 12 }}>
          <TablePagination
            total={total}
            page={page}
            perPage={perPage}
            onPageChange={setPage}
          />
        </div>
      </div>
    </div>
  );
}
