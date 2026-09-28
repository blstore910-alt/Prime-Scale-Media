import { applyInvoiceStatusFilter } from "@/lib/invoice-status";
import { createAdminClient } from "@/lib/supabase/server";
import JSZip from "jszip";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
import {
  buildInvoicePdf,
  resolveInvoiceTypeKey,
  sanitizeFileNamePart,
  type BillingRecord,
  type CompanyRecord,
  type InvoiceRecord,
} from "@/lib/invoice-pdf";

// ── EVERY INVOICE IN A PERIOD, AS ONE DOWNLOAD ──────────────────────
//
// The owner, 27-09: "in de app voor client moet ook 1 knop zijn om
// invoices te downloaden, en dan date from to date en invoice status en
// dan export pdf", and on being asked: "niet meerdere facturen in een
// doc, meerdere pdfs in 1 zip."
//
// Separate PDFs in one archive rather than one long document, and that
// is the better answer as well as the asked-for one: an accountant files
// invoices one per document, and a customer forwarding a single month to
// their bookkeeper should not have to split a PDF first.
//
// THE SAME DOCUMENT AS THE SINGLE DOWNLOAD. buildInvoicePdf comes from
// lib/invoice-pdf.ts, which is the code that was already drawing the
// per-invoice PDF -- moved to a module for exactly this. Two renderers
// for one document is how the two drift, and this one is what a customer
// pays from.
//
// THE SAME AUTHORISATION, TOO, and it is copied deliberately rather than
// loosened: tenant match alone is not authorisation, because every
// advertiser in a tenant shares that tenant_id. A non-admin gets only
// invoices belonging to one of their OWN advertiser rows, tested on
// `advertisers.user_id = auth.uid()` -- the exact predicate the RLS
// helper uses, so this endpoint can never be more permissive than the
// database is.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rendering is a headless browser per invoice. A customer asking for
// "everything" on a busy account should get a clear refusal rather than
// a request that dies at the gateway with no explanation.
// ── SIXTY WAS A NUMBER, NOT A MEASUREMENT ─────────────────────────
//
// buildInvoicePdf launches and closes a WHOLE headless Chromium per
// invoice. Sixty of those in one request does not finish inside any
// serverless budget, and when it is cut off the client cannot parse the
// response and shows its generic "We couldn't build that download." --
// while the only sizing advice in the file ("narrow the dates to 60 or
// fewer") is behind a check that fires above sixty, so it never reaches
// the person who needs it.
//
// Twenty, and maxDuration raised to the platform ceiling, so the refusal
// arrives as a sentence with a number in it rather than as a timeout.
const MAX_INVOICES = 20;

/** Seconds. The Vercel maximum on the current plan; the default is far lower. */
export const maxDuration = 300;

/** The statuses the picker offers. "all" is the absence of a filter. */
const STATUSES = new Set(["paid", "unpaid", "overdue", "void", "cancelled"]);

