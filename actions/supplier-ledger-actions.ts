"use server";

// ── HET DAGSALDO BIJ EEN HANDMATIGE LEVERANCIER ─────────────────────
//
// Plak 185. Zie lib/pure-supplier-ledger.ts voor de rekenregels en de
// vraag van de eigenaar. Dit bestand leest en schrijft de twee tabellen,
// en telt de top-ups uit de app zelf er automatisch bij: elke voltooide
// top-up op een ad account waarvan het type bij deze leverancier hoort
// (ad_account_type_suppliers.supplier_label), in USD zoals hij landde,
// met de fee volgens "We pay %".
//
// Alleen de beheerkant. Schrijven met de service-sleutel, NA
// resolveAdminContext (maintenance, read-only-schakelaar, rol), met de
// tenant uit de sessie en een kolom-allowlist.

import { resolveAdminContext } from "./_shared";
import { createAdminClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
import { amsterdamYmd } from "@/lib/pure-backup";
import type { DayBalance, LedgerLine, LineKind } from "@/lib/pure-supplier-ledger";

const SOORTEN: LineKind[] = ["deposit", "customer_topup", "fee", "dst", "adjustment"];

const dagVan = (iso: string) => {
  const { y, m, day } = amsterdamYmd(new Date(iso));
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const ontbreekt = (e: { message?: string } | null) =>
  !!e && /does not exist|schema cache/i.test(String(e.message ?? ""));

export type SupplierLedgerData = {
  supplier: string;
  suppliers: string[];
  lines: LedgerLine[];
  balances: DayBalance[];
  plakNodig: boolean;
};

/** De leveranciers waar handmatig voor geboekt wordt: alles met een
 *  supplier_label op een type zonder API. */
async function handmatigeLeveranciers(db: Awaited<ReturnType<typeof createAdminClient>>, tenantId: string) {
  const { data } = await db
    .from("ad_account_type_suppliers")
    .select("supplier_label, supplier_fee_pct, ad_account_types!inner(slug, api_topup_enabled)")
    .eq("tenant_id", tenantId);
  const rijen = (data ?? []) as unknown as {
    supplier_label: string | null;
    supplier_fee_pct: number | null;
    ad_account_types: { slug: string; api_topup_enabled: boolean } | { slug: string; api_topup_enabled: boolean }[];
  }[];
  const per = new Map<string, { slugs: string[]; feePct: number | null }>();
  for (const r of rijen) {
    const naam = (r.supplier_label ?? "").trim();
    if (!naam) continue;
    const t = Array.isArray(r.ad_account_types) ? r.ad_account_types[0] : r.ad_account_types;
    if (!t || t.api_topup_enabled) continue;
    const cur = per.get(naam) ?? { slugs: [], feePct: r.supplier_fee_pct };
    cur.slugs.push(t.slug);
    per.set(naam, cur);
  }
  return per;
}

export async function getSupplierLedger(
  supplier?: string | null,
): Promise<{ ok: true; data: SupplierLedgerData } | { ok: false; error: string }> {
  const res0 = await resolveAdminContext();
  if (!res0.ok) return { ok: false, error: res0.error };
  const tenantId = res0.ctx.profile.tenant_id as string;
  const db = await createAdminClient();

  const per = await handmatigeLeveranciers(db, tenantId);
  const suppliers = Array.from(per.keys()).sort();
  const naam = (supplier && per.has(supplier) ? supplier : suppliers[0]) ?? "";
  if (!naam) return { ok: true, data: { supplier: "", suppliers, lines: [], balances: [], plakNodig: false } };

  let plakNodig = false;
  const { data: lijn, error: lErr } = await db
    .from("supplier_ledger_lines")
    .select("id, day, kind, amount, client_ref, note")
    .eq("tenant_id", tenantId)
    .eq("supplier", naam)
    .order("day", { ascending: true })
    .order("created_at", { ascending: true });
  if (lErr && !ontbreekt(lErr)) return { ok: false, error: safeErrorMessage(lErr) };
  if (lErr) plakNodig = true;

  const { data: bal, error: bErr } = await db
    .from("supplier_day_balances")
    .select("day, actual_end, note")
    .eq("tenant_id", tenantId)
    .eq("supplier", naam);
  if (bErr && !ontbreekt(bErr)) return { ok: false, error: safeErrorMessage(bErr) };
  if (bErr) plakNodig = true;

  const lines: LedgerLine[] = ((lijn ?? []) as {
    id: string;
    day: string;
    kind: LineKind;
    amount: number | string;
    client_ref: string | null;
    note: string | null;
  }[]).map((l) => ({
    id: l.id,
    day: String(l.day).slice(0, 10),
    kind: l.kind,
    amount: Number(l.amount),
    clientRef: l.client_ref,
    note: l.note,
    source: "manual",
  }));

  // De top-ups uit de app zelf, op accounts van deze leverancier.
  const info = per.get(naam)!;
  if (info.slugs.length) {
    const { data: accts } = await db
      .from("ad_accounts")
      .select("id, name, advertiser:advertisers(tenant_client_code)")
      .eq("tenant_id", tenantId)
      .in("platform", info.slugs);
    const accIds = (accts ?? []).map((a: { id: string }) => a.id);
    const codeVan = new Map(
      ((accts ?? []) as unknown as { id: string; advertiser?: { tenant_client_code?: string | null } | null }[]).map((a) => [
        a.id,
        a.advertiser?.tenant_client_code ?? null,
      ]),
    );
    if (accIds.length) {
      const { data: tops } = await db
        .from("top_ups")
        .select("id, account_id, topup_usd, verified_at, number")
        .in("account_id", accIds)
        .eq("status", "completed");
      for (const t of (tops ?? []) as {
        id: string;
        account_id: string;
        topup_usd: number | string | null;
        verified_at: string | null;
        number: string | number | null;
      }[]) {
        const usd = Number(t.topup_usd ?? 0);
        if (!t.verified_at || !(usd > 0)) continue;
        const day = dagVan(t.verified_at);
        lines.push({
          id: `app-${t.id}`,
          day,
          kind: "customer_topup",
          amount: usd,
          clientRef: codeVan.get(t.account_id) ?? null,
          note: `app top-up${t.number ? ` #${t.number}` : ""}`,
          source: "app",
        });
        const pct = Number(info.feePct ?? 0);
        if (pct > 0) {
          lines.push({
            id: `appfee-${t.id}`,
            day,
            kind: "fee",
            amount: Math.round(usd * pct) / 100,
            clientRef: codeVan.get(t.account_id) ?? null,
            note: `${pct}% supplier fee`,
            source: "app",
          });
        }
      }
    }
  }

  const balances: DayBalance[] = ((bal ?? []) as { day: string; actual_end: number | string; note: string | null }[]).map(
    (b) => ({ day: String(b.day).slice(0, 10), actualEnd: Number(b.actual_end), note: b.note }),
  );
  return { ok: true, data: { supplier: naam, suppliers, lines, balances, plakNodig } };
}

export async function addSupplierLine(input: {
  supplier: string;
  day: string;
  kind: string;
  amount: number | string;
  clientRef?: string | null;
  note?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res0 = await resolveAdminContext();
  if (!res0.ok) return { ok: false, error: res0.error };
  const tenantId = res0.ctx.profile.tenant_id as string;
  const supplier = String(input?.supplier ?? "").trim().slice(0, 40);
  const day = String(input?.day ?? "");
  const kind = String(input?.kind ?? "") as LineKind;
  const amount = Math.round(Number(input?.amount) * 100) / 100;
  if (!supplier) return { ok: false, error: "Which supplier?" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: "Pick a day." };
  if (!SOORTEN.includes(kind)) return { ok: false, error: "Pick what this line is." };
  if (!(amount > 0)) return { ok: false, error: "The amount has to be above zero." };
  const db = await createAdminClient();
  const { error } = await db.from("supplier_ledger_lines").insert({
    tenant_id: tenantId,
    supplier,
    day,
    kind,
    amount,
    currency: "USD",
    client_ref: String(input?.clientRef ?? "").trim().slice(0, 40) || null,
    note: String(input?.note ?? "").trim().slice(0, 300) || null,
    created_by: res0.ctx.profile.id,
  });
  if (error) return { ok: false, error: ontbreekt(error) ? "Run plak 185 first." : safeErrorMessage(error) };
  return { ok: true };
}

export async function deleteSupplierLine(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const res0 = await resolveAdminContext();
  if (!res0.ok) return { ok: false, error: res0.error };
  const tenantId = res0.ctx.profile.tenant_id as string;
  const db = await createAdminClient();
  const { data, error } = await db
    .from("supplier_ledger_lines")
    .delete()
    .eq("id", String(id ?? ""))
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) return { ok: false, error: safeErrorMessage(error) };
  if (!(data ?? []).length) return { ok: false, error: "That line was not found." };
  return { ok: true };
}

export async function setSupplierDayBalance(input: {
  supplier: string;
  day: string;
  actualEnd: number | string;
  note?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res0 = await resolveAdminContext();
  if (!res0.ok) return { ok: false, error: res0.error };
  const tenantId = res0.ctx.profile.tenant_id as string;
  const supplier = String(input?.supplier ?? "").trim().slice(0, 40);
  const day = String(input?.day ?? "");
  const actual = Math.round(Number(input?.actualEnd) * 100) / 100;
  if (!supplier || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: "Pick a supplier and a day." };
  if (!Number.isFinite(actual)) return { ok: false, error: "Type the balance their dashboard shows." };
  const db = await createAdminClient();
  const { error } = await db.from("supplier_day_balances").upsert(
    {
      tenant_id: tenantId,
      supplier,
      day,
      actual_end: actual,
      currency: "USD",
      note: String(input?.note ?? "").trim().slice(0, 300) || null,
      created_by: res0.ctx.profile.id,
    },
    { onConflict: "tenant_id,supplier,day" },
  );
  if (error) return { ok: false, error: ontbreekt(error) ? "Run plak 185 first." : safeErrorMessage(error) };
  return { ok: true };
}
