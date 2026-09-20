import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { syncSupplierPool } from "../../lib/integrations/sync-pool.ts";

// A minimal Supabase stand-in. Only the two calls syncSupplierPool makes:
// a select of what we already hold, and a chunked upsert.
function fakeSupabase(opts: {
  existing?: Array<{ external_id: string; status: string | null }>;
  existingError?: { message: string } | null;
  upsertError?: { message: string } | null;
}) {
  const upserted: Record<string, unknown>[] = [];
  const api = {
    from() {
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        // The mirror read is paged now: an unpaged select was capped at
        // 1,000 rows in an unspecified order, which announced every
        // account past the cap as new AND blanked its stored
        // fee_percentage on the upsert.
        order() {
          return chain;
        },
        range(from: number) {
          return Promise.resolve({
            data: opts.existingError
              ? null
              : from === 0
                ? (opts.existing ?? [])
                : [],
            error: opts.existingError ?? null,
          });
        },
        upsert(rows: Record<string, unknown>[]) {
          if (!opts.upsertError) upserted.push(...rows);
          return Promise.resolve({ error: opts.upsertError ?? null });
        },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
          return Promise.resolve({
            data: opts.existingError ? null : (opts.existing ?? []),
            error: opts.existingError ?? null,
          }).then(res, rej);
        },
      };
      return chain;
    },
  };
  return { supabase: api, upserted };
}

function adapter(accounts: unknown[]) {
  return {
    listAdAccounts: async () => ({ ok: true as const, data: accounts }),
  };
}

const ACC = (external_id: string, status: string | null) => ({
  external_id,
  status,
  name: `Account ${external_id}`,
  bm_id: null,
  platform: "meta",
  currency: "USD",
  timezone: null,
  fee_percentage: null,
  balance_cents: null,
  assigned_to: null,
});

describe("syncSupplierPool — what changed", () => {
  it("reports accounts we have never seen as new", async () => {
    const { supabase } = fakeSupabase({ existing: [{ external_id: "a", status: "active" }] });
    const res = await syncSupplierPool(
      supabase as never,
      adapter([ACC("a", "active"), ACC("b", "active")]) as never,
      "tenant-1",
    );
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.deepEqual(res.data.newExternalIds, ["b"]);
    assert.deepEqual(res.data.statusChanges, []);
  });

  it("reports a status change with both values", async () => {
    const { supabase } = fakeSupabase({ existing: [{ external_id: "a", status: "active" }] });
    const res = await syncSupplierPool(
      supabase as never,
      adapter([ACC("a", "suspended")]) as never,
      "tenant-1",
    );
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.deepEqual(res.data.newExternalIds, []);
    assert.deepEqual(res.data.statusChanges, [
      { externalId: "a", from: "active", to: "suspended" },
    ]);
  });

  // The one that matters. A failed read of what we already hold leaves the
  // "before" map empty, which would make every account look brand new — a
  // notification per admin announcing hundreds of new accounts that have been
  // there for weeks, every fifteen minutes, for as long as the read keeps
  // failing. Not knowing what changed must report nothing, not everything.
  it("reports NOTHING as new when it could not read what we already hold", async () => {
    const { supabase, upserted } = fakeSupabase({
      existingError: { message: "connection reset" },
    });
    const res = await syncSupplierPool(
      supabase as never,
      adapter([ACC("a", "active"), ACC("b", "active"), ACC("c", "active")]) as never,
      "tenant-1",
    );
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.deepEqual(res.data.newExternalIds, []);
    assert.deepEqual(res.data.statusChanges, []);
    // The mirror is still refreshed — keeping the pool current matters more
    // than reporting on it.
    assert.equal(upserted.length, 3);
  });

  it("de-duplicates the supplier's own repeats before writing", async () => {
    // One INSERT … ON CONFLICT naming the same key twice aborts the whole
    // statement with 21000, taking every good row with it.
    const { supabase, upserted } = fakeSupabase({ existing: [] });
    const res = await syncSupplierPool(
      supabase as never,
      adapter([ACC("a", "active"), ACC("a", "paused")]) as never,
      "tenant-1",
    );
    assert.equal(res.ok, true);
    assert.equal(upserted.length, 1);
    assert.equal(upserted[0].status, "paused", "last write wins");
  });
});
