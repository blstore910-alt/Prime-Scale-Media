/**
 * The reference a customer writes on a bank transfer.
 *
 * `<their client code, digits only>-<the topup's own reference>` — so
 * PSM000005 paying topup 4839 writes `000005-4839`. Every payment from one
 * customer then starts with the same number, which is what makes a bank
 * statement readable at a glance: you can see whose money it is before you
 * have matched anything.
 *
 * WHY THIS IS NOT JUST A DISPLAY CHANGE
 *
 * lib/integrations/wise-match.ts matches an incoming transfer by pulling the
 * longest run of digits out of whatever the sender typed. Given `000005-4839`
 * the longest run is `000005` — the CLIENT CODE — so the match would be
 * attempted against the wrong number and quietly fail, sending every
 * prefixed payment to manual review. The composed form therefore has to be
 * understood by the matcher, which is why the parser lives here beside the
 * formatter rather than in whichever file needed it first.
 */

/** Digits of a client code, with any letter prefix removed. PSM000005 → 000005. */
export function clientCodeDigits(clientCode?: string | null): string {
  const digits = (clientCode ?? "").replace(/\D+/g, "");
  return digits;
}

/**
 * The reference to show the customer. Falls back to the bare reference when
 * the client code is unknown — a reference that is merely unprefixed still
 * matches, one that is missing does not.
 */
export function formatPaymentReference(
  clientCode: string | null | undefined,
  referenceNo: string | number | null | undefined,
): string {
  const ref = String(referenceNo ?? "").trim();
  if (!ref) return "";
  const code = clientCodeDigits(clientCode);
  return code ? `${code}-${ref}` : ref;
}

/**
 * Pull the topup reference out of whatever a sender actually typed.
 *
 * Banks wrap it in text ("PSM-TOPUP 1483181337", "ref 1483181337"), split it,
 * or keep our own `000005-4839`. Rules, in order:
 *
 *   1. `<digits>-<digits>` anywhere in the string → the part AFTER the
 *      separator. That is our own composed format, and the half before it is
 *      the client code, which must never be taken for the reference.
 *   2. Otherwise the longest run of 4+ digits.
 *
 * Returns null when there is nothing usable.
 */
export function extractTopupReference(reference: string | null): string | null {
  if (!reference) return null;

  // Our own format first, and only when BOTH halves are plausible — a date
  // like "12-2026" or an IBAN fragment should not be read as one.
  const composed = reference.match(/(\d{3,})\s*[-–—/]\s*(\d{4,})/);
  if (composed) return composed[2];

  const runs = reference.match(/\d{4,}/g);
  if (!runs || runs.length === 0) return null;
  return runs.reduce((a, b) => (b.length >= a.length ? b : a));
}

/**
 * An invoice's number as everyone should see it: client-code prefixed, the
 * same shape as the payment reference that settles it.
 *
 * It matters that this is ONE function. The advertiser's own list was
 * prefixing while every admin screen and the PDF filename printed the bare
 * sequence, so the same invoice had two identities depending on who was
 * looking — and those two people phone each other about it.
 *
 * Takes the embed in either shape, because PostgREST returns a to-one join
 * as an object in some queries and a single-element array in others.
 */
export function invoiceNumber(invoice: {
  number?: string | number | null;
  advertiser?:
    | { tenant_client_code?: string | null }
    | Array<{ tenant_client_code?: string | null }>
    | null;
}): string {
  const adv = Array.isArray(invoice.advertiser)
    ? invoice.advertiser[0]
    : invoice.advertiser;
  return formatPaymentReference(adv?.tenant_client_code, invoice.number);
}
