import { CURRENCY_SYMBOLS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { readFile } from "fs/promises";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import path from "path";

export const runtime = "nodejs";

type InvoiceItem = {
  name?: string | null;
  quantity?: number | string | null;
  rate?: number | string | null;
  tax?: number | string | null;
  amount?: number | string | null;
  currency?: string | null;
  reference_no?: number | string | null;
  wallet_topup_reference_no?: number | string | null;
  wallet_topup_id?: string | null;
  subscription_id?: string | null;
  extra_ad_account_id?: string | null;
  start_date?: string | null;
};

type CompanyRecord = {
  name?: string | null;
  official_email?: string | null;
  phone?: string | null;
  website_url?: string | null;
  registration_no?: string | null;
  vat_no?: string | null;
  address?: string | null;
  state?: string | null;
  country?: string | null;
  zipcode?: string | null;
};

type BillingRecord = {
  address?: string | null;
  state?: string | null;
  country?: string | null;
  zipcode?: string | null;
};

type AdvertiserRecord = {
  tenant_client_code?: string | null;
  profile?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
};

type TenantRecord = {
  name?: string | null;
  address?: string | null;
  state?: string | null;
  country?: string | null;
  zipcode?: string | null;
};

type InvoiceRecord = {
  id: string;
  number: number;
  created_at: string;
  status?: string | null;
  paid_at?: string | null;
  type?: string | null;
  tenant_id: string;
  company_id: string | null;
  items: InvoiceItem[] | null;
  sub_total: number | null;
  total: number | null;
  company?: CompanyRecord | null;
  advertiser?: AdvertiserRecord | null;
  tenant?: TenantRecord | null;
};

const DEFAULT_INVOICE_LOGO_PATH =
  process.env.INVOICE_PDF_LOGO_PATH ?? "/images/psm-logo.png";

const numberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(value: number | string | null | undefined): string {
  return numberFormatter.format(toNumber(value));
}

function getCurrencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? `${code} `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function compactText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function toCompactText(value: unknown): string {
  return compactText(value == null ? "" : String(value));
}

function getReferenceNoFromItems(
  items: InvoiceItem[] | null | undefined,
): string {
  if (!Array.isArray(items)) return "";

  for (const item of items) {
    const referenceNo = toCompactText(item.reference_no);
    if (referenceNo) return referenceNo;
  }

  // Backward compatibility for older item shape.
  for (const item of items) {
    const legacyReferenceNo = toCompactText(item.wallet_topup_reference_no);
    if (legacyReferenceNo) return legacyReferenceNo;
  }

  return "";
}

function sanitizeFileNamePart(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatAddressLines(parts: Array<string | null | undefined>): string[] {
  const compact = parts.map((part) => compactText(part)).filter(Boolean);
  return compact.length ? compact : ["N/A"];
}

function formatIsoDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMoney(
  value: number | string | null | undefined,
  currencySymbol: string,
): string {
  return `${currencySymbol}${formatAmount(value)}`;
}

function formatTaxPercentage(value: number): string {
  const normalized = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `${normalized}%`;
}

function formatLabel(value: string | null | undefined): string {
  const compact = compactText(value);
  if (!compact) return "";

  return compact
    .split("_")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function resolveInvoiceTypeKey(
  invoiceType: string | null | undefined,
  items: InvoiceItem[] | null | undefined,
): string {
  const typeFromInvoice = compactText(invoiceType).toLowerCase();
  if (typeFromInvoice) return typeFromInvoice;
  if (!Array.isArray(items)) return "";

  for (const item of items) {
    const typeFromItem = compactText(item.name).toLowerCase();
    if (typeFromItem) return typeFromItem;
  }

  return "";
}

function getMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".webp") return "image/webp";
  return "application/octet-stream";
}

async function loadPublicImageDataUri(
  relativePath: string,
): Promise<string | null> {
  const sanitizedPath = relativePath.replace(/^[/\\]+/, "");
  const absolutePath = path.join(process.cwd(), "public", sanitizedPath);

  try {
    const fileBuffer = await readFile(absolutePath);
    const mimeType = getMimeType(absolutePath);
    return `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function buildInvoiceHtml(
  invoice: InvoiceRecord,
  billing: BillingRecord | null,
  logoDataUri: string | null,
): string {
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const currencyCode = items[0]?.currency ?? "USD";
  const currencySymbol = getCurrencySymbol(currencyCode);

  const computedSubTotal = items.reduce((sum, item) => {
    const itemAmount = toNumber(item.amount);
    if (itemAmount > 0) return sum + itemAmount;
    return sum + toNumber(item.quantity) * toNumber(item.rate);
  }, 0);

  const computedTax = items.reduce((sum, item) => sum + toNumber(item.tax), 0);
  const subTotal = toNumber(invoice.sub_total ?? computedSubTotal);
  const total = toNumber(invoice.total ?? subTotal + computedTax);

  const company = invoice.company;
  const advertiser = invoice.advertiser;
  const tenant = invoice.tenant;
  const tenantName =
    compactText(tenant?.name ?? advertiser?.profile?.full_name) || "N/A";
  const companyName = compactText(company?.name) || "N/A";
  const issuerName = process.env.INVOICE_ISSUER_NAME ?? "TURLIT LLC";
  const issuerAddressLines = [
    "30 N Gould St,",
    "STE R Sheridan Wyoming",
    "US WY 82801",
  ];
  const createdAt = formatIsoDate(invoice.created_at);
  const invoiceTypeKey = resolveInvoiceTypeKey(invoice.type, items);
  const invoiceType = formatLabel(invoiceTypeKey) || "N/A";
  const vatNo = compactText(company?.vat_no) || "N/A";
  const invoiceNumber = String(invoice.number).padStart(6, "0");
  const isWalletTopupInvoice = invoiceTypeKey === "wallet_topup";
  const referenceNo = isWalletTopupInvoice
    ? getReferenceNoFromItems(items)
    : "";
  const invoiceReferenceHtml = isWalletTopupInvoice
    ? `<div class="invoice-reference">Ref: ${escapeHtml(referenceNo || "N/A")}</div>`
    : "";
  const normalizedStatus = compactText(invoice.status).toLowerCase();
  const isPaid = normalizedStatus === "paid";
  const statusText = formatLabel(normalizedStatus) || "Unpaid";
  const statusClass = isPaid ? "paid" : "unpaid";
  const paidAt =
    isPaid && invoice.paid_at ? formatIsoDate(invoice.paid_at) : "";
  const settlementLabel = isPaid ? "Amount Paid" : "Amount Due";
  const paymentDateHtml =
    paidAt && paidAt !== "N/A"
      ? `<div class="invoice-date">Payment Date: ${escapeHtml(paidAt)}</div>`
      : "";

  const companyAddressLines = formatAddressLines([
    company?.address,
    [company?.state, company?.country, company?.zipcode]
      .filter(Boolean)
      .join(", "),
  ]);

  const billingLines = formatAddressLines([
    billing?.address,
    [billing?.state, billing?.country, billing?.zipcode]
      .filter(Boolean)
      .join(", "),
  ]);

  const tenantAddressLines = formatAddressLines([
    tenant?.address,
    [tenant?.state, tenant?.country, tenant?.zipcode]
      .filter(Boolean)
      .join(", "),
  ]);

  const hasRealAddress = (lines: string[]) =>
    lines.length > 0 && !(lines.length === 1 && lines[0] === "N/A");

  const resolvedBillToLines = hasRealAddress(companyAddressLines)
    ? companyAddressLines
    : hasRealAddress(billingLines)
      ? billingLines
      : tenantAddressLines;

  const billToName = companyName !== "N/A" ? companyName : tenantName;
  const lineItems = items.map((item, index) => {
    const quantity = toNumber(item.quantity);
    const rate = toNumber(item.rate);
    const tax = toNumber(item.tax);
    const amount =
      toNumber(item.amount) > 0 ? toNumber(item.amount) : quantity * rate + tax;
    const itemType = compactText(item.name).toLowerCase() || invoiceTypeKey;
    const baseDescription =
      formatLabel(item.name ?? invoiceTypeKey) || "Line item";
    const itemDetails: string[] = [];

    if (itemType === "wallet_topup") {
      const topupReference = toCompactText(
        item.reference_no ?? item.wallet_topup_reference_no,
      );
      if (topupReference) {
        itemDetails.push(`Ref: ${topupReference}`);
      }
    }

    const description = itemDetails.length
      ? `${baseDescription} (${itemDetails.join(" | ")})`
      : baseDescription;

    return {
      index: index + 1,
      description,
      quantity,
      rate,
      tax,
      amount,
    };
  });

  if (!lineItems.length) {
    lineItems.push({
      index: 1,
      description: "No line items found",
      quantity: 0,
      rate: 0,
      tax: 0,
      amount: 0,
    });
  }

  const renderLines = (lines: string[]) =>
    lines.map((line) => `<div class="line">${escapeHtml(line)}</div>`).join("");

  const logoHtml = logoDataUri
    ? `<img class="logo" src="${logoDataUri}" alt="Company logo" />`
    : `<div class="logo-placeholder"></div>`;

  const itemRowsHtml = lineItems
    .map(
      (row) => `
        <tr>
          <td class="center">${row.index}</td>
          <td class="item-name capitalize">${escapeHtml(row.description)}</td>
          <td class="num">${formatAmount(row.quantity)}</td>
          <td class="num">${formatAmount(row.rate)}</td>
          <td class="num">${escapeHtml(formatTaxPercentage(row.tax))}</td>
          <td class="num">${formatAmount(row.amount)}</td>
        </tr>
      `,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Invoice #${escapeHtml(invoiceNumber)}</title>
    <style>
      @page {
        size: A4;
        margin: 0;
      }
      * {
        box-sizing: border-box;
      }
      html {
        width: 210mm;
        height: 297mm;
      }
      body {
        margin: 0;
        padding: 0;
        width: 210mm;
        min-height: 297mm;
        background: #ffffff;
        color: #111111;
        font-family: Arial, Helvetica, sans-serif;
      }
      .invoice {
        width: 210mm;
        min-height: 297mm;
        padding: 12mm;
        background: #ffffff;
      }
      .top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }
      .logo {
        width: 80px;
        height: 80px;
        object-fit: contain;
      }
      .logo-placeholder {
        width: 46px;
        height: 46px;
      }
      .invoice-meta {
        text-align: right;
      }
      .invoice-title {
        margin: 0;
        font-size: 22px;
        font-weight: 700;
        letter-spacing: 0.2px;
      }
      .invoice-number {
        margin-top: 4px;
        font-size: 14px;
      }
      .invoice-status {
        margin-top: 2px;
        font-size: 13px;
      }
      .invoice-reference {
        margin-top: 2px;
        font-size: 12px;
      }
      .invoice-type {
        margin-top: 2px;
        font-size: 12px;
      }
      .invoice-status.unpaid {
        color: #dc2626;
      }
      .invoice-status.paid {
        color: #15803d;
      }
      .parties {
        margin-top: 28px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 24px;
      }
      .from,
      .bill-to {
        width: 48%;
      }
      .bill-to {
        text-align: right;
      }
      .party-heading {
        margin: 0 0 8px;
        font-size: 10px;
        font-weight: 700;
      }
      .party-name {
        margin: 0 0 3px;
        font-size: 12px;
        font-weight: 700;
      }
      .line {
        margin: 1px 0 0;
        font-size: 11px;
        color: #333333;
        line-height: 1.35;
      }
      .invoice-date {
        margin-top: 10px;
        font-size: 11px;
      }
      .items {
        margin-top: 24px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      thead tr {
        background: #36414f;
        color: #f8fafc;
      }
      th {
        padding: 8px 10px;
        text-align: left;
        font-size: 11px;
        font-weight: 500;
      }
      td {
        padding: 9px 10px;
        border-bottom: 1px solid #d3d3d3;
        font-size: 10.5px;
      }
      td.center {
        text-align: center;
        width: 36px;
      }
      .num {
        text-align: right;
      }
      .item-name {
        font-weight: 700;
      }
      .summary {
        margin-top: 26px;
        margin-left: auto;
        width: 40%;
      }
      .summary-line {
        display: flex;
        justify-content: space-between;
        padding: 6px 10px;
        font-size: 11px;
      }
      .summary-line span:first-child {
        font-weight: 700;
      }
      .summary-line.shaded {
        background: #f3f4f6;
      }
      .summary-line.strong {
        font-weight: 700;
      }
      .signature {
        margin-top: 58px;
        font-size: 11px;
      }
      .capitalize {
        text-transform: capitalize;
      }
    </style>
  </head>
  <body>
    <main class="invoice">
      <section class="top">
        <div>${logoHtml}</div>
        <div class="invoice-meta">
          <h1 class="invoice-title">INVOICE</h1>
          <div class="invoice-number"># ${escapeHtml(invoiceNumber)}</div>
          <div class="invoice-type">Type: ${escapeHtml(invoiceType)}</div>
          ${invoiceReferenceHtml}
          <div class="invoice-status ${statusClass}">${escapeHtml(statusText)}</div>
        </div>
      </section>

      <section class="parties">
        <div class="from">
          <p class="party-name">${escapeHtml(issuerName)}</p>
          ${renderLines(issuerAddressLines)}
        </div>
         <div class="bill-to">
         <p class="party-heading">Bill To</p>
         <p class="party-name">${escapeHtml(billToName)}</p>
          ${renderLines(resolvedBillToLines)}
          <div class="line">VAT Number: ${escapeHtml(vatNo)}</div>

         <div class="invoice-date">Invoice Date: ${escapeHtml(createdAt)}</div>
         ${paymentDateHtml}
        </div>
      </section>

      <section class="items">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th class="num">Qty</th>
              <th class="num">Rate</th>
              <th class="num">Tax</th>
              <th class="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemRowsHtml}
          </tbody>
        </table>
      </section>

      <section class="summary">
        <div class="summary-line">
          <span>Sub Total</span>
          <span>${escapeHtml(formatMoney(subTotal, currencySymbol))}</span>
        </div>
        <div class="summary-line shaded">
          <span>Total</span>
          <span>${escapeHtml(formatMoney(total, currencySymbol))}</span>
        </div>
        <div class="summary-line shaded strong">
          <span>${escapeHtml(settlementLabel)}</span>
          <span>${escapeHtml(formatMoney(total, currencySymbol))}</span>
        </div>
      </section>

      <section class="signature">Authorized Signature ______________________</section>
    </main>
  </body>
</html>`;
}

async function buildInvoicePdf(
  invoice: InvoiceRecord,
  billing: BillingRecord | null,
): Promise<Uint8Array> {
  const logoDataUri = await loadPublicImageDataUri(DEFAULT_INVOICE_LOGO_PATH);
  const html = buildInvoiceHtml(invoice, billing, logoDataUri);

  type PdfPage = {
    setContent: (
      content: string,
      options: { waitUntil: "load" },
    ) => Promise<void>;
    pdf: (options: {
      format: "A4";
      printBackground: boolean;
      preferCSSPageSize: boolean;
    }) => Promise<Uint8Array>;
  };

  type PdfBrowser = {
    newPage: () => Promise<PdfPage>;
    close: () => Promise<void>;
  };

  let browser: PdfBrowser | null = null;

  try {
    const useServerlessChromium =
      process.env.NODE_ENV === "production" && process.platform === "linux";

    if (useServerlessChromium) {
      const puppeteerCoreImport = await import("puppeteer-core");
      const chromiumImport = await import("@sparticuz/chromium");
      const puppeteerCore = puppeteerCoreImport.default ?? puppeteerCoreImport;
      const chromium = chromiumImport.default ?? chromiumImport;
      const executablePath =
        process.env.PUPPETEER_EXECUTABLE_PATH ??
        (await chromium.executablePath());

      browser = await puppeteerCore.launch({
        executablePath,
        headless: "shell",
        args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
      });
    } else {
      const puppeteerImport = await import("puppeteer");
      const puppeteer = puppeteerImport.default ?? puppeteerImport;

      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });

    return pdf;
  } finally {
    await browser?.close();
  }
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ invoiceId: string }> },
) {
  try {
    const supabase = await createClient();
    const cookieStore = await cookies();
    const existingProfile = cookieStore.get("profile_id")?.value;
    const { invoiceId } = await context.params;

    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profiles, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, tenant_id")
      .eq("user_id", auth.user.id);

    if (profileError) throw profileError;
    if (!profiles?.length) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }

    const activeProfile =
      profiles.find((profile) => profile.id === existingProfile) ?? profiles[0];

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(
        "*, company:companies(*), advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email)), tenant:tenants(*)",
      )
      .eq("id", invoiceId)
      .eq("tenant_id", activeProfile.tenant_id)
      .maybeSingle();

    if (invoiceError) throw invoiceError;
    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found for this tenant" },
        { status: 404 },
      );
    }

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
    const fileName = referenceNo
      ? `invoice-${invoiceRecord.number}-${referenceNo}.pdf`
      : `invoice-${invoiceRecord.number}.pdf`;
    const pdfBody = new ArrayBuffer(pdfContent.byteLength);
    new Uint8Array(pdfBody).set(pdfContent);

    return new NextResponse(pdfBody, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate invoice PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
