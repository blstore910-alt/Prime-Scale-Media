import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * THE ISSUER IS LOOKED UP IN ONE PLACE.
 *
 * ── WHY ───────────────────────────────────────────────────────────
 *
 * `companies` holds one row per tenant with `advertiser_id IS NULL` —
 * the tenant's own details, printed as the sender on every invoice.
 * Seven places asked for it with
 *
 *     .eq("tenant_id", t).is("advertiser_id", null).maybeSingle()
 *
 * and `maybeSingle()` does not mean "one of them". On more than one
 * row it returns PGRST116 / 406 with no data — an error.
 *
 * There is one such row today, so it looked safe. But
 * `companies.advertiser_id` is ON DELETE SET NULL: delete an
 * advertiser and their company becomes a second issuer. Measured
 * 29-09, the real tenant had 1 issuer and 11 customer companies, all
 * eleven belonging to the test accounts queued for deletion. Clearing
 * them out would have given twelve issuers and, from that moment:
 *
 *   - every invoice PDF 500s, for every customer, permanently
 *   - the invoice export 500s
 *   - the admin Settings screen throws
 *   - and `saveTenantCompany` swallowed the error, found nothing, and
 *     INSERTED ANOTHER issuer on every save
 *
 * The deletion was the trigger; the fault was seven copies of a
 * question that has no single answer. `lib/tenant-issuer.ts` orders
 * and takes one, so more than one row can never be an error again.
 */

const ROOTS = ["actions", "app", "components", "hooks", "lib"];

const ALLOWED = new Set<string>([
  // The one implementation.
  "lib/tenant-issuer.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

test("nobody reads the tenant issuer with maybeSingle any more", () => {
  const offenders: string[] = [];

  for (const root of ROOTS) {
    let files: string[];
    try {
      files = walk(root);
    } catch {
      continue;
    }
    for (const file of files) {
      const rel = file.replace(/\\/g, "/");
      if (ALLOWED.has(rel)) continue;
      const text = readFileSync(file, "utf8");
      if (!text.includes('.is("advertiser_id", null)')) continue;

      // Only a READ of `companies`. The same filter on an UPDATE's
      // where clause is a guard, not a lookup, and the pool table has
      // its own unrelated advertiser_id.
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        if (!line.includes('.is("advertiser_id", null)')) return;
        // Look back for what this chain started from.
        const before = lines.slice(Math.max(0, i - 12), i).join("\n");
        if (!/\.from\(\s*["']companies["']\s*\)/.test(before)) return;
        if (/\.update\(|\.upsert\(|\.delete\(/.test(before)) return;
        // And forward for the dangerous ending.
        const after = lines.slice(i, i + 4).join("\n");
        if (!/maybeSingle\(\)|\.single\(\)/.test(after)) return;
        offenders.push(`${rel}:${i + 1}`);
      });
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `maybeSingle() ERRORS when a tenant has more than one issuer row, and it\n` +
      `can get one: companies.advertiser_id is ON DELETE SET NULL, so deleting\n` +
      `an advertiser turns their company into a second issuer. That takes\n` +
      `invoicing down tenant-wide.\n\n` +
      `Use: await tenantIssuerCompany(supabase, tenantId, columns)\n` +
      `from lib/tenant-issuer.ts\n\n` +
      offenders.join("\n"),
  );
});
