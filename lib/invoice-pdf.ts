// ── THE INVOICE DOCUMENT ────────────────────────────────────────────
//
// Lifted verbatim out of app/api/invoices/[invoiceId]/pdf/route.ts, which
// is where all of this was written and where it still has a caller.
// Nothing about the document changed in the move.
//
// WHY IT MOVED. The owner, 27-09: "in de app voor client moet ook 1 knop
// zijn om invoices te downloaden, date from to date en invoice status",
// and then "niet meerdere facturen in een doc, meerdere pdfs in 1 zip."
//
// A second route now renders the SAME document, many times over, and
// importing helpers out of a route handler is not something Next
// supports. So the half that DRAWS an invoice lives here and both routes
// import it; the half that decides who may see one stays in the route,
// because that is per-request and per-caller.
//
// The single-invoice PDF is unchanged. That matters: it is the document
// a customer pays from.

import { CURRENCY_SYMBOLS } from "@/lib/constants";
import { formatPaymentReference } from "@/lib/payment-reference";
import { invoiceStatusView } from "@/lib/invoice-status";
import { readFile } from "fs/promises";
import path from "path";

export type InvoiceItem = {
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

export type CompanyRecord = {
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

export type BillingRecord = {
  address?: string | null;
  state?: string | null;
  country?: string | null;
  zipcode?: string | null;
};

export type AdvertiserRecord = {
  tenant_client_code?: string | null;
  profile?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
};

export type TenantRecord = {
  name?: string | null;
  address?: string | null;
  state?: string | null;
  country?: string | null;
  zipcode?: string | null;
};

export type InvoiceRecord = {
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

export const DEFAULT_INVOICE_LOGO_PATH =
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

export function getReferenceNoFromItems(
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

export function sanitizeFileNamePart(value: string): string {
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

export function resolveInvoiceTypeKey(
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

export async function loadPublicImageDataUri(
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

/**
 * THE STYLESHEET OF THE DOCUMENT WE SEND CUSTOMERS.
 *
 * Pulled out of buildInvoiceHtml unchanged so a SECOND document -- the
 * self-billed invoice we raise for an affiliate payout -- is the same
 * piece of paper rather than a lookalike. The owner, 28-09, on the old
 * payout page: "invoice moet mooier stijl net als wat wij naar klanten
 * geven dit is lelijk geen echte invoice".
 *
 * One copy, so they cannot drift apart later.
 */
export const INVOICE_DOC_CSS = `
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
`;

 export function buildInvoiceHtml(
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
    // Een DST-regel heeft alleen een description (dst_charge_invoice);
    // zonder die terugval stond er "Dst" op de pdf.
    const baseDescription =
      (item.name
        ? formatLabel(item.name)
        : compactText((item as { description?: string | null }).description) || formatLabel(invoiceTypeKey)) || "Line item";
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
    <style>${INVOICE_DOC_CSS}</style>
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

export async function buildInvoicePdf(
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


// ── THE SELF-BILLED INVOICE, ON THE SAME PIECE OF PAPER ─────────────
//
// The owner, 28-09, looking at the payout document: "invoice moet
// mooier stijl net als wat wij naar klanten geven dit is lelijk geen
// echte invoice".
//
// He was right twice over. It was a different-looking page — no logo,
// no INVOICE heading, its own colours, a rounded card on a grey wash —
// and more importantly it did not read as a document: a tax paper that
// looks like a web page is not one an accountant files.
//
// So it is now drawn with INVOICE_DOC_CSS, the stylesheet of the
// invoice we send customers, in the same A4 frame, with the same logo,
// the same dark table head, the same summary block and the same
// signature line. The only differences are the ones that MUST differ:
// the heading says SELF-BILLED INVOICE, and the parties are the other
// way round — the affiliate supplies, we buy.
//
// It is rendered as HTML rather than through puppeteer because a payout
// document is opened far more often than it is filed, and the browser's
// own "Save as PDF" produces the same A4 page from this markup. The
// button hides itself when printing.

export type SelfBilledParty = {
  name: string;
  lines: string[];
};

export type SelfBilledInvoiceInput = {
  /** "PSM0008-02" — the partner's own series, never the house number. */
  reference: string;
  /** Paid, or awaiting the transfer. */
  paid: boolean;
  /** Already formatted for reading, e.g. "28 September 2026". */
  date: string;
  /** The bank reference of the transfer, when there is one. */
  bankReference?: string | null;
  supplier: SelfBilledParty;
  customer: SelfBilledParty;
  lines: { text: string; amount: string }[];
  /** One per transferred currency; nearly always exactly one. */
  totals: { label: string; amount: string }[];
};

export function buildSelfBilledInvoiceHtml(
  input: SelfBilledInvoiceInput,
): string {
  const renderLines = (lines: string[]) =>
    lines.map((line) => `<div class="line">${escapeHtml(line)}</div>`).join("");

  const rowsHtml = input.lines
    .map(
      (l, i) => `
        <tr>
          <td class="center">${i + 1}</td>
          <td class="item-name">${escapeHtml(l.text)}</td>
          <td class="num">${escapeHtml(l.amount)}</td>
        </tr>`,
    )
    .join("");

  const totalsHtml = input.totals
    .map(
      (t) => `
        <div class="summary-line shaded strong">
          <span>${escapeHtml(t.label)}</span>
          <span>${escapeHtml(t.amount)}</span>
        </div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Self-billed invoice ${escapeHtml(input.reference)}</title>
    <style>${INVOICE_DOC_CSS}</style>
    <style>
      /* Only what a screen needs that a sheet of paper does not. The
         document itself is untouched: everything here either shows the
         A4 page on a phone or disappears when printing. */
      body { background:#eef1f8; }
      /* AS TALL AS THE INVOICE, NOT AS TALL AS A4. The shared sheet is
         297mm high because the customer's document is printed; here it
         meant a short invoice sat at the top of a page and a half of
         empty white with a scrollbar beside it — the owner: "de pagina
         is lange scroll". @page still says A4, so printing is
         unchanged. */
      html, body { height:auto; min-height:0; }
      .invoice {
        margin:0 auto; min-height:0; padding:14mm 12mm;
        box-shadow:0 20px 50px -30px rgba(20,30,80,.5);
      }
      .bar { position:fixed; right:16px; top:16px; display:flex; gap:8px; }
      .bar button {
        display:inline-flex; align-items:center; gap:8px;
        padding:10px 16px; border:0; border-radius:10px;
        font:700 14px/1 Arial, Helvetica, sans-serif; cursor:pointer;
      }
      .bar .save { background:#3a6fff; color:#fff;
        box-shadow:0 10px 24px -12px rgba(58,111,255,.8); }
      .bar .back { background:#fff; color:#12162a; border:1px solid #d7dcec; }
      @media print {
        body { background:#fff; }
        .invoice { box-shadow:none; padding:12mm; }
        .bar { display:none; }
      }
      @media (max-width: 230mm) {
        /* A4 is wider than a phone. Scaling the whole sheet keeps the
           document a document instead of reflowing it into something
           else that then prints differently from what was on screen. */
        html, body { width:auto; }
        body { padding:10px; }
        .invoice { transform-origin: top left; }
        .bar { position:static; margin:0 0 10px; }
        .bar button { flex:1 1 0; justify-content:center; }
      }
    </style>
  </head>
  <body>
    <div class="bar">
      <!-- There was no way back at all: this opens in its own tab from
           the payout dialog, so a phone has no visible browser chrome
           and the only exit was the tab strip. -->
      <button class="back" onclick="if(history.length>1){history.back()}else{window.close()}">Back</button>
      <button class="save" onclick="window.print()">Save as PDF</button>
    </div>
    <main class="invoice">
      <section class="top">
        <!-- NO LOGO. The owner: "je ziet ons logo die moet sws weg want
             invoice komt van klant". Right — on a self-billed invoice
             the SUPPLIER is the affiliate; we only write it on their
             behalf. Our mark at the top made it look like our document
             and theirs like a line item in it. The party blocks below
             say who is who, which is what a self-billed invoice is
             supposed to make unmistakable. -->
        <div></div>
        <div class="invoice-meta">
          <h1 class="invoice-title">SELF-BILLED INVOICE</h1>
          <div class="invoice-number"># ${escapeHtml(input.reference)}</div>
          ${
            input.bankReference
              ? `<div class="invoice-reference">Reference: ${escapeHtml(input.bankReference)}</div>`
              : ""
          }
          <div class="invoice-status ${input.paid ? "paid" : "unpaid"}">${
            input.paid ? "Paid" : "Awaiting transfer"
          }</div>
        </div>
      </section>

      <section class="parties">
        <div class="from">
          <p class="party-heading">Supplier</p>
          <p class="party-name">${escapeHtml(input.supplier.name)}</p>
          ${renderLines(input.supplier.lines)}
        </div>
        <div class="bill-to">
          <p class="party-heading">Billed To</p>
          <p class="party-name">${escapeHtml(input.customer.name)}</p>
          ${renderLines(input.customer.lines)}
          <div class="invoice-date">Invoice Date: ${escapeHtml(input.date)}</div>
        </div>
      </section>

      <section class="items">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th class="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </section>

      <section class="summary">
        ${totalsHtml}
      </section>

      <!-- ONE LINE. The owner: "veel tekst is niet mooi auto generated
           bla bla". It ran to four lines that explained self-billing to
           somebody who is holding a self-billed invoice. What has to be
           on the paper is that we raised it on their behalf and that
           VAT is theirs — and that fits in a sentence. -->
      <section class="signature">
        Raised by ${escapeHtml(input.customer.name)} on the supplier&#39;s behalf.
        VAT per the supplier&#39;s own registration.
      </section>
    </main>
    <script>
      // The sheet is 210mm wide; a phone is not. Scale it down to fit
      // rather than letting it scroll sideways, and give the page back
      // the height it loses so nothing is cut off underneath.
      (function () {
        var sheet = document.querySelector(".invoice");
        function fit() {
          if (!sheet) return;
          var avail = document.documentElement.clientWidth - 20;
          var w = sheet.offsetWidth;
          if (!w) return;
          var s = Math.min(1, avail / w);
          sheet.style.transform = s < 1 ? "scale(" + s + ")" : "";
          sheet.style.marginBottom = s < 1 ? -(sheet.offsetHeight * (1 - s)) + "px" : "";
        }
        fit();
        window.addEventListener("resize", fit);
      })();
    </script>
  </body>
</html>`;
}
