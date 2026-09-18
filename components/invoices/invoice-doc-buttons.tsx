"use client";

import { useState } from "react";
import { Download, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * View and Download, for one invoice, wherever an invoice is shown.
 *
 * Every screen in the app offered a download and nothing else, so the only
 * way to read an invoice was to put a file on your disk first — and then
 * find it again when a customer rings up asking what it says. An admin
 * checking a figure, an advertiser checking what they were charged and an
 * affiliate checking a payout all did the same thing: downloaded a PDF to
 * look at one line of it.
 *
 * View opens the same document in a tab. It is a plain window.open of a URL
 * rather than a fetch-then-blob, deliberately: opening the tab in the click
 * handler itself is what keeps a pop-up blocker out of it, and the download
 * path stays as it was because a blob is what gives the file its proper
 * name.
 *
 * Two implementations of that download had already drifted apart — one
 * naming the file from the client code, the other from the invoice number.
 * There is one now.
 */
export default function InvoiceDocButtons({
  invoiceId,
  fileLabel,
  size = "sm",
  showLabels = true,
}: {
  invoiceId: string;
  /** What the saved file should be called, without the extension. */
  fileLabel: string;
  size?: "sm" | "";
  showLabels?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pdf`);
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "We couldn't prepare that invoice.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${fileLabel}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "We couldn't prepare that invoice.",
      );
    } finally {
      setBusy(false);
    }
  };

  const cls = `btn ghost${size ? " " + size : ""}`;
  return (
    <>
      <button
        type="button"
        className={cls}
        onClick={(e) => {
          e.stopPropagation();
          window.open(
            `/api/invoices/${invoiceId}/pdf?inline=1`,
            "_blank",
            "noopener,noreferrer",
          );
        }}
        title="Open the invoice in a new tab"
      >
        <Eye />
        {showLabels ? <span className="alab">View</span> : null}
      </button>
      <button
        type="button"
        className={cls}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          void download();
        }}
        title="Save the invoice as a PDF"
      >
        {busy ? <Loader2 className="animate-spin" /> : <Download />}
        {showLabels ? <span className="alab">Download</span> : null}
      </button>
    </>
  );
}
