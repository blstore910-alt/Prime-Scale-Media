"use server";

import {
  BANK_ACCOUNT_CURRENCIES,
  type BankAccount,
  type BankAccountCurrency,
} from "@/lib/types/bank-account";
import {
  type ActionResult,
  type AdminContext,
  resolveAdminContext,
  versionMatches,
  wroteSomething,
} from "./_shared";

const SELECT_COLS =
  "id, tenant_id, ad_account_type_id, currency, label, beneficiary, account_no, swift_bic, bank_name, bank_address, routing_no, notes, is_active, sort_order, updated_by, created_at, updated_at";

function isCurrency(v: unknown): v is BankAccountCurrency {
  return (
    typeof v === "string" &&
    (BANK_ACCOUNT_CURRENCIES as string[]).includes(v)
  );
}

// Trim a string field to null when empty; leave undefined untouched so the
// caller can omit a field from the patch entirely.
//
// ...WHICH IS WHAT IT SAID AND NOT WHAT IT DID. `v == null` is true for
// undefined as well as null, so an omitted field came back as null and
// was then written unconditionally — a partial patch that left out
// swift_bic CLEARED it, on the table holding the IBANs customers wire
// to. Latent only because the one caller always sends the whole draft.
//
// undefined now means "not in this patch" and is dropped by the caller;
// an explicit null still clears.
function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

// ─────────────────────────────────────────
// Owner (super-admin) context. Writes to bank_accounts move real money to
// the shown beneficiary, so they are gated to the tenant OWNER — not every
// admin. Shape copied from actions/audit-actions.ts /
// actions/wallet-recovery-actions.ts: resolveAdminContext first, then
// fetch tenants.owner_id and require it equals the caller's user_id.
// ─────────────────────────────────────────
async function resolveOwnerContext(): Promise<
  { ok: true; ctx: AdminContext } | { ok: false; error: string }
> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();
  if (!tenant || tenant.owner_id !== profile.user_id) {
    return { ok: false, error: "Forbidden (super-admin only)" };
  }
  return { ok: true, ctx: auth.ctx };
}

// ─────────────────────────────────────────
// listBankAccounts — every bank destination for the caller's tenant.
// Admin read (RLS also covers reads); kept in an action for consistency.
// ─────────────────────────────────────────
export async function listBankAccounts(): Promise<ActionResult<BankAccount[]>> {
  // ── OWNER, LIKE BOTH WRITERS IN THIS FILE ────────────────────────
  //
  // upsertBankAccount and deleteBankAccount are resolveOwnerContext and
  // the settings screen is requireSuperAdmin -- this read was the one
  // door left at admin level, and it returns the whole row: beneficiary,
  // account_no, swift_bic, routing_no, bank_address. Those are the
  // destinations customers wire money to.
  const auth = await resolveOwnerContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const { data, error } = await supabase
    .from("bank_accounts")
    .select(SELECT_COLS)
    .eq("tenant_id", profile.tenant_id)
    .order("sort_order", { ascending: true })
    .order("currency", { ascending: true });
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: (data ?? []) as BankAccount[] };
}

