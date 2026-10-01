// ── EEN FACTUUR ALS PDF, OP ID ──────────────────────────────────────
//
// De eigenaar, 01-10: "invoice ontvangen maar moet ook als bestand in
// de mail komen, pdf". De factuurmail (lib/billing-emails.ts) hangt hem
// eraan. Dezelfde stappen als de nachtelijke Drive-upload
// (lib/invoice-drive-run.ts) en de download: de uitgever van de tenant,
// en zonder bedrijf op de factuur het bedrijf van de klant zelf.
//
// Service-sleutel: alleen server.

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildInvoicePdf, type BillingRecord, type CompanyRecord, type InvoiceRecord } from "@/lib/invoice-pdf";
import { tenantIssuerCompany } from "@/lib/tenant-issuer";
import { invoiceFileName } from "@/lib/pure-backup";

export async function invoicePdfFor(
  db: SupabaseClient,
  invoiceId: string,
): Promise<{ filename: string; content: Buffer }> {
  const { data, error } = await db
    .from("invoices")
    .select("*, company:companies(*), advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email)), tenant:tenants(*)")
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("invoice not found");
  const inv = data as InvoiceRecord & {
    id: string;
    tenant_id: string;
    advertiser_id: string | null;
    number: string | number | null;
    company?: CompanyRecord | null;
    advertiser?: { tenant_client_code?: string | null } | null;
  };

  const r = await tenantIssuerCompany(
    db,
    inv.tenant_id,
    "name, official_email, phone, website_url, registration_no, vat_no, is_not_vat, address, state, country, zipcode",
  );
  if (!r.ok) throw new Error(r.error ?? "issuer unreadable");
  inv.issuer = (r.issuer as CompanyRecord | null) ?? null;

  let company = inv.company ?? null;
  if (!company && inv.advertiser_id) {
    const { data: own } = await db.from("companies").select("*").eq("advertiser_id", inv.advertiser_id).limit(1);
    company = ((own ?? [])[0] as CompanyRecord | undefined) ?? null;
    inv.company = company;
  }

  const pdf = await buildInvoicePdf(inv, (company ?? null) as BillingRecord | null);
  return {
    filename: invoiceFileName(inv.number, inv.advertiser?.tenant_client_code ?? null, inv.id),
    content: Buffer.from(pdf),
  };
}
