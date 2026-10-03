import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchWiseOutgoingTransfers } from "@/lib/integrations/wise-api";
import { lineFromWiseTransfer, WISE_SUPPLIER_IMPORT_SINCE } from "@/lib/pure-wise-supplier";
import { safeErrorMessage } from "@/lib/pure-error";

// ── WISE PAYMENTS TO MUXUE -> THE BESTADS BALANCE ─────────────────────
//
// Run by the 15-minute cron and by "Sync now" on the supplier-balance
// page. Reads what WE paid through Wise, keeps the payments to Muxue that
// went out on or after the cut-off, and books each one ONCE as a "We
// sent" line (external_ref wise:<id>, unique per tenant -- plak 202).
// The rules per currency are in lib/pure-wise-supplier.ts.
//
// FAILS CLOSED on the tenant: there is one Wise account and nothing maps
// it to a tenant, the same gap the deposit matcher has. Muxue must be a
// supplier of exactly ONE tenant, or nothing is booked.

const RECIPIENT = /muxue/i;

export type SupplierWiseSyncResult =
  | { ok: true; imported: number; seen: number; skipped?: string }
  | { ok: false; error: string };

export async function syncWiseToSupplier(db: SupabaseClient): Promise<SupplierWiseSyncResult> {
  // Which tenant, and what the supplier is called in the ledger.
  const { data: sup, error: supErr } = await db
    .from("ad_account_type_suppliers")
    .select("tenant_id, supplier_label");
  if (supErr) return { ok: false, error: safeErrorMessage(supErr) };
  const muxue = ((sup ?? []) as { tenant_id: string | null; supplier_label: string | null }[]).filter((r) =>
    RECIPIENT.test(r.supplier_label ?? ""),
  );
  const tenants = Array.from(new Set(muxue.map((r) => r.tenant_id).filter(Boolean))) as string[];
  if (tenants.length !== 1) return { ok: true, imported: 0, seen: 0, skipped: `Muxue is a supplier of ${tenants.length} tenants, not 1` };
  const tenantId = tenants[0];
  const supplier = (muxue.find((r) => r.tenant_id === tenantId)?.supplier_label ?? "Muxue").trim();

  // Our rate, as the app stores it: 1 USD = N EUR.
  const { data: rate } = await db
    .from("exchange_rates")
    .select("eur")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .limit(1);
  const eurPerUsd = Number((rate ?? [])[0]?.eur ?? 0) || null;

  // A two-week window is plenty for a job that runs every 15 minutes, and
  // never earlier than the cut-off.
  const since = new Date(Math.max(Date.parse(WISE_SUPPLIER_IMPORT_SINCE), Date.now() - 14 * 86400_000)).toISOString();
  const r = await fetchWiseOutgoingTransfers({ sinceIso: since, recipientMatch: RECIPIENT });
  if (!r.ok) return { ok: false, error: r.error };

  const lines = r.transfers.map((t) => lineFromWiseTransfer(t, eurPerUsd)).filter(Boolean) as NonNullable<
    ReturnType<typeof lineFromWiseTransfer>
  >[];
  if (!lines.length) return { ok: true, imported: 0, seen: r.transfers.length };

  // What is already booked. The unique index is the real guard; this is
  // so a normal run does not lean on an error for every old payment.
  const { data: have, error: haveErr } = await db
    .from("supplier_ledger_lines")
    .select("external_ref")
    .eq("tenant_id", tenantId)
    .in("external_ref", lines.map((l) => l.externalRef));
  if (haveErr) return { ok: false, error: safeErrorMessage(haveErr) };
  const booked = new Set(((have ?? []) as { external_ref: string }[]).map((x) => x.external_ref));

  let imported = 0;
  for (const l of lines) {
    if (booked.has(l.externalRef)) continue;
    const { error } = await db.from("supplier_ledger_lines").insert({
      tenant_id: tenantId,
      supplier,
      day: l.day,
      kind: "deposit",
      amount: l.amount,
      currency: "USD",
      note: l.note,
      status: "approved",
      sent_amount: l.sentAmount,
      sent_currency: l.sentCurrency,
      external_ref: l.externalRef,
      usd_confirmed: l.usdConfirmed,
      created_by: null,
    });
    if (error) {
      // 23505: booked a moment ago by the other run. Anything else stops.
      if ((error as { code?: string }).code === "23505") continue;
      return { ok: false, error: safeErrorMessage(error) };
    }
    imported += 1;
  }
  return { ok: true, imported, seen: r.transfers.length };
}