// ─────────────────────────────────────────
// upsertBankAccount — create or edit one destination, keyed by
// (ad_account_type_id, currency). Owner-gated. tenant_id forced from the
// session, updated_by set, payload column-allowlisted, optimistic-
// concurrency guarded on update.
// ─────────────────────────────────────────
export async function upsertBankAccount(input: {
  ad_account_type_id: string;
  currency: BankAccountCurrency;
  label: string;
  beneficiary?: string | null;
  account_no?: string | null;
  swift_bic?: string | null;
  bank_name?: string | null;
  bank_address?: string | null;
  routing_no?: string | null;
  notes?: string | null;
  is_active?: boolean;
  sort_order?: number;
  ifUpdatedAt?: string;
}): Promise<ActionResult<{ id: string }>> {
  const auth = await resolveOwnerContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const ad_account_type_id = String(input?.ad_account_type_id ?? "").trim();
  const currency = input?.currency;
  const label = String(input?.label ?? "").trim();

  if (!ad_account_type_id) {
    return { ok: false, error: "Pick an ad-account type.", code: "invalid" };
  }
  if (!isCurrency(currency)) {
    return { ok: false, error: "Pick a currency (EUR, USD or HKD).", code: "invalid" };
  }
  if (!label) return { ok: false, error: "Enter a label.", code: "invalid" };
  if (label.length > 120) {
    return { ok: false, error: "Label is too long (max 120).", code: "invalid" };
  }

  // The referenced ad-account type must belong to the caller's tenant —
  // never let a write reference another tenant's type.
  const { data: type, error: typeErr } = await supabase
    .from("ad_account_types")
    .select("id, tenant_id")
    .eq("id", ad_account_type_id)
    .maybeSingle();
  if (typeErr) return { ok: false, error: typeErr.message };
  if (!type || type.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Ad-account type not found.", code: "not_found" };
  }

  // Column-allowlisted payload — never spread caller input.
  const fields: Record<string, unknown> = {
    label,
    beneficiary: trimOrNull(input.beneficiary),
    account_no: trimOrNull(input.account_no),
    swift_bic: trimOrNull(input.swift_bic),
    bank_name: trimOrNull(input.bank_name),
    bank_address: trimOrNull(input.bank_address),
    routing_no: trimOrNull(input.routing_no),
    notes: trimOrNull(input.notes),
  };
  if (typeof input.is_active === "boolean") fields.is_active = input.is_active;
  if (typeof input.sort_order === "number") fields.sort_order = input.sort_order;

  // A field the caller did NOT send is dropped rather than written as
  // null. This is the other half of trimOrNull's contract, and without it
  // a partial patch clears the IBAN, the SWIFT or the beneficiary on the
  // account customers wire money to.
  for (const k of Object.keys(fields)) {
    if (fields[k] === undefined) delete fields[k];
  }

  // Resolve any existing row by the natural key (tenant, type, currency).
  const { data: existing, error: existErr } = await supabase
    .from("bank_accounts")
    .select("id, tenant_id, updated_at")
    .eq("tenant_id", profile.tenant_id)
    .eq("ad_account_type_id", ad_account_type_id)
    .eq("currency", currency)
    .maybeSingle();
  if (existErr) return { ok: false, error: existErr.message };

  // ---- UPDATE ----
  if (existing) {
    if (existing.tenant_id !== profile.tenant_id) {
      return { ok: false, error: "Forbidden", code: "forbidden" };
    }
    if (!versionMatches(existing.updated_at, input.ifUpdatedAt)) {
      return {
        ok: false,
        error: "This bank was changed elsewhere. Reload and try again.",
        code: "conflict",
      };
    }
    const { data: rows, error } = await supabase
      .from("bank_accounts")
      .update({ ...fields, updated_by: profile.user_id })
      .eq("id", existing.id)
      .eq("tenant_id", profile.tenant_id)
      .select("id");
    if (error) return { ok: false, error: error.message };
    // These are the account numbers customers pay into. A save that reported
    // success and wrote nothing would leave the desk believing a corrected
    // IBAN had been stored.
    const wrote = wroteSomething(rows);
    if (!wrote.ok) return wrote;
    return { ok: true, data: { id: existing.id } };
  }

  // ---- CREATE ----
  const { data, error } = await supabase
    .from("bank_accounts")
    .insert({
      ...fields,
      tenant_id: profile.tenant_id,
      ad_account_type_id,
      currency,
      is_active: typeof input.is_active === "boolean" ? input.is_active : true,
      sort_order: typeof input.sort_order === "number" ? input.sort_order : 0,
      updated_by: profile.user_id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: data.id } };
}

// ─────────────────────────────────────────
// deleteBankAccount — remove one destination. Owner-gated, tenant-checked
// (re-fetch + compare tenant_id), optional optimistic-concurrency guard.
// ─────────────────────────────────────────
export async function deleteBankAccount(
  id: string,
  ifUpdatedAt?: string,
): Promise<ActionResult<{ id: string }>> {
  const auth = await resolveOwnerContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const bankId = String(id ?? "").trim();
  if (!bankId) return { ok: false, error: "Invalid input.", code: "invalid" };

  const { data: existing, error: fetchErr } = await supabase
    .from("bank_accounts")
    .select("id, tenant_id, updated_at")
    .eq("id", bankId)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!existing) return { ok: false, error: "Bank not found.", code: "not_found" };
  if (existing.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }
  if (!versionMatches(existing.updated_at, ifUpdatedAt)) {
    return {
      ok: false,
      error: "This bank was changed elsewhere. Reload and try again.",
      code: "conflict",
    };
  }

  // .select("id") and a row count. A DELETE that matches nothing is
  // { error: null } in PostgREST, so this reported the bank destination
  // gone while it was still live — and a closed beneficiary account left
  // in the destinations list is money wired into a dead account. The
  // zero-row case is real: the read above uses the caller's SELECT policy
  // while 20260915110000 narrowed WRITES to the tenant owner, so a
  // non-owner admin who can see the row gets a silent no-op.
  const { data: removed, error } = await supabase
    .from("bank_accounts")
    .delete()
    .eq("id", bankId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  const wrote = wroteSomething(removed);
  if (!wrote.ok) return wrote;
  return { ok: true, data: { id: bankId } };
}
