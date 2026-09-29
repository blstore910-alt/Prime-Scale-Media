import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * OWNERSHIP IS TESTED IN ONE PLACE.
 *
 * ── WHY THIS IS A TEST AND NOT A NOTE ─────────────────────────────
 *
 * `tenants.owner_id` held one uuid. The owner has a business partner,
 * so ownership became a set (plak 143). Updating the two shared
 * guards looked like the whole job; it was not. Counted 29-09, the
 * check was written out by hand in about twenty more places, in five
 * different spellings:
 *
 *     tenant.owner_id !== profile.user_id
 *     (ownerRow as { owner_id: string | null }).owner_id !== profile.user_id
 *     !!tenant?.owner_id && tenant.owner_id === profile.user_id
 *     tenantRow?.owner_id === user.id
 *     .eq("owner_id", userId)
 *
 * Every one of those that stayed behind is a door the second owner
 * walks up to and cannot open — and that is the worst possible shape
 * for this bug. Not a refusal at the front door, which is obvious,
 * but a full menu where every button says "Forbidden".
 *
 * So: one function, `lib/auth/is-tenant-owner.ts`, and this test
 * stops the twenty-first copy being written.
 */

const ROOTS = ["actions", "app", "lib", "hooks", "components"];

/** Places where reading or writing `owner_id` is the point. */
const ALLOWED = new Set<string>([
  // The one implementation. It is allowed to look at the column.
  "lib/auth/is-tenant-owner.ts",
  // The two guards that had it first and still read the column as the
  // fast path before consulting the table.
  "actions/_shared.ts",
  "lib/auth/require-super-admin.ts",
  // A fee is a price: this reads the column, then the table.
  "actions/_fee-is-a-price.ts",
  // Creating a tenant SETS owner_id. That is not a permission check.
  "actions/tenant-actions.ts",
  "lib/auth/finalize-signup.ts",
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

test("nobody compares owner_id by hand any more", () => {
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

      text.split("\n").forEach((line, i) => {
        const bare = line.trim();
        // The comments in this codebase quote the bug on purpose.
        if (
          bare.startsWith("//") ||
          bare.startsWith("*") ||
          bare.startsWith("/*")
        ) {
          return;
        }
        // A comparison against owner_id is a permission check somebody
        // wrote out by hand.
        if (/\bowner_id\b[^\n]*[!=]==/.test(line) || /[!=]==[^\n]*\bowner_id\b/.test(line)) {
          offenders.push(`${rel}:${i + 1}  ${bare.slice(0, 96)}`);
        }
      });
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Ownership is a SET, not a column — the owner has a business partner.\n` +
      `Comparing tenants.owner_id by hand means the second owner is refused\n` +
      `HERE while passing everywhere else, which is a menu full of buttons\n` +
      `that each say "Forbidden".\n\n` +
      `Use: await isTenantOwner(supabase, tenantId, userId)\n` +
      `from lib/auth/is-tenant-owner.ts\n\n` +
      offenders.join("\n"),
  );
});

test("the client does not decide ownership from the column alone", () => {
  // `tenant?.owner_id === user?.id` in a component hides the Owner menu
  // from the second owner. The server list reaches the client as
  // `ownerIds` (app/(app)/layout.tsx), and context/app-provider.tsx is
  // the one place allowed to fold the two together.
  const offenders: string[] = [];
  for (const root of ["components", "hooks", "app"]) {
    let files: string[];
    try {
      files = walk(root);
    } catch {
      continue;
    }
    for (const file of files) {
      const rel = file.replace(/\\/g, "/");
      if (rel === "context/app-provider.tsx") continue;
      const text = readFileSync(file, "utf8");
      if (!text.startsWith('"use client"') && !text.includes('"use client"')) continue;
      text.split("\n").forEach((line, i) => {
        const bare = line.trim();
        if (bare.startsWith("//") || bare.startsWith("*")) return;
        if (/owner_id\s*===|===\s*[\w.?]*owner_id/.test(line)) {
          offenders.push(`${rel}:${i + 1}  ${bare.slice(0, 96)}`);
        }
      });
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `A client component deciding ownership from tenants.owner_id hides the\n` +
      `Owner menu from the second owner. Use the isSuperAdmin flag from\n` +
      `useAppContext(), which folds in tenant_owners.\n\n` +
      offenders.join("\n"),
  );
});
