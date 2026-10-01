"use client";

import { useT } from "@/hooks/use-t";
import { useState } from "react";
import { toast } from "sonner";

// ── DOWNLOAD A PERIOD OF INVOICES ───────────────────────────────────
//
// The owner, 27-09: "in de app voor client moet ook 1 knop zijn om
// invoices te downloaden, en dan date from to date en invoice status en
// dan export pdf", then "meerdere pdfs in 1 zip."
//
// Three fields and one button. The route behind it
// (/api/invoices/export) renders each invoice as its own PDF with the
// same code the single download uses, and zips them.
//
// It deliberately does NOT use the shared Dialog: this lives inside the
// advertiser shell, which portals nothing and carries its own .modal /
// .mback / .mcard, and a shadcn dialog here renders outside the shell
// where none of its tokens reach. That is the same trap that made the
// commission dialog's button a white slab in dark mode.

type Props = {
  /** The shell's own trigger class. */
  className?: string;
};

const STATUSES: { value: string; label: string }[] = [
  { value: "all", label: "Every status" },
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Unpaid" },
  { value: "overdue", label: "Overdue" },
  { value: "void", label: "Void" },
];

/** yyyy-mm-dd, in the reader's own clock. */
function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function InvoiceExportButton({
  className = "btn ghost sm",
}: Props) {
  const { t: tr, tx } = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // A sensible period rather than an empty form: this year so far is
  // what an accountant asks for, and it is one tap to change.
  const [from, setFrom] = useState(() => isoDay(new Date(new Date().getFullYear(), 0, 1)));
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [status, setStatus] = useState("all");

  const badRange = !!from && !!to && from > to;

  async function download() {
    if (badRange) return;
    setBusy(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      if (status !== "all") qs.set("status", status);
      const res = await fetch(`/api/invoices/export?${qs.toString()}`);

      if (!res.ok) {
        // The route answers in JSON on every refusal, and those
        // sentences are written to be read: "No invoices in that
        // period", "That is 84 invoices. Narrow the dates."
        let message = "We couldn't build that download.";
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          // A non-JSON failure keeps the general sentence.
        }
        toast.error(tr("label.invexp.notDownloaded"), { description: message });
        return;
      }

      const blob = await res.blob();
      // The filename the server chose, so the archive is named for the
      // period it holds rather than "download.zip".
      const cd = res.headers.get("Content-Disposition") ?? "";
      const named = /filename="([^"]+)"/.exec(cd)?.[1];
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = named || "invoices.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoked on the next tick: Safari cancels the download if the URL
      // dies in the same one.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setOpen(false);
    } catch (e) {
      toast.error(tr("label.invexp.notDownloaded"), {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
        title={tr("invexp.downloadAPeriodOfInvoices")}
      >
        Export
      </button>

      <div className="modal" hidden={!open} role="dialog" aria-modal="true">
        <div
          className="mback"
          onClick={() => {
            if (!busy) setOpen(false);
          }}
        />
        <div className="mcard" style={{ width: "min(420px,100%)" }}>
          <h2 style={{ marginBottom: 4 }}>{tr("label.invexp.downloadInvoices")}</h2>
          <p className="cap" style={{ marginBottom: 14 }}>
            {tr("invexp.onePdfPerInvoiceTogether")}</p>

          <div style={{ display: "flex", gap: 10 }}>
            <div className="field" style={{ flex: 1, minWidth: 0 }}>
              <label htmlFor="inv-exp-from">{tr("label.range.from")}</label>
              <input
                id="inv-exp-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 0 }}>
              <label htmlFor="inv-exp-to">{tr("label.range.to")}</label>
              <input
                id="inv-exp-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="inv-exp-status">Status</label>
            <select
              id="inv-exp-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {tx(s.label)}
                </option>
              ))}
            </select>
          </div>

          {badRange ? (
            <p className="cap" style={{ color: "var(--danger)" }}>
              {tr("invexp.theStartDateIsAfter")}</p>
          ) : null}

          <div
            style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}
          >
            <button
              className="btn"
              onClick={download}
              disabled={busy || badRange}
            >
              {busy ? tr("label.invexp.preparing") : "Download zip"}
            </button>
            <button
              className="btn ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              {tr("btn.cancel")}</button>
          </div>
          {busy ? (
            <p className="cap" style={{ marginTop: 10 }}>
              {tr("invexp.eachInvoiceIsDrawnAs")}</p>
          ) : null}
        </div>
      </div>
    </>
  );
}
