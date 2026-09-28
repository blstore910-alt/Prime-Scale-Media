import { bankForTypeSlug, type BankGroup } from "@/lib/bank-routing";

/**
 * Whether the bank_accounts table has something to say about where a
 * customer should transfer, and whether we may believe it.
 *
 * ── WHY THIS IS SO CAREFUL ────────────────────────────────────────
 *
 * The top-up dialog decides the destination by BANK GROUP (turlit /
 * zanel / muxue), worked out from the customer's ad accounts. The
 * `bank_accounts` table is keyed by AD-ACCOUNT TYPE. Those are not the
 * same thing: several types route to one group.
 *
 * The comments in wallet-topup-dialog.tsx record FOUR separate
 * occasions on which a customer was shown the wrong beneficiary and
 * made a real transfer to the wrong legal entity — every one of them a
 * case where the code picked something while it did not actually know.
 * So this resolver will not pick.
 *
 * Three outcomes, and only the first changes what the customer sees:
 *
 *   a row            — every active row for this group and currency
 *                      agrees on the money fields. Use it.
 *   null, "none"     — nothing stored for this combination. The
 *                      built-in list is the answer, and that is normal.
 *   null, "disagree" — two rows for the same group and currency name
 *                      different accounts. We do not know which, so we
 *                      fall back and say so in the log.
 *
 * A failed READ never reaches here: the caller passes an empty list and
 * gets "none", which is the built-in. The customer is never shown
 * nothing, and never shown a guess.
 */

export type FlatBankRow = {
  /** Slug of the ad-account type this row belongs to. */
  slug: string | null | undefined;
  currency: string | null | undefined;
  is_active?: boolean | null;
  label?: string | null;
  beneficiary?: string | null;
  account_no?: string | null;
  swift_bic?: string | null;
  bank_name?: string | null;
  bank_address?: string | null;
  routing_no?: string | null;
  notes?: string | null;
};

export type BankOverride = {
  label: string | null;
  beneficiary: string | null;
  account_no: string | null;
  swift_bic: string | null;
  bank_name: string | null;
  bank_address: string | null;
  routing_no: string | null;
  notes: string | null;
};

export type OverrideResult =
  | { override: BankOverride; reason: null }
  | { override: null; reason: "none" | "disagree" };

/** The fields that decide where money physically lands. */
const MONEY_FIELDS = [
  "beneficiary",
  "account_no",
  "swift_bic",
  "bank_name",
  "routing_no",
] as const;

const norm = (v: string | null | undefined) => String(v ?? "").trim();

export function bankOverrideFor(
  rows: FlatBankRow[] | null | undefined,
  group: BankGroup,
  currency: string,
): OverrideResult {
  const want = String(currency ?? "").toUpperCase();
  const mine = (rows ?? []).filter((r) => {
    if (r.is_active === false) return false;
    if (String(r.currency ?? "").toUpperCase() !== want) return false;
    const slug = String(r.slug ?? "").trim();
    if (!slug) return false;
    // ── THE SAME MATCH THE ROUTING USES, NOT A SECOND ONE ─────────
    //
    // This was a raw `BANK_BY_TYPE_SLUG[slug]` lookup while
    // bank-routing.ts had already been fixed to match on the slug's
    // SET OF WORDS -- because the seed writes `hk-meta-premium` and a
    // type created through /settings/ad-account-types is slugified
    // from its label into `meta-hk-premium`. Same type, two spellings.
    //
    // With two different matchers the routing and the override
    // disagree: the dialog sends the customer to TURLIT (routing
    // matched) and then shows the BUILT-IN account details, because
    // the override did not. The owner corrects an IBAN on
    // /settings/banks, is told in bold that it "replaces the built-in
    // beneficiary on the customer's transfer screen", and the customer
    // keeps seeing the old one.
    //
    // Every slug on this tenant happens to match both ways today. The
    // first type added through the Banks screen -- which is the screen
    // this whole feature exists for -- would not.
    return bankForTypeSlug(slug) === group;
  });

  if (mine.length === 0) return { override: null, reason: "none" };

  // A row with no account number is not a destination. Treat it as
  // absent rather than as an instruction to transfer into a blank.
  const usable = mine.filter((r) => norm(r.account_no) !== "");
  if (usable.length === 0) return { override: null, reason: "none" };

  const first = usable[0];
  for (const r of usable.slice(1)) {
    for (const f of MONEY_FIELDS) {
      if (norm(r[f]) !== norm(first[f])) {
        return { override: null, reason: "disagree" };
      }
    }
  }

  return {
    override: {
      label: norm(first.label) || null,
      beneficiary: norm(first.beneficiary) || null,
      account_no: norm(first.account_no) || null,
      swift_bic: norm(first.swift_bic) || null,
      bank_name: norm(first.bank_name) || null,
      bank_address: norm(first.bank_address) || null,
      routing_no: norm(first.routing_no) || null,
      notes: norm(first.notes) || null,
    },
    reason: null,
  };
}
