import { en } from "./i18n/en";
/**
 * Is this company complete enough to be invoiced?
 *
 * ONE PREDICATE, BECAUSE TWO DISAGREED. The onboarding checklist and the
 * advertiser shell each wrote their own version of this test and they
 * differed by exactly four fields — the checklist forgot the billing
 * address. So the step went green and ticked while, on the same screen,
 * the red chip "Add your company details to top up or request an
 * account" stayed, Top up and Exchange stayed greyed and Request one
 * stayed disabled. The customer had done what they were told, been told
 * they had done it, and nothing unlocked.
 *
 * This has now been got wrong twice in the same file pair: the checklist
 * originally checked three fields of twelve, was corrected to eight, and
 * the four that live on `billings` were still missed. It is one function
 * now, and both callers use it.
 *
 * WHAT IT ASKS FOR, and why each one:
 *   name, official_email, phone   the invoice header
 *   address, country, state, zipcode
 *                                 the company's own address
 *   vat_no OR is_not_vat          a VAT-exempt business ticks the box and
 *                                 has no number to give; demanding one
 *                                 locked them out permanently
 *   billings[0].address / state / country / zipcode
 *                                 where the invoice is actually sent
 *
 * NOTE WHICH FORM WRITES WHAT. `updateOwnProfileAndCompany` (Settings →
 * Company details) writes `companies` and never `billings`. Only
 * `saveOwnCompanyOnboarding` (/complete-profile) writes both. So a
 * customer can satisfy eight of the twelve from Settings and no more —
 * which is why the checklist step points at /complete-profile, and why
 * `missingCompanyFields` exists: telling someone "not complete" without
 * saying which part is how they end up filling the same form twice.
 */

export type CompanyLike = {
  name?: unknown;
  official_email?: unknown;
  phone?: unknown;
  address?: unknown;
  country?: unknown;
  state?: unknown;
  zipcode?: unknown;
  vat_no?: unknown;
  is_not_vat?: unknown;
  billings?: unknown;
} | null | undefined;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** The first billing row, whatever shape the read came back in. */
function firstBilling(company: CompanyLike): Record<string, unknown> | null {
  const b = company?.billings;
  if (Array.isArray(b)) return (b[0] as Record<string, unknown>) ?? null;
  // A `billings(...)` embed with a one-to-one relationship comes back as
  // an object rather than an array on some PostgREST versions. Treat it
  // as the single row it is instead of reading undefined off it.
  if (b && typeof b === "object") return b as Record<string, unknown>;
  return null;
}

/**
 * The fields still missing, in the order a person would fill them.
 * Empty array means complete. Labels are the customer's words, not
 * column names — this text is shown on screen.
 */
// ── SLEUTELS, ZODAT DE KLANT ZE IN ZIJN EIGEN TAAL LEEST ──────────
//
// Dit gaf vroeger kant-en-klare Engelse zinnen terug ("company name",
// "billing address"), en die kwamen zo op het dashboard -- ook bij een
// klant die de app in het Nederlands zet. Nu geeft de bron SLEUTELS uit
// lib/i18n, en vertaalt het scherm ze.
//
// missingCompanyFields hieronder blijft bestaan en geeft EXACT de oude
// Engelse zinnen: die wordt elders gebruikt en is getest, en een
// wijziging aan de vertaling mag daar niets aan veranderen. De Engelse
// waarden in lib/i18n/en.ts zijn letterlijk de oude strings.
export type CompanyFieldKey =
  | "field.companyName"
  | "field.companyEmail"
  | "field.phone"
  | "field.companyAddress"
  | "field.country"
  | "field.state"
  | "field.postcode"
  | "field.vat"
  | "field.billingAddress";

export function missingCompanyKeys(company: CompanyLike): CompanyFieldKey[] {
  const missing: CompanyFieldKey[] = [];

  if (!str(company?.name)) missing.push("field.companyName");
  if (!str(company?.official_email)) missing.push("field.companyEmail");
  if (!str(company?.phone)) missing.push("field.phone");
  if (!str(company?.address)) missing.push("field.companyAddress");
  if (!str(company?.country)) missing.push("field.country");
  if (!str(company?.state)) missing.push("field.state");
  if (!str(company?.zipcode)) missing.push("field.postcode");
  if (!str(company?.vat_no) && company?.is_not_vat !== true) {
    missing.push("field.vat");
  }

  const billing = firstBilling(company);
  // Named as one item rather than four. Four separate lines all saying
  // "billing …" reads as eight missing fields when it is one form.
  if (
    !billing ||
    !str(billing.address) ||
    !str(billing.state) ||
    !str(billing.country) ||
    !str(billing.zipcode)
  ) {
    missing.push("field.billingAddress");
  }

  return missing;
}

/**
 * Dezelfde lijst in het Engels, zoals deze functie hem altijd gaf.
 *
 * AFGELEID van missingCompanyKeys, niet ernaast gekopieerd: twee kopieën
 * van dezelfde regels lopen vroeg of laat uit elkaar, en dan zegt het
 * Engelse scherm iets anders dan het Nederlandse. Dat de Engelse zinnen
 * letterlijk dezelfde zijn gebleven, pint tests/lib/company-complete.test.ts
 * vast.
 */
export function missingCompanyFields(company: CompanyLike): string[] {
  return missingCompanyKeys(company).map((k) => en[k]);
}

/** True when nothing is missing. */
export function isCompanyComplete(company: CompanyLike): boolean {
  return missingCompanyFields(company).length === 0;
}
