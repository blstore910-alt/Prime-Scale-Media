import { createAdminClient, createClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
// The document itself. Moved to a module so the bulk-export route can
// render the same one -- see the note at the top of that file.
import {
  buildInvoicePdf,
  getReferenceNoFromItems,
  resolveInvoiceTypeKey,
  sanitizeFileNamePart,
  type BillingRecord,
  type CompanyRecord,
  type InvoiceRecord,
} from "@/lib/invoice-pdf";
import { invoiceNumber } from "@/lib/payment-reference";

export const runtime = "nodejs";

/**
 * A refusal a person can read, when a person is looking at it.
 *
 * ──────────────────────────────────────────────────────────────────────
 * The View button is a plain `window.open` of this route with ?inline=1 —
 * deliberately, because opening the tab inside the click handler is what
 * keeps a pop-up blocker out of it. The consequence nobody followed up on
 * is that every refusal here lands in a NEW TAB as raw JSON:
 *
 *     {"error":"Invoice not found"}
 *
 * A customer who clicked View on their own invoice gets a blank white tab
 * with a line of code in it. So when the browser is going to RENDER the
 * response, send it something a browser renders.
 *
 * The JSON shape is unchanged for the download path, which parses it.
 * ──────────────────────────────────────────────────────────────────────
 */
function refuse(request: NextRequest, message: string, status: number) {
  const inline = request.nextUrl.searchParams.get("inline") === "1";
  if (!inline) {
    return NextResponse.json({ error: message }, { status });
  }
  const safe = message.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice unavailable</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:flex; align-items:center;
         justify-content:center; background:#f6f7fb; color:#101426;
         font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  @media (prefers-color-scheme: dark) { body { background:#0b0d16; color:#e8eaf2; } }
  .b { max-width:34rem; padding:2rem 1.5rem; text-align:center; }
  h1 { font-size:1.15rem; margin:0 0 .5rem; }
  p { margin:0; color:#5b6076; }
  @media (prefers-color-scheme: dark) { p { color:#9aa0b8; } }
</style></head>
<body><div class="b">
  <h1>We couldn&#39;t open that invoice</h1>
  <p>${safe}</p>
  <p style="margin-top:1rem">Close this tab and try again from your Invoices list &mdash; if it keeps happening, tell us and we&#39;ll send it to you.</p>
</div></body></html>`;
  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ invoiceId: string }> },
) {
  try {
    const supabase = await createClient();
    const cookieStore = await cookies();
    const existingProfile = cookieStore.get("profile_id")?.value;
    const { invoiceId } = await context.params;

    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      return refuse(request, "You need to be signed in to read an invoice.", 401);
    }

    const { data: profiles, error: profileError } = await supabase
      .from("user_profiles")
      // is_active and status TOO. Every other guard in the app tests
    // them — require-admin.ts:50, api-require-admin.ts:62,
    // audit-actions.ts:49 — and this one selected role alone, so a
    // DEACTIVATED admin with a live cookie could still pull any invoice
    // PDF in the tenant: company name, address, VAT number, amounts.
    .select("id, tenant_id, role, is_active, status")
      .eq("user_id", auth.user.id);

    if (profileError) throw profileError;
    if (!profiles?.length) {
      return refuse(request, "We couldn't find your account.", 403);
    }

    const activeProfile =
      profiles.find((profile) => profile.id === existingProfile) ?? profiles[0];

    // ── AND THEN ACTUALLY TEST THEM ─────────────────────────────────
    //
    // The comment above says why is_active and status were added to the
    // select. The `if` was never written, so the columns were fetched
    // and ignored and a deactivated admin with a live cookie could go
    // on pulling any invoice PDF in the tenant — company name, address,
    // VAT number, amounts. Every other boundary in the app tests this.
    if (
      activeProfile.is_active === false ||
      (activeProfile.status ?? "active") === "inactive" ||
      (activeProfile.status ?? "") === "pending_erasure"
    ) {
      return refuse(request, "This account is not active.", 403);
    }

    // Tenant match alone is NOT authorization here. Every advertiser in a
    // tenant shares that tenant_id, so filtering on it only let advertiser A
    // fetch advertiser B's invoice PDF — company name, address, VAT number
    // and amounts — with nothing but the invoice UUID, which travels in
    // forwarded links and shared browser history. A non-admin may only read
    // an invoice that belongs to one of their OWN advertiser rows.
    let invoiceQuery = supabase
      .from("invoices")
      .select(
        "*, company:companies(*), advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email)), tenant:tenants(*)",
      )
      .eq("id", invoiceId)
      .eq("tenant_id", activeProfile.tenant_id);

    if (activeProfile.role !== "admin") {
      // user_id, not profile_id: this is the exact predicate the RLS helper
      // _is_own_advertiser uses (advertisers.user_id = auth.uid()), so the
      // endpoint can never be more permissive than the database is.
      const { data: ownAdvertisers, error: advError } = await supabase
        .from("advertisers")
        .select("id")
        .eq("user_id", auth.user.id);

      if (advError) throw advError;

      const ownIds = (ownAdvertisers ?? []).map((a: { id: string }) => a.id);
      if (!ownIds.length) {
        return refuse(request, "That invoice isn't on your account.", 404);
      }
      invoiceQuery = invoiceQuery.in("advertiser_id", ownIds);
    }

    const { data: invoice, error: invoiceError } = await invoiceQuery.maybeSingle();

    if (invoiceError) throw invoiceError;
    if (!invoice) {
      return refuse(request, "That invoice isn't on your account.", 404);
    }

    // ---- AN INVOICE RAISED BEFORE ONBOARDING HAS NO BILL-TO -------
    //
    // `invoices.company_id` is set when the invoice is raised, and the
    // FIRST subscription invoice is raised the moment somebody signs
    // up -- before they have filled their company in. So it stays null,
    // and this PDF printed "N/A" where the company name and the VAT
    // number belong, for ever, on the very first document a new
    // customer files. Measured on production: 4 live invoices, among
    // them PSM0012's and PSM0013's EUR 200 subscription.
    //
    // The bill-to party is the advertiser's company either way, so when
    // the invoice does not name one, read theirs. Nothing is invented:
    // if they have no company row either, it stays N/A as before.
    if (!(invoice as InvoiceRecord).company_id && (invoice as InvoiceRecord).advertiser_id) {
      const { data: ownCompany, error: ownCompanyError } = await supabase
        .from("companies")
        .select("*")
        .eq("advertiser_id", (invoice as InvoiceRecord).advertiser_id as string)
        .maybeSingle();
      // A failed read is not "they have no company". Printing "N/A" as
      // the bill-to on a tax document because a connection dropped is
      // not a degradation, it is a wrong invoice.
      if (ownCompanyError) throw ownCompanyError;
      if (ownCompany) {
        (invoice as InvoiceRecord).company = ownCompany as CompanyRecord;
      }
    }

    // ── WHO SENT THE INVOICE, ON THE CUSTOMER'S COPY TOO ────────────
    //
    // This read ran as the CALLER. Measured 28-09, the only non-admin
    // policy on `companies` is `Allow advertisers to read their
    // companies`, whose USING clause ends `a.id = companies.advertiser_id`
    // -- and the issuer is precisely the row where advertiser_id IS
    // NULL. RLS refuses by returning NO ROWS AND NO ERROR, so for every
    // advertiser this landed on `null`, silently, and lib/invoice-pdf.ts
    // printed its hardcoded fallback issuer with no registration or VAT
    // line at all.
    //
    // So the admin pressing View and the customer pressing View on the
    // SAME invoice got two different documents, and the day the owner
    // fills in a VAT number only one of them carries it. On a tax
    // document.
    //
    // The issuer is our own name and address, printed on the PDF -- it
    // is the least secret field on the page. Read it with the service
    // client so the customer's copy is the same document as ours, and
    // say so when it cannot be read rather than quietly inventing one.
    const issuerDb = await createAdminClient();
    const { data: issuerCompany, error: issuerError } = await issuerDb
      .from("companies")
      .select(
        "name, official_email, phone, website_url, registration_no, vat_no, is_not_vat, address, state, country, zipcode",
      )
      .eq("tenant_id", activeProfile.tenant_id)
      .is("advertiser_id", null)
      .maybeSingle();
    if (issuerError) {
      // Not a fallback. A tax document that names the wrong issuer is
      // worse than one that does not arrive.
      throw issuerError;
    }
    (invoice as InvoiceRecord).issuer =
      (issuerCompany as CompanyRecord | null) ?? null;

    let billing: BillingRecord | null = null;
    if ((invoice as InvoiceRecord).company_id) {
      const { data: billingData, error: billingError } = await supabase
        .from("billings")
        .select("address, state, country, zipcode")
        .eq("company_id", (invoice as InvoiceRecord).company_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (billingError) throw billingError;
      billing = (billingData as BillingRecord | null) ?? null;
    }

    const pdfContent = await buildInvoicePdf(
      invoice as unknown as InvoiceRecord,
      billing,
    );
    const invoiceRecord = invoice as InvoiceRecord;
    const invoiceTypeKey = resolveInvoiceTypeKey(
      invoiceRecord.type,
      invoiceRecord.items,
    );
    const referenceNo =
      invoiceTypeKey === "wallet_topup"
        ? sanitizeFileNamePart(getReferenceNoFromItems(invoiceRecord.items))
        : "";
    // Same identity as the body and as the download button's own label.
    const fileNumber =
      sanitizeFileNamePart(
        invoiceNumber({
          number: invoiceRecord.number,
          advertiser: (invoiceRecord as { advertiser?: unknown })
            .advertiser as never,
        }),
      ) || String(invoiceRecord.number ?? "");
    const fileName = referenceNo
      ? `invoice-${fileNumber}-${referenceNo}.pdf`
      : `invoice-${fileNumber}.pdf`;
    const pdfBody = new ArrayBuffer(pdfContent.byteLength);
    new Uint8Array(pdfBody).set(pdfContent);

    // ?inline=1 asks the browser to RENDER the document instead of saving
    // it. Every screen that offered an invoice offered only a download, so
    // the way to read one was to put a file on your disk first — and then
    // find it again when somebody asks what it says. Same document, same
    // permission check, same filename if they do save it from the viewer.
    const inline = request.nextUrl.searchParams.get("inline") === "1";
    return new NextResponse(pdfBody, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fileName}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    // safeErrorMessage, not error.message: a Supabase error carries
    // details/hint/row, and this one is handed straight to the customer.
    console.error("invoice pdf failed:", safeErrorMessage(error));
    return refuse(
      request,
      "Something went wrong while preparing that invoice.",
      500,
    );
  }
}

