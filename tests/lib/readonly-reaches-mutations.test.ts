import { strict as assert } from "node:assert";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";

/**
 * READ-ONLY HAS TO REACH THE ACTION, NOT JUST EXIST.
 *
 * `tests/lib/readonly-admin.test.ts` proves the capability exists and
 * that the check sits on the `freeze` branch of the shared resolver. It
 * passed all day while the switch was completely bypassed on the most
 * destructive customer action in the app.
 *
 * `actions/admin-actions.ts` resolves its own caller in a private
 * `resolveCaller()` instead of using `actions/_shared.ts`. So
 * `updateUserProfile` — the only live way to switch a paying customer
 * off — never read `admin_capabilities` at all. A read-only admin could
 * deactivate anyone, and the Permissions screen said they could not.
 * Eight action files carry a private resolver like that.
 *
 * THE RULE. An action file that WRITES and gates on an admin role must
 * reach `readOnlyRefusal` — either through the shared resolver, which
 * calls it, or by calling it itself. Writing your own resolver is
 * allowed; writing your own resolver and forgetting the switch is not.
 *
 * Self-service actions are exempt and listed by name below, because
 * read-only is a restriction on the DESK. A customer editing their own
 * company is not an admin doing an admin thing, and gating that on an
 * admin capability would lock a customer out of their own profile.
 */

const ACTIONS_DIR = path.join(process.cwd(), "actions");

/** Reaches the check, one way or the other. */
const REACHES =
  /resolveAdminContext\b|resolveOwnerContext\b|resolveCapability\b|requireAdminCtx\b|readOnlyRefusal\b/;

/** Writes something. `.rpc(` counts: most money writes are an RPC. */
const WRITES = /\.(update|insert|upsert|delete)\(|\.rpc\(/;

/**
 * Gates on being an admin. Either the role is compared directly, or a
 * local assert/require helper does it.
 */
const ADMIN_GATED =
  /role !== ["']admin["']|role === ["']admin["']|assertAdmin|assertSuperAdmin|requireAdmin|requireSuperAdmin|apiRequireAdmin|apiRequireOwner/;

/**
 * Exempt, with the reason. Every one of these is the customer or the
 * affiliate acting on their OWN row, or an owner-only path — and an
 * owner is exempt from read-only by design, because locking the last
 * person out is not repairable from a screen.
 *
 * Adding a file here is a decision about who the action belongs to, so
 * it needs a sentence, not just a filename.
 */
const SELF_SERVICE: Record<string, string> = {
  "affiliate-application-actions.ts":
    "a customer applying to become an affiliate, on their own row",
  "company-actions.ts":
    "saveOwnCompanyOnboarding / updateOwnProfileAndCompany — the customer's own company",
  "finance-report-actions.ts":
    "financeReportForMe / affiliateFinanceReportForMe — the caller's own figures",
  "gdpr-actions.ts":
    "owner-only throughout, and an owner can never be read-only",
  "notification-preference-actions.ts":
    "the caller's own notification settings",
  "payout-details-actions.ts": "the affiliate's own bank details",
  "tenant-actions.ts": "onboarding, creating the caller's own tenant",
};

/**
 * Strip comments and string literals before matching.
 *
 * WHY: the first version of this test matched the raw source, and the
 * seeded-failure check exposed it immediately — the fix was removed
 * from `admin-actions.ts` and the test still passed, because the
 * COMMENT above the fix says the word "readOnlyRefusal". A test that
 * is satisfied by prose describing the guard, rather than the guard,
 * is worse than no test: it reports that the hole is closed.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")   // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function actionFiles(): string[] {
  return fs
    .readdirSync(ACTIONS_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .sort();
}

test("every admin-gated action file that writes can be frozen by read-only", () => {
  const missing: string[] = [];

  for (const file of actionFiles()) {
    if (file in SELF_SERVICE) continue;
    const src = code(fs.readFileSync(path.join(ACTIONS_DIR, file), "utf8"));
    if (!WRITES.test(src)) continue;
    if (!ADMIN_GATED.test(src)) continue;
    if (REACHES.test(src)) continue;
    missing.push(file);
  }

  assert.deepEqual(
    missing,
    [],
    "These action files write, gate on an admin, and never reach " +
      "readOnlyRefusal — so a read-only admin can still act through " +
      "them. Either resolve the caller through actions/_shared.ts, or " +
      "call readOnlyRefusal() yourself after your own role check:\n  " +
      missing.join("\n  "),
  );
});

test("the exemption list is real files and gives a reason for each", () => {
  const present = new Set(actionFiles());
  for (const [file, reason] of Object.entries(SELF_SERVICE)) {
    assert.ok(
      present.has(file),
      `actions/${file} is on the read-only exemption list but no longer ` +
        `exists. Remove it from the list rather than leaving a name that ` +
        `stops matching anything.`,
    );
    assert.ok(
      reason.trim().length > 20,
      `actions/${file} is exempt without a real reason. Say who the ` +
        `action belongs to.`,
    );
  }
});

test("there is exactly one implementation of the read-only check", () => {
  // The bug was a second resolver that did not have it. The next one
  // will be a second COPY that drifts from this one. The predicate is
  // the thing that must exist once: the capability lookup.
  const roots = ["actions", "lib", "app"];
  const hits: string[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const src = code(fs.readFileSync(full, "utf8"));
      // The QUERY, not the word. `lib/capabilities.ts` names
      // "admin.readonly" because it declares the seventeen
      // capabilities, and the Permissions screen reads the whole table
      // to draw the switches — neither is a second enforcement point.
      // What may exist only once is the filtered lookup: asking
      // admin_capabilities for THIS ONE capability in order to decide
      // whether a write may proceed.
      if (/\.eq\(\s*["']capability["']\s*,\s*["']admin\.readonly["']/.test(src)) {
        hits.push(path.relative(process.cwd(), full).replace(/\\/g, "/"));
      }
    }
  };

  for (const r of roots) {
    const dir = path.join(process.cwd(), r);
    if (fs.existsSync(dir)) walk(dir);
  }

  assert.deepEqual(
    hits,
    ["actions/_shared.ts"],
    "The read-only lookup must live in actions/_shared.ts and nowhere " +
      "else. A second copy is how it came to be missing from " +
      "admin-actions.ts in the first place: import readOnlyRefusal " +
      "instead of rewriting it.\nFound in:\n  " + hits.join("\n  "),
  );
});
