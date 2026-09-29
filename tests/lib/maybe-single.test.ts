import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * maybeSingle() ON A FILTER THAT IS NOT UNIQUE.
 *
 * ── WHY THIS IS A TEST ────────────────────────────────────────────
 *
 * `maybeSingle()` reads as "give me one row, or none". It is not
 * that. On MORE than one row it returns PGRST116 with status 406 and
 * no data — an error — and a caller written for "or none" then reads
 * a real failure as "nothing found".
 *
 * This codebase has been bitten by it at least six separate times,
 * each written up afterwards in the file where it happened:
 *
 *   actions/company-actions.ts     a profile held in two tenants
 *   actions/exchange-rate-actions  two active rates
 *   actions/topup-actions.ts       two active rate rows
 *   lib/auth/finalize-signup.ts    the raw message reached a user
 *   app/api/invoices/…/pdf         two tenant issuers → every PDF 500s
 *   app/api/invoices/export        the same, on the export
 *
 * The last two were found on 29-09: deleting a test advertiser would
 * have turned their company into a second issuer and taken invoicing
 * down tenant-wide, permanently, for every real customer. Six
 * occurrences is not six mistakes. It is one mistake made six times,
 * and that is what a test is for.
 *
 * ── WHAT THIS CHECKS, AND WHAT IT DOES NOT CLAIM ──────────────────
 *
 * A call counts as safe when the chain filters on `id` or ends with
 * `.limit(1)`. Everything else is UNVERIFIED — which is not the same
 * as wrong. Plenty of the entries below filter on a composite that
 * really is unique (tenant_id + user_id), and those are fine. Nobody
 * has checked them; that is the claim, and it is the honest one.
 *
 * So this is a debt list, the same shape as
 * tests/lib/no-new-isloading.test.ts. It holds two lines:
 *
 *   1. no NEW file may use maybeSingle() on a non-unique filter
 *   2. the list may only shrink
 *
 * To take a file off it: add `.limit(1)` — with an `.order()` first,
 * so which row you get is a decision and not the planner's mood — or
 * filter on something genuinely unique, or satisfy yourself it cannot
 * match twice and write down why.
 */

/** Counted 29-09. A number may go DOWN; it may never go up. */
const UNVERIFIED = new Map<string, number>([
  ["actions/_fee-is-a-price.ts", 2],
  ["actions/bank-account-actions.ts", 1],
  ["actions/company-actions.ts", 6],
  ["actions/fee-default-actions.ts", 1],
  ["actions/finance-report-actions.ts", 3],
  ["actions/gdpr-actions.ts", 1],
  ["actions/supplier-pool-actions.ts", 1],
  ["actions/tenant-actions.ts", 2],
  ["actions/topup-actions.ts", 4],
  ["actions/withdrawal-actions.ts", 1],
  ["app/(app)/layout.tsx", 1],
  ["app/api/accept-invite/route.ts", 1],
  ["app/api/accept-invite/signup/route.ts", 1],
  ["app/api/invoices/[invoiceId]/pdf/route.ts", 2],
  ["app/api/payouts/[payoutId]/invoice/route.ts", 2],
  ["app/api/push/notify/route.ts", 1],
  ["app/api/push/subscribe/route.ts", 1],
  ["app/api/send-invite/route.ts", 1],
  ["app/api/stats/fees/route.ts", 1],
  ["app/api/stats/profit/route.ts", 1],
  ["app/api/stats/route.ts", 1],
  ["app/api/stats/topups/route.ts", 1],
  ["app/complete-profile/page.tsx", 1],
  ["app/invite/accept/page.tsx", 1],
  ["components/account-pool/psm-account-pool.tsx", 2],
  ["components/account/account-form.tsx", 1],
  ["components/account/ad-account-request-form.tsx", 3],
  ["components/ad-account-requests/ad-account-request-details-sheet.tsx", 1],
  ["components/ad-account-requests/create-ad-account-from-request-dialog.tsx", 1],
  ["components/ad-account-requests/use-create-ad-account-request-invoice.ts", 1],
  ["components/advertiser/adv-app.tsx", 5],
  ["components/affiliate/payout-minimum-card.tsx", 1],
  ["components/notifications/notification-dialog.tsx", 1],
  ["components/onboard/organization-form.tsx", 1],
  ["components/settings/use-profile-data.ts", 2],
  ["components/topups/account-topup-form.tsx", 1],
  ["components/wallet-transactions/wallet-transaction-details-sheet.tsx", 1],
  ["components/wallet/wallet-topup-details-sheet.tsx", 1],
  ["components/withdrawals/psm-withdrawals.tsx", 1],
  ["hooks/use-ad-account-cost.ts", 1],
  ["hooks/use-poll.ts", 1],
  ["hooks/use-usd-to-eur.ts", 1],
  ["lib/auth/finalize-signup.ts", 2],
  ["lib/integrations/enqueue.ts", 5],
]);

const ROOTS = ["actions", "app", "components", "hooks", "lib"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Every maybeSingle() whose chain is not narrowed to one row. */
function countUnverified(text: string): number {
  const lines = text.split("\n");
  let n = 0;
  lines.forEach((line, i) => {
    if (!line.includes("maybeSingle()")) return;
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*")) return;

    // Walk back to the .from( that started this chain.
    const back: string[] = [];
    for (let j = i; j >= 0 && j > i - 25; j--) {
      back.unshift(lines[j]);
      if (lines[j].includes(".from(")) break;
    }
    const chain = back.join("\n");
    if (/\.eq\(\s*["'`]id["'`]/.test(chain)) return;
    if (chain.includes(".limit(1)")) return;
    n += 1;
  });
  return n;
}

function scan(): Map<string, number> {
  const found = new Map<string, number>();
  for (const root of ROOTS) {
    let files: string[];
    try {
      files = walk(root);
    } catch {
      continue;
    }
    for (const file of files) {
      const rel = file.split("\\").join("/");
      const n = countUnverified(readFileSync(file, "utf8"));
      if (n > 0) found.set(rel, n);
    }
  }
  return found;
}

test("no NEW file calls maybeSingle() on a filter that is not unique", () => {
  const found = scan();
  const fresh = [...found.keys()].filter((f) => !UNVERIFIED.has(f)).sort();

  assert.deepEqual(
    fresh,
    [],
    "maybeSingle() ERRORS on more than one row — it does not hand back " +
      "the first one. A caller written for 'one or none' then reads a " +
      "real error as 'nothing found', which is how two tenant issuers " +
      "took every invoice PDF down on 29-09.\n\n" +
      "Add .limit(1), with an .order() so which row you get is a " +
      "decision, or filter on something unique.\n\n" +
      fresh.join("\n"),
  );
});

test("the unverified list only shrinks", () => {
  const found = scan();
  const grown: string[] = [];
  for (const [file, was] of UNVERIFIED) {
    const now = found.get(file) ?? 0;
    if (now > was) grown.push(file + ": was " + was + ", now " + now);
  }
  assert.deepEqual(
    grown,
    [],
    "These files already had unverified maybeSingle() calls and now " +
      "have MORE. The list is a debt to pay down, not a budget to " +
      "spend.\n\n" +
      grown.join("\n"),
  );
});
