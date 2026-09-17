/**
 * The beneficiary details that are ACTUALLY in force, flattened into the
 * shape the Banks settings table stores.
 *
 * Two copies of the same banking details exist today. The one customers see
 * lives in components/wallet/bank-transfer-instructions.tsx as nested
 * sections of label/value pairs, written for reading. The one the Banks
 * settings page edits is a flat row per ad-account type and currency, written
 * for storing. The settings page showed "no destinations set" for every
 * single type while real transfers had been routing through the built-ins
 * for weeks — the page looked empty on a tenant that was taking payments.
 *
 * This is the bridge: it reads the customer-facing copy and produces the
 * storable row, so the table can be filled with what is already true instead
 * of being retyped from a PDF. It is pure and tested, because a transposed
 * digit here is money sent to an account nobody is watching.
 *
 * It does NOT guess. A field the built-in copy does not carry comes back
 * empty rather than being inferred from a neighbouring one.
 */

import {
  bankInstructions,
  type BankGroup,
} from "@/lib/bank-beneficiaries";

export type BuiltInBankDraft = {
  label: string;
  beneficiary: string;
  account_no: string;
  swift_bic: string;
  bank_name: string;
  bank_address: string;
  routing_no: string;
  notes: string;
};

/**
 * Values in the instructions carry explanatory tails on their own lines —
 * "101019628\n(Use this routing number for both Wire and ACH…)". The number
 * is the first line; the rest is guidance for a human and has no business in
 * an IBAN field.
 */
export function firstLine(value: string | null | undefined): string {
  const first = String(value ?? "").split("\n")[0] ?? "";
  return first.trim();
}

/** Every line joined with ", " — for an address, where the tail IS the value. */
function flatten(value: string | null | undefined): string {
  return String(value ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * Find an item by trying each label in order and taking the first hit.
 * Matching is case-insensitive and on a prefix, because the same field is
 * labelled "SWIFT / BIC" in one block and "SWIFT/BIC" in another, and
 * "Beneficiary / Bank Address (as shown by Wise)" is an address.
 */
function pick(
  items: Array<{ label: string; value: string }>,
  labels: string[],
): string {
  for (const wanted of labels) {
    const w = wanted.toLowerCase().replace(/[\s/]+/g, "");
    const hit = items.find(
      (i) => i.label.toLowerCase().replace(/[\s/]+/g, "").startsWith(w),
    );
    if (hit) return hit.value;
  }
  return "";
}

/**
 * The storable row for one beneficiary group and transfer currency, or null
 * when that group does not hold an account in that currency — which is a real
 * answer, not a gap: ZANEL takes USD only, and offering a EUR destination
 * there would invite a transfer that bounces.
 */
export function builtInBankDraft(
  group: BankGroup,
  currency: string,
): BuiltInBankDraft | null {
  const cfg = bankInstructions[group];
  if (!cfg) return null;
  const detail = (cfg.accounts as Record<string, unknown>)[
    currency.toUpperCase()
  ] as
    | {
        account_name?: string;
        sections?: Array<{ items: Array<{ label: string; value: string }> }>;
      }
    | undefined;
  if (!detail) return null;

  const items = (detail.sections ?? []).flatMap((s) => s.items ?? []);

  // IBAN first: where a group lists both, the IBAN is the one a European
  // sender needs, and ZANEL's two fields carry the same digits anyway.
  const account = pick(items, ["IBAN", "Account Number", "Account no"]);

  return {
    label: detail.account_name ?? `${cfg.beneficiary} — ${currency}`,
    beneficiary: firstLine(
      pick(items, ["Beneficiary Name", "Account Holder", "Beneficiary"]) ||
        cfg.beneficiary,
    ),
    account_no: firstLine(account),
    swift_bic: firstLine(pick(items, ["SWIFT / BIC", "BIC"])),
    bank_name: firstLine(pick(items, ["Bank Name"])),
    bank_address: flatten(
      pick(items, [
        "Bank Address",
        "Beneficiary / Bank Address",
        "Beneficiary Address",
      ]),
    ),
    routing_no: firstLine(pick(items, ["Routing Number", "Routing no", "ABA"])),
    notes: "",
  };
}

/** Which currencies a group actually holds an account in. */
export function builtInCurrencies(group: BankGroup): string[] {
  const cfg = bankInstructions[group];
  if (!cfg) return [];
  return Object.keys(cfg.accounts);
}
