import { createInvoiceAsAdmin } from "@/actions/invoice-actions";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export type CreateInvoiceInput = {
  advertiser_id: string;
  currency: "EUR" | "USD";
  amount: number;
  description?: string;
  /** ISO date. Omitted means the default below. */
  due_date?: string;
};

/**
 * Fourteen days, which is what the subscription engine uses for its own
 * first invoice. A hand-raised invoice with no due date never shows
 * under Overdue and is never chased, so "no date" is not an option --
 * only "which date".
 */
export const DEFAULT_MANUAL_INVOICE_DAYS = 14;

/**
 * A date picker hands back "2026-10-12", which as a timestamptz is
 * MIDNIGHT — so the invoice would count as overdue from the first
 * second of the day it is due. The customer has that whole day.
 */
export function endOfDueDay(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    23,
    59,
    59,
    0,
  );
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

export function defaultDueDate(from: Date = new Date()): string {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + DEFAULT_MANUAL_INVOICE_DAYS);
  return d.toISOString();
}

export default function useCreateInvoice() {
  const { profile } = useAppContext();
  const queryClient = useQueryClient();

  const mutation = useMutation<{ id: string }, Error, CreateInvoiceInput>({
    mutationKey: ["create-invoice", profile?.tenant_id],
    mutationFn: async (values) => {
      const supabase = createClient();
      // ── A MISSING COMPANY IS NOT A REASON TO REFUSE ────────────
      //
      // This threw "Company not found for selected advertiser." and
      // stopped there. createInvoiceAsAdmin treats company_id as
      // OPTIONAL, and the PDF route already falls back to the
      // advertiser's own company and then to "N/A". So the rule was
      // invented here and enforced nowhere else.
      //
      // Measured 28-09: five of eighteen advertisers have no `companies`
      // row -- PSM0008, 0009, 0010, 0014, 0015. Better than a quarter of
      // the book could not be sent a one-off invoice at all, with no
      // link to fix it and no way forward in the dialog.
      //
      // `limit(1)` rather than maybeSingle(): two company rows on one
      // advertiser made maybeSingle() throw, which is the same dead end
      // by a different route.
      const { data: companies, error: companyError } = await supabase
        .from("companies")
        .select("id")
        .eq("advertiser_id", values.advertiser_id)
        .order("created_at", { ascending: true })
        .limit(1);
      // A failed read is not "they have no company" -- attaching the
      // wrong bill-to on a tax document is worse than asking again.
      if (companyError) throw companyError;
      const companyId = (companies ?? [])[0]?.id ?? null;

      // Rounded HERE, once, so the total and the line item are the same
      // number. `invoices.total` is numeric(14,2) and Postgres rounds on
      // the way in; `items[0].rate` is jsonb and does not -- so 100.005
      // stored a total of 100.01 beside a line of 100.005, and the PDF
      // printed a subtotal that did not add up to its own total.
      const amount = Math.round(Number(values.amount) * 100) / 100;
      const description =
        values.description?.trim() || "Additional Advertising Access";
      const result = await createInvoiceAsAdmin({
        ...(companyId ? { company_id: companyId } : {}),
        advertiser_id: values.advertiser_id,
        total: amount,
        type: "manual_invoice",
        currency: values.currency,
        // ── AND GIVE IT A DUE DATE ─────────────────────────────────
        //
        // `due_date` is in INVOICE_INSERT_ALLOWED precisely because
        // "without this, aged debt is invisible" -- and the only caller
        // in the app never sent one. The Overdue filter requires a due
        // date, so a hand-raised invoice could never appear under it
        // however old it got, and the auto-debit only takes invoices
        // carrying a subscription_id, which this cannot set. A EUR 2,000
        // one-off sat under Unpaid for ever with nothing chasing it.
        due_date: endOfDueDay(values.due_date) ?? defaultDueDate(),
        items: [
          {
            tax: 0,
            name: description,
            rate: amount,
            amount,
            currency: values.currency,
            quantity: 1,
          },
        ],
      });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["invoices", profile?.tenant_id],
      });
    },
  });

  return {
    ...mutation,
    createInvoice: mutation.mutate,
  };
}
