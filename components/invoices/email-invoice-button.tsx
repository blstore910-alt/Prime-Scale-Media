"use client";

// "Email" op een factuur: dezelfde factuurmail met de pdf, naar de klant.
// Zie actions/invoice-email-actions.ts.

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { emailInvoice } from "@/actions/invoice-email-actions";

export default function EmailInvoiceButton({ invoiceId, label }: { invoiceId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn ghost sm"
      disabled={busy}
      title="Email this invoice with the PDF to the customer"
      onClick={async (e) => {
        e.stopPropagation();
        if (busy || !window.confirm(`Email invoice ${label} with the PDF to the customer?`)) return;
        setBusy(true);
        try {
          const r = await emailInvoice(invoiceId);
          if (!r.ok) throw new Error(r.error);
          toast.success(`Invoice ${label} sent to ${r.data.to}`);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "The email could not be sent.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <Mail />}
      <span className="alab">Email</span>
    </button>
  );
}
