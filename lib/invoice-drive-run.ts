// ── ELKE BETAALDE FACTUUR ALS PDF OP DRIVE, PER MAAND ──────────────
//
// De eigenaar, 01-10: "Backup paid invoices via drive -- alle paid
// invoices moeten in een maand map bijv jan > feb > mrt".
//
//   <GOOGLE_DRIVE_FOLDER_ID>/Facturen/2026/10 Oktober/0020-145 PSM0020.pdf
//
// De maand is die van de BETALING (paid_at), in Amsterdamse tijd: de
// boekhouder zoekt een factuur in de maand waarin het geld binnenkwam.
//
// ── EEN KEER, EN NIET OPNIEUW ────────────────────────────────────
//
// invoices.drive_file_id bestaat al op productie (en stond leeg). Een
// factuur met een id is klaar en wordt overgeslagen. Mislukt de upload,
// dan blijft de kolom leeg en probeert de volgende nacht het opnieuw.
// Staat het bestand er al (een eerdere run die net voor het bijwerken
// stopte), dan wordt dat bestaande id gebruikt in plaats van een tweede
// kopie.
//
// Een pdf maken start een headless Chrome en duurt een paar seconden.
// De eerste nacht moet de achterstand weg; daarom een tijdsbudget per
// run in plaats van een vast aantal, en de rest de nacht erna.

import type { SupabaseClient } from "@supabase/supabase-js";
import { Drive, driveConfig } from "@/lib/google-drive";
import { buildInvoicePdf, type BillingRecord, type CompanyRecord, type InvoiceRecord } from "@/lib/invoice-pdf";
import { tenantIssuerCompany } from "@/lib/tenant-issuer";
import { invoiceFileName, invoiceFolderPath } from "@/lib/pure-backup";
import { safeErrorMessage } from "@/lib/pure-error";

const BUDGET_MS = 230_000;

export type InvoiceDriveResult = {
  ok: boolean;
  skipped?: string;
  uploaded: number;
  reused: number;
  failed: { id: string; error: string }[];
  left: number;
};

export async function runInvoiceDrive(db: SupabaseClient): Promise<InvoiceDriveResult> {
  const start = Date.now();
  const cfg = driveConfig();
  if (!cfg.ok) return { ok: true, skipped: cfg.why, uploaded: 0, reused: 0, failed: [], left: 0 };

  const { data: rows, error } = await db
    .from("invoices")
    .select(
      "*, company:companies(*), advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email)), tenant:tenants(*)",
    )
    .eq("status", "paid")
    .is("drive_file_id", null)
    .order("paid_at", { ascending: true, nullsFirst: true })
    .limit(200);
  if (error) throw new Error(error.message);
  const invoices = (rows ?? []) as (InvoiceRecord & {
    id: string;
    tenant_id: string;
    advertiser_id: string | null;
    company_id: string | null;
    number: string | number | null;
    paid_at: string | null;
    created_at: string;
    advertiser?: { tenant_client_code?: string | null } | null;
  })[];
  const res: InvoiceDriveResult = { ok: true, uploaded: 0, reused: 0, failed: [], left: 0 };
  if (!invoices.length) return res;

  const drive = await Drive.connect();
  const issuers = new Map<string, CompanyRecord | null>();
  const mapIds = new Map<string, string>();

  for (let i = 0; i < invoices.length; i++) {
    if (Date.now() - start > BUDGET_MS) {
      res.left = invoices.length - i;
      break;
    }
    const inv = invoices[i];
    try {
      if (!issuers.has(inv.tenant_id)) {
        const r = await tenantIssuerCompany(
          db,
          inv.tenant_id,
          "name, official_email, phone, website_url, registration_no, vat_no, is_not_vat, address, state, country, zipcode",
        );
        if (!r.ok) throw new Error(r.error ?? "uitgever niet te lezen");
        issuers.set(inv.tenant_id, (r.issuer as CompanyRecord | null) ?? null);
      }
      inv.issuer = issuers.get(inv.tenant_id) ?? null;

      // Dezelfde terugval als de download: een factuur zonder bedrijf
      // pakt het bedrijf van de klant zelf.
      let company = (inv as { company?: CompanyRecord | null }).company ?? null;
      if (!company && inv.advertiser_id) {
        const { data: own } = await db.from("companies").select("*").eq("advertiser_id", inv.advertiser_id).limit(1);
        company = ((own ?? [])[0] as CompanyRecord | undefined) ?? null;
        (inv as { company?: CompanyRecord | null }).company = company;
      }

      const betaald = new Date(inv.paid_at ?? inv.created_at);
      const pad = invoiceFolderPath(betaald);
      const sleutel = pad.join("/");
      if (!mapIds.has(sleutel)) mapIds.set(sleutel, await drive.path(pad, cfg.folderId));
      const map = mapIds.get(sleutel)!;
      const naam = invoiceFileName(inv.number, inv.advertiser?.tenant_client_code ?? null, inv.id);

      let fileId = await drive.findFile(naam, map);
      if (fileId) res.reused++;
      else {
        const pdf = await buildInvoicePdf(inv, (company ?? null) as BillingRecord | null);
        fileId = (await drive.upload(naam, "application/pdf", pdf, map)).id;
        res.uploaded++;
      }

      const { error: upErr } = await db
        .from("invoices")
        .update({ drive_file_id: fileId, drive_uploaded_at: new Date().toISOString() })
        .eq("id", inv.id)
        .is("drive_file_id", null);
      if (upErr) throw new Error(upErr.message);
    } catch (e) {
      res.failed.push({ id: inv.id, error: safeErrorMessage(e) });
    }
  }
  res.ok = res.failed.length === 0;
  return res;
}
