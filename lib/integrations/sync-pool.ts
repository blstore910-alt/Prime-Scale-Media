import type { SupabaseClient } from "@supabase/supabase-js";
import { safeErrorMessage } from "@/lib/pure-error";
import type { Supplier1Adapter } from "@/lib/integrations/types";

export type PoolSyncResult = {
  fetched: number;
  upserted: number;
  /** external_ids that were not in the pool before this run. */
  newExternalIds: string[];
  /** external_ids whose status changed, with both values. */
  statusChanges: Array<{ externalId: string; from: string | null; to: string | null }>;
};

/**
 * Pull the supplier's ad-account inventory into `supplier_ad_accounts`.
 *
 * This used to live only inside the server action behind the Sync button, so
 * the pool was only ever as fresh as the last time somebody clicked. The
 * worker had a `sync_ad_accounts` job, but it merely fetched the list and
 * returned it in `result` — it wrote nothing — so scheduling it changed
 * nothing either. Both paths call this now.
 *
 * Read-only against the supplier, so it is NOT behind the auto-push gate:
 * SUPPLIER1_MODE=live is enough. Knowing what inventory exists is exactly the
 * thing we want working long before we trust the write path.
 */
export async function syncSupplierPool(
  supabase: Pick<SupabaseClient, "from">,
  adapter: Supplier1Adapter,
  tenantId: string,
): Promise<{ ok: true; data: PoolSyncResult } | { ok: false; error: string }> {
  const res = await adapter.listAdAccounts();
  if (!res.ok) return { ok: false, error: `Supplier sync failed: ${res.error}` };

  const accounts = res.data ?? [];
  if (accounts.length === 0) {
    return {
      ok: true,
      data: { fetched: 0, upserted: 0, newExternalIds: [], statusChanges: [] },
    };
  }

  // What we hold now, so the caller can be told what actually CHANGED rather
  // than just how many rows were written. "47 accounts synced" is noise; "2
  // new, 1 suspended" is the thing an admin needs to see.
  const { data: existingRows, error: existingError } = await supabase
    .from("supplier_ad_accounts")
    .select("external_id, status")
    .eq("tenant_id", tenantId)
    .eq("provider", "supplier1");

  // If this read fails, `before` is EMPTY — and an empty before means every
  // account the supplier returns looks brand new. On a tenant with a few
  // hundred pooled accounts that is a notification per admin announcing
  // hundreds of "new" accounts that have been there for weeks, every fifteen
  // minutes for as long as the read keeps failing.
  //
  // So a failed read means we do not KNOW what changed, and the honest thing
  // is to say nothing about it. The upsert below still runs — refreshing the
  // mirror matters more than reporting on it.
  const knowsBefore = !existingError;
  const before = new Map<string, string | null>();
  if (knowsBefore) {
    for (const r of (existingRows ?? []) as Array<{
      external_id: string;
      status: string | null;
    }>) {
      before.set(r.external_id, r.status ?? null);
    }
  }

  const nowIso = new Date().toISOString();

  // De-duplicate on external_id BEFORE writing. supabase-js sends an upsert as
  // one INSERT … ON CONFLICT DO UPDATE, and Postgres aborts the whole
  // statement with 21000 ("cannot affect row a second time") if the payload
  // names the same conflict key twice — so one duplicated row from the
  // supplier's pagination would discard every good row with it. The adapter
  // pages until page >= total_pages with no de-dup of its own, so drift from a
  // supplier-side insert mid-sync is enough to trigger it. Last write wins.
  const byExternalId = new Map<string, Record<string, unknown>>();
  const newExternalIds: string[] = [];
  const statusChanges: PoolSyncResult["statusChanges"] = [];

  for (const a of accounts) {
    if (!a.external_id) continue;
    if (!knowsBefore) {
      // Deliberately reports nothing rather than everything.
    } else if (!before.has(a.external_id)) {
      newExternalIds.push(a.external_id);
    } else if ((before.get(a.external_id) ?? null) !== (a.status ?? null)) {
      statusChanges.push({
        externalId: a.external_id,
        from: before.get(a.external_id) ?? null,
        to: a.status ?? null,
      });
    }
    byExternalId.set(a.external_id, {
      tenant_id: tenantId,
      provider: "supplier1",
      external_id: a.external_id,
      name: a.name ?? null,
      bm_id: a.bm_id ?? null,
      platform: a.platform ?? null,
      currency: a.currency ?? null,
      timezone: a.timezone ?? null,
      status: a.status ?? null,
      fee_percentage: a.fee_percentage ?? null,
      balance_cents: a.balance_cents ?? null,
      supplier_assigned_to: a.assigned_to ?? null,
      raw: a as unknown as Record<string, unknown>,
      synced_at: nowIso,
    });
  }
  const rows = [...byExternalId.values()];

  // Chunked so a large inventory doesn't become one oversized statement.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from("supplier_ad_accounts")
      .upsert(rows.slice(i, i + CHUNK), {
        onConflict: "tenant_id,provider,external_id",
      });
    if (error) {
      console.error("supplier pool upsert failed:", safeErrorMessage(error));
      return { ok: false, error: error.message };
    }
  }

  return {
    ok: true,
    data: {
      fetched: accounts.length,
      upserted: rows.length,
      newExternalIds,
      statusChanges,
    },
  };
}