function bad(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** A date the caller typed, or null. Never a silent today. */
function parseDay(v: string | null, endOfDay: boolean): string | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
  );
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth?.user) return bad("Sign in first.", 401);

    const cookieStore = await cookies();
    const existingProfile = cookieStore.get("profile_id")?.value;

    const { data: profiles, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, role, tenant_id, is_active, status")
      .eq("user_id", auth.user.id);
    if (profileError) throw profileError;
    if (!profiles?.length) return bad("We couldn't find your account.", 403);

    const me =
      profiles.find((p) => p.id === existingProfile) ?? profiles[0];

    // Same test as the single-invoice route: a deactivated account keeps
    // a live cookie, and these carry company names, addresses, VAT
    // numbers and amounts.
    if (
      me.is_active === false ||
      (me.status ?? "active") === "inactive" ||
      (me.status ?? "") === "pending_erasure"
    ) {
      return bad("This account is not active.", 403);
    }

    const sp = request.nextUrl.searchParams;
    const from = parseDay(sp.get("from"), false);
    const to = parseDay(sp.get("to"), true);
    const statusRaw = (sp.get("status") ?? "all").toLowerCase();
    const status = statusRaw === "all" ? null : statusRaw;
    if (status && !STATUSES.has(status)) return bad("Unknown status.", 400);
    if (from && to && from > to) {
      return bad("The start date is after the end date.", 400);
    }

    let q = supabase
      .from("invoices")
      .select(
        "*, company:companies(*), advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email)), tenant:tenants(*)",
      )
      .eq("tenant_id", me.tenant_id)
      .order("created_at", { ascending: true });

    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    // NOT .eq("status", status). "overdue" and "cancelled" are words on
    // the picker, not values in the column -- measured 28-09: every live
    // row is paid, unpaid or void. So picking Overdue here refused with
    // "No invoices in that period.", stated as a fact about the
    // customer's own account, while six past-due invoices sat in the
    // database. Same derivation as the admin list, from one function.
    if (status) q = applyInvoiceStatusFilter(q, status);

    if (me.role !== "admin") {
      const { data: mine, error: advError } = await supabase
        .from("advertisers")
        .select("id")
        .eq("user_id", auth.user.id);
      if (advError) throw advError;
      const ids = (mine ?? []).map((a: { id: string }) => a.id);
      if (!ids.length) return bad("There are no invoices on your account.", 404);
      q = q.in("advertiser_id", ids);
    }

    const { data: rows, error: rowsError } = await q;
    if (rowsError) throw rowsError;

    const invoices = (rows ?? []) as InvoiceRecord[];
    if (invoices.length === 0) {
      // Not an empty zip. An archive with nothing in it is a download
      // that looks like it worked, and the customer finds out when they
      // open it.
      return bad("No invoices in that period.", 404);
    }
    if (invoices.length > MAX_INVOICES) {
      return bad(
        `That is ${invoices.length} invoices, and each one is rendered separately. Narrow the dates to ${MAX_INVOICES} or fewer and download them in batches.`,
        413,
      );
    }

    // ── THE SAME DOCUMENT AS THE BUTTON NEXT TO IT ──────────────────
    //
    // Two things were missing here that the single-invoice route does,
    // so the zip and the Download button on the same screen produced
    // DIFFERENT invoices for the same row, with nothing saying which
    // one was the real document:
    //
    //   * the issuer was never set at all, so every PDF in the archive
    //     -- the admin's too -- printed lib/invoice-pdf.ts's hardcoded
    //     fallback instead of the tenant's own name, registration and
    //     VAT number;
    //   * an invoice with no company_id got "N/A" as the bill-to,
    //     where the single route falls back to the advertiser's own
    //     company.
    //
    // Read once for the whole archive: it is one row, the same for
    // every invoice in it. Service client, for the reason written out
    // in the single-invoice route -- RLS hides this row from the
    // advertiser asking for their own invoices.
    const issuerDb = await createAdminClient();
    const { data: issuerCompany, error: issuerError } = await issuerDb
      .from("companies")
      .select(
        "name, official_email, phone, website_url, registration_no, vat_no, is_not_vat, address, state, country, zipcode",
      )
      .eq("tenant_id", me.tenant_id)
      .is("advertiser_id", null)
      .maybeSingle();
    if (issuerError) throw issuerError;

    // The advertisers whose invoice does not name a company. One read
    // for the lot rather than one per invoice.
    const missingCompanyAdvIds = Array.from(
      new Set(
        invoices
          .filter(
            (inv) =>
              !(inv as { company_id?: string | null }).company_id &&
              !!(inv as { advertiser_id?: string | null }).advertiser_id,
          )
          .map((inv) => (inv as { advertiser_id: string }).advertiser_id),
      ),
    );
    const fallbackCompanies = new Map<string, CompanyRecord>();
    if (missingCompanyAdvIds.length > 0) {
      const { data: ownCompanies, error: ownError } = await supabase
        .from("companies")
        .select("*")
        .in("advertiser_id", missingCompanyAdvIds);
      if (ownError) throw ownError;
      for (const c of (ownCompanies ?? []) as CompanyRecord[]) {
        const key = (c as { advertiser_id?: string | null }).advertiser_id;
        if (key) fallbackCompanies.set(key, c);
      }
    }

    const zip = new JSZip();
    const used = new Set<string>();

    for (const invoice of invoices) {
      (invoice as InvoiceRecord).issuer =
        (issuerCompany as CompanyRecord | null) ?? null;

      // The bill-to party, exactly as the single-invoice route resolves
      // it: the advertiser's own company, falling back to the tenant's.
      let company = (invoice as { company?: unknown })
        .company as CompanyRecord | null;
      if (!company) {
        const advId = (invoice as { advertiser_id?: string | null })
          .advertiser_id;
        const own = advId ? fallbackCompanies.get(advId) : undefined;
        if (own) {
          company = own;
          (invoice as InvoiceRecord).company = own;
        }
      }
      const billing = (company ?? null) as BillingRecord | null;

      const pdf = await buildInvoicePdf(invoice, billing);

      const typeKey =
        resolveInvoiceTypeKey(
          (invoice as { type?: string | null }).type,
          (invoice as { items?: unknown }).items as never,
        ) || "invoice";
      const number = sanitizeFileNamePart(
        String((invoice as { number?: unknown }).number ?? invoice.id),
      );
      const day = String(
        (invoice as { created_at?: string }).created_at ?? "",
      ).slice(0, 10);
      // Dated first so the archive sorts chronologically in any file
      // manager, which is how somebody reads a period of invoices.
      let name = `${day || "undated"}-${sanitizeFileNamePart(typeKey)}-${number}.pdf`;
      // Two invoices can share a number across types on this database.
      // A zip with a duplicate entry name silently keeps one of them.
      let n = 2;
      while (used.has(name)) {
        name = `${day || "undated"}-${sanitizeFileNamePart(typeKey)}-${number}-${n++}.pdf`;
      }
      used.add(name);
      zip.file(name, Buffer.from(pdf));
    }

    const blob = await zip.generateAsync({
      type: "nodebuffer",
      // The PDFs inside are already compressed; deflating them again buys
      // a percent and costs the whole archive's CPU.
      compression: "STORE",
    });

    const span =
      from && to
        ? `${from.slice(0, 10)}_${to.slice(0, 10)}`
        : from
          ? `from-${from.slice(0, 10)}`
          : to
            ? `until-${to.slice(0, 10)}`
            : "all";
    const fileName = `invoices-${span}${status ? `-${status}` : ""}.zip`;

    return new NextResponse(new Uint8Array(blob), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(blob.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("invoice export:", safeErrorMessage(e));
    return bad("We couldn't build that download.", 500);
  }
}
