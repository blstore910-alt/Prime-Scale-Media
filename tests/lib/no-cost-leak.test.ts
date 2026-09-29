import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * WHAT WE PAY IS NOT WHAT WE CHARGE.
 *
 * ── THE RULE, IN THE OWNER'S WORDS ────────────────────────────────
 *
 * Supplier cost and our margin belong in an admin-only table. A
 * customer-readable row must never carry them, and neither must a row
 * a plain admin reads — the desk needs the fee we CHARGE to do its
 * work, and never the one we PAY.
 *
 * ── TWICE ON THE SAME VIEW ────────────────────────────────────────
 *
 * `referral_commissions_with_details` carries `supplier_cost` and
 * `supplier_fee_pct`. Two screens read it with `select("*")`:
 *
 *   components/admin/users/user-affiliates.tsx   found and fixed 29-09
 *   components/commissions/use-commissions.ts    found and fixed 29-09
 *
 * The first was caught by an agent; the second was missed for half a
 * day, on the same view, with the same wildcard. Neither screen
 * renders either column — they took them because `*` takes
 * everything, including whatever somebody adds to the view next year.
 *
 * ── WHAT THIS CHECKS ──────────────────────────────────────────────
 *
 * No client-side read may select `*` from a relation known to carry
 * cost. That is a small, exact rule: it does not try to judge every
 * wildcard in the codebase, only the ones pointed at a table or view
 * that is known to hold the buying price.
 *
 * Add to COST_BEARING when a new one appears. The database side is
 * held separately, by the policies plak 154 put on
 * `ad_account_costs` and `ad_account_type_suppliers`.
 */

/** Relations that carry what we pay, measured 29-09. */
const COST_BEARING = [
  "referral_commissions_with_details",
  "ad_account_costs",
  "ad_account_type_suppliers",
];

const ROOTS = ["components", "hooks", "app", "actions", "lib"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

test("nothing selects * from a relation that carries our buying price", () => {
  const offenders: string[] = [];

  for (const root of ROOTS) {
    let files: string[];
    try {
      files = walk(root);
    } catch {
      continue;
    }
    for (const file of files) {
      const rel = file.split("\\").join("/");
      const text = readFileSync(file, "utf8");
      const lines = text.split("\n");

      lines.forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
        if (!/\.select\(\s*["'`]\*/.test(line)) return;

        // Which relation did this chain come from? Look back for the
        // .from(, and forward a little in case the select is chained
        // on the next line.
        const around = lines
          .slice(Math.max(0, i - 6), i + 2)
          .join("\n");
        for (const relation of COST_BEARING) {
          if (around.includes(`"${relation}"`) || around.includes(`'${relation}'`)) {
            offenders.push(`${rel}:${i + 1}  select * from ${relation}`);
          }
        }
      });
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "These relations carry supplier_cost / supplier_fee_pct — what we\n" +
      "pay, and therefore our margin. `select(\"*\")` hands that to\n" +
      "whoever opens the screen, and no screen in this app renders it.\n\n" +
      "Name the columns you actually use. It is not longer to read, only\n" +
      "longer to type, and it stops the next column somebody adds to the\n" +
      "view from riding along.\n\n" +
      offenders.join("\n"),
  );
});

test("the list of cost-bearing relations is not empty", () => {
  // A guard against somebody "fixing" a failure by emptying the list.
  assert.ok(COST_BEARING.length >= 3);
  assert.ok(COST_BEARING.includes("referral_commissions_with_details"));
});
