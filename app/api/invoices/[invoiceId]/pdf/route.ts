import { CURRENCY_SYMBOLS } from "@/lib/constants";
import {
  formatPaymentReference,
  invoiceNumber,
} from "@/lib/payment-reference";
import { createClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
import { invoiceStatusView } from "@/lib/invoice-status";
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
  is_not_vat?: boolean | null;
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
  /** The invoice's own currency. This is what the payment RPC charges in. */
  currency?: string | null;
  tenant_id: string;
  company_id: string | null;
  advertiser_id?: string | null;
  items: InvoiceItem[] | null;
  sub_total: number | null;
  total: number | null;
  /** Optional on purpose: the live schema is hand-authored, so a column
   *  a migration has not added yet arrives as undefined and the line it
   *  feeds is simply omitted. Both come from the select("*") above. */
  due_date?: string | null;
  period_start?: string | null;
  company?: CompanyRecord | null;
  advertiser?: AdvertiserRecord | null;
  tenant?: TenantRecord | null;
  // Issuer party: the tenant's own company row (advertiser_id IS NULL)
  // that the admin fills in on /settings/general. Falls back to the
  // hardcoded TURLIT block when NULL so old tenants keep rendering.
  issuer?: CompanyRecord | null;
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
  // invoices.currency FIRST, and EUR as the last resort — because that is
  // what actually takes the money: invoice_pay_from_wallet charges
  // `upper(coalesce(v_inv.currency,'EUR'))`. This read items[0].currency
  // and fell back to "USD", so on an invoice with no items — a real shape,
  // since invoices are hand-authored on this database — the PDF printed
  // "$200.00 due" while the RPC debited €200 from the EUR wallet. The
  // customer wires $200 (about €172) and is €28 short, or overpays by €33
  // the other way round, on the one document they actually pay from.
  // ...and NOT items[0] either, for the same reason: the RPC reads
  // `upper(coalesce(v_inv.currency,'EUR'))` and nothing else. Reordering
  // the terms fixed the no-items case and left this one, where a line
  // item saying USD over a NULL column still printed dollars on a
  // document the customer pays from in euros.
  // Trimmed and uppercased, like the shared helper. A stored lowercase
  // "usd" printed "usd 2,000.00" on the document -- which is the exact
  // failure lib/pure-invoice-currency's own docblock describes.
  const currencyCode =
    String(invoice.currency ?? "").trim().toUpperCase() || "EUR";
  const currencySymbol = getCurrencySymbol(currencyCode);

  const computedTax = items.reduce((sum, item) => sum + toNumber(item.tax), 0);

  // ── ONE DEFINITION OF "NET", USED EVERYWHERE ──────────────────────
  //
  // item.amount was read as NET here and rendered as GROSS in the line
  // table (quantity * rate + tax), so an item {qty 1, rate 100, tax 21,
  // amount 121} printed Amount 121.00 above a Sub Total of 121.00 and a
  // Total of 142.00 -- twenty-one euros of tax charged twice on a
  // hundred-and-twenty-one euro invoice, on a document somebody pays
  // from. Net is quantity * rate; amount is net + tax; the two are
  // never mixed again.
  // ── AN ITEM THAT CARRIES ONLY AN AMOUNT ───────────────────────────
  //
  // Everything the repo writes sets quantity and rate. But
  // create_invoice_for_wallet_topup lives only on the live database --
  // supabase/checks/TOON-WALLETFACTUUR.sql says so, and this file has
  // dedicated wallet_topup item handling below -- so an item shaped
  // {name, amount, tax} with no quantity is reachable and cannot be
  // read from this repo.
  //
  // Summing quantity * rate alone would score that item as zero, and
  // the subtotal would contradict a total the row below it prints from
  // `amount`. So: net is quantity * rate where those exist, and
  // amount - tax where they do not. One definition either way, and the
  // table adds up in both shapes.
  const itemNet = (item: InvoiceItem) => {
    const q = toNumber(item.quantity);
    const r = toNumber(item.rate);
    if (q > 0 && r > 0) return q * r;
    const gross = toNumber(item.amount);
    if (gross > 0) return Math.max(gross - toNumber(item.tax), 0);
    return q * r;
  };

  const computedSubTotal = items.reduce((sum, item) => sum + itemNet(item), 0);

  // ── A TOTAL THAT ITS OWN LINES DO NOT ADD UP TO ───────────────────
  //
  // subTotal fell back to the sum of `items`, and an invoice with no
  // items is a real shape here -- nothing in the repo writes sub_total,
  // and rows are hand-authored. So a EUR 200 invoice printed a line
  // reading "No line items found ... 0.00", "Sub Total EUR 0.00" and
  // "Total EUR 200.00". A document that states its own subtotal as zero
  // and then asks for 200 is not bookable, and it is the customer's
  // accountant who has to make sense of it.
  //
  // invoices.total is what invoice_pay_from_wallet actually charges, so
  // it is the authority. When there are no lines to add up, the subtotal
  // IS the total less whatever tax we know about -- which is the true
  // statement -- rather than a zero contradicting the line below it.
  const storedTotal =
    invoice.total === null || invoice.total === undefined
      ? null
      : toNumber(invoice.total);
  const hasLines = items.length > 0;
  const total =
    storedTotal ?? (hasLines ? computedSubTotal + computedTax : 0);
  const subTotal =
    invoice.sub_total !== null && invoice.sub_total !== undefined
      ? toNumber(invoice.sub_total)
      : hasLines
        ? computedSubTotal
        : Math.max(total - computedTax, 0);

  const company = invoice.company;
  const advertiser = invoice.advertiser;
  const issuer = invoice.issuer;
  const companyName = compactText(company?.name) || "N/A";
  // Prefer the tenant-level company the admin filled in on
  // /settings/general (name + full address + registration/VAT). Fall
  // back to env-var / hardcoded TURLIT block so tenants that have not
  // filled it in yet still get a rendered PDF.
  const issuerName =
    compactText(issuer?.name) ||
    process.env.INVOICE_ISSUER_NAME ||
    "TURLIT LLC";
  const issuerAddressLines = issuer?.address
    ? formatAddressLines([
        issuer.address,
        [issuer.state, issuer.country, issuer.zipcode]
          .filter(Boolean)
          .join(", "),
      ])
    : ["30 N Gould St,", "STE R Sheridan Wyoming", "US WY 82801"];
  const createdAt = formatIsoDate(invoice.created_at);

  const invoiceTypeKey = resolveInvoiceTypeKey(invoice.type, items);
  const invoiceType = formatLabel(invoiceTypeKey) || "N/A";
  const vatNo = compactText(company?.vat_no) || "N/A";
  // ── THE SAME NUMBER THE SCREEN AND THE FILENAME USE ───────────────
  //
  // ROUTE_MAP opens by saying the client-code-prefixed number was fixed
  // in a dead file and "the live screen kept contradicting the PDF
  // filename beside it". The screens were then fixed; the PDF BODY was
  // not. So the customer quotes 000005-4839 -- which is also the shape
  // of their bank reference -- and the document they are holding says
  // 004839. Four identities for one invoice.
  const invoiceAdvertiser = Array.isArray(invoice.advertiser)
    ? invoice.advertiser[0]
    : invoice.advertiser;
  const invoiceNumber =
    formatPaymentReference(
      invoiceAdvertiser?.tenant_client_code,
      invoice.number,
    ) || String(invoice.number ?? "").padStart(6, "0");
  const isWalletTopupInvoice = invoiceTypeKey === "wallet_topup";
  const referenceNo = isWalletTopupInvoice
    ? getReferenceNoFromItems(items)
    : "";
  const invoiceReferenceHtml = isWalletTopupInvoice
    ? `<div class="invoice-reference">Ref: ${escapeHtml(referenceNo || "N/A")}</div>`
    : "";
  const normalizedStatus = compactText(invoice.status).toLowerCase();
  const isPaid = normalizedStatus === "paid";
  // ── AND THE WORD ITSELF, NOT JUST THE COLOUR ──────────────────────
  //
  // The previous pass fixed the PILL COLOUR and the "Nothing Due" line
  // and left the word alone: formatLabel("void") prints "Void", while
  // lib/invoice-status.ts prints "Cancelled" to a customer on every
  // screen in the app. So the document they keep disagreed with the
  // screen they read it from, using a word most people would have to
  // look up.
  //
  // customer: true because a PDF invoice IS the customer's copy,
  // whoever pressed Download. One helper, so the two cannot drift
  // apart again.
  const statusText =
    invoiceStatusView(normalizedStatus, {
      customer: true,
      dueDate: invoice.due_date ?? null,
    }).label || "Due";
  // ── A VOID INVOICE IS NOT A DEBT ────────────────────────────────────
  //
  // `isPaid ? "paid" : "unpaid"` printed "Void" in the red unpaid style
  // on a document a customer keeps, so a cancelled invoice read as money
  // owed. lib/invoice-status.ts exists for exactly this distinction and
  // both screens use it; the PDF did not. Void and refunded are settled
  // in the sense that matters here: nothing is owed.
  const isSettled =
    isPaid || normalizedStatus === "void" || normalizedStatus === "refunded";
  const statusClass = isSettled ? "paid" : "unpaid";
  const paidAt =
    isPaid && invoice.paid_at ? formatIsoDate(invoice.paid_at) : "";
  // isSettled already knows that void and refunded owe nothing; this
  // line did not, so a cancelled EUR 200 invoice printed a green
  // "Void" pill directly above "Amount Due EUR 200.00" -- and the
  // customer-facing word for void is "Cancelled", which is what
  // lib/invoice-status.ts prints on every screen.
  const settlementLabel = isPaid
    ? "Amount Paid"
    : isSettled
      ? "Nothing Due"
      : "Amount Due";
  // ── WHAT AN INVOICE HAS TO SAY AND DID NOT ────────────────────────
  //
  // due_date exists on the row and drives the dunning run and the
  // customer's own billing page -- and the PDF never read it, so an
  // unpaid invoice said "Amount Due EUR 200.00" with no date to pay
  // by. period_start is written by both subscription generators, so a
  // monthly invoice never said which month it covered. And vat_no in
  // the Bill To block is the CUSTOMER'S: an EU invoice carrying the
  // buyer's VAT number and none of the seller's is not a valid VAT
  // invoice.
  //
  // Read straight off rows already in hand, so a column a migration
  // has not added yet is simply undefined and the line is omitted --
  // no second query to fail.
  const dueAt = invoice.due_date ? formatIsoDate(invoice.due_date) : "";
  const dueDateHtml =
    !isSettled && dueAt && dueAt !== "N/A"
      ? `<div class="invoice-date">Due: ${escapeHtml(dueAt)}</div>`
      : "";

  const periodFrom = invoice.period_start
    ? formatIsoDate(invoice.period_start)
    : "";
  const periodHtml =
    periodFrom && periodFrom !== "N/A"
      ? `<div class="invoice-date">Period from: ${escapeHtml(periodFrom)}</div>`
      : "";

  const issuerVat = compactText(issuer?.vat_no) || "";
  const issuerReg = compactText(issuer?.registration_no) || "";
  const issuerIdsHtml = [
    issuerReg ? `<div class="line">Reg. No: ${escapeHtml(issuerReg)}</div>` : "",
    issuerVat ? `<div class="line">VAT No: ${escapeHtml(issuerVat)}</div>` : "",
  ].join("");

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

  const hasRealAddress = (lines: string[]) =>
    lines.length > 0 && !(lines.length === 1 && lines[0] === "N/A");

  // ── AN INVOICE FROM US, TO US ─────────────────────────────────────
  //
  // `tenant` is OUR tenant row, not the customer's. So when
  // invoices.company_id was null -- which it is for anything raised
  // before the customer filled in Settings > Company -- the Bill To
  // block printed our own name and our own address opposite our own
  // name in the From block. The customer's own name was reached only
  // if tenants.name happened to be null too. That is what the blank
  // company invoice actually was: not blank, addressed to the wrong
  // party.
  //
  // The customer is, in order: their company, then the person on the
  // account. Our tenant is never the customer, so it is no longer in
  // the chain at all.
  const advertiserName =
    compactText(
      advertiser?.profile?.full_name ?? advertiser?.profile?.email,
    ) || "";
  const billToName =
    companyName !== "N/A" ? companyName : advertiserName || "N/A";
  const resolvedBillToLines = hasRealAddress(companyAddressLines)
    ? companyAddressLines
    : hasRealAddress(billingLines)
      ? billingLines
      : [];
  const lineItems = items.map((item, index) => {
    const tax = toNumber(item.tax);
    const net = itemNet(item);
    // An amount-only item printed "0.00 x 0.00 = 5,000.00", which reads
    // as a mistake in a table somebody is checking. One of something,
    // priced at its own net, is the true statement.
    const quantity = toNumber(item.quantity) > 0 ? toNumber(item.quantity) : 1;
    const rate =
      toNumber(item.rate) > 0 ? toNumber(item.rate) : quantity > 0 ? net / quantity : net;
    const amount =
      toNumber(item.amount) > 0 ? toNumber(item.amount) : net + tax;
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

  // ── A PLACEHOLDER THAT INVENTED A ZERO LINE ───────────────────────
  //
  // "No line items found ... 0.00 0.00 0% 0.00" is an internal
  // observation printed as an invoice line, and it made the table
  // contradict the total underneath it. An invoice with no stored
  // lines still charges a real amount, so print THAT as the line: one
  // row, the invoice's own description and its own total. The customer
  // sees what they are paying for instead of a row that says nothing
  // was found.
  if (!lineItems.length) {
    lineItems.push({
      index: 1,
      description: invoiceType || "Services",
      quantity: 1,
      rate: subTotal,
      tax: computedTax,
      amount: total,
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
          <!-- AN AMOUNT, NOT A PERCENTAGE. row.tax is summed into the
               total (computedTax) and subtracted to get net, so it is
               unambiguously money -- and it was drawn with a % after it.
               An item {rate:500, tax:105} for 21% VAT printed
               "Rate 500.00 | Tax 105% | Amount 605.00". -->
          <td class="num">${escapeHtml(formatAmount(row.tax))}</td>
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
          <div class="invoice-type">${escapeHtml(invoiceType)}</div>
          ${invoiceReferenceHtml}
          <div class="invoice-status ${statusClass}">${escapeHtml(statusText)}</div>
        </div>
      </section>

      <section class="parties">
        <div class="from">
          <p class="party-name">${escapeHtml(issuerName)}</p>
          ${renderLines(issuerAddressLines)}
          ${issuerIdsHtml}
        </div>
         <div class="bill-to">
         <p class="party-heading">Bill To</p>
         <p class="party-name">${escapeHtml(billToName)}</p>
          ${renderLines(resolvedBillToLines)}
          <div class="line">${
            /* is_not_vat is a column the customer ticks on
               /complete-profile and the PDF never read, so a VAT-exempt
               business got "VAT Number: N/A" -- which reads as a
               missing detail rather than the statement it is. */
            company?.is_not_vat
              ? "VAT: not VAT-registered"
              : `VAT Number: ${escapeHtml(vatNo)}`
          }</div>

         <div class="invoice-date">Invoice Date: ${escapeHtml(createdAt)}</div>
         ${periodHtml}
         ${dueDateHtml}
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
        ${
          /* There was no tax row at all. Every invoice this app raises
             writes tax: 0, so it never showed -- but a hand-authored row
             carrying VAT stated the amount nowhere, and an EU VAT
             invoice that does not state the VAT is not a valid VAT
             invoice. Printed only when it is not zero, so nothing
             changes on the invoices we raise ourselves. */
          computedTax
            ? `<div class="summary-line">
          <span>VAT</span>
          <span>${escapeHtml(formatMoney(computedTax, currencySymbol))}</span>
        </div>`
            : ""
        }
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
      const { data: ownCompany } = await supabase
        .from("companies")
        .select("*")
        .eq("advertiser_id", (invoice as InvoiceRecord).advertiser_id as string)
        .maybeSingle();
      if (ownCompany) {
        (invoice as InvoiceRecord).company = ownCompany as CompanyRecord;
      }
    }

    // Attach the tenant-level company row as the issuer party on the
    // PDF. Separate query because the invoice's own `company` FK
    // points at the advertiser's bill-to company, not the tenant's
    // own. maybeSingle() so a tenant that has not filled its company
    // in yet still returns a rendered PDF (issuer falls back to
    // TURLIT hardcode).
    const { data: issuerCompany } = await supabase
      .from("companies")
      .select(
        "name, official_email, phone, website_url, registration_no, vat_no, is_not_vat, address, state, country, zipcode",
      )
      .eq("tenant_id", activeProfile.tenant_id)
      .is("advertiser_id", null)
      .maybeSingle();
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
