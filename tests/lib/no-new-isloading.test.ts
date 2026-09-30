import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * NO NEW `isLoading` ON A QUERY THAT CAN BE SWITCHED OFF.
 *
 * react-query v5: `isLoading === isPending && isFetching`. For a query
 * with `enabled: false` — or one that is paused because the browser is
 * offline — isFetching is false, so **isLoading is false while there
 * is no answer at all**. Every screen that branches on it then falls
 * straight past its loading state into its EMPTY state and says, with
 * confidence, that there is nothing: "No referrals yet", "Nothing
 * waiting on you", "you are not an affiliate".
 *
 * This file does NOT claim the list below is correct. It is the
 * opposite: a list of the places that still use the dangerous shape
 * and have NOT been read. It exists so the number can only go down —
 * a new file cannot join it without someone deleting a line here and
 * explaining why.
 *
 * ── WHY A DEBT LIST AND NOT A FIX ─────────────────────────────────
 *
 * The owner, 28-09: "hoelang moet ik door als jij steeds kritieke
 * fouten vindt". Because each sweep is scoped to one journey, it
 * re-finds this in whichever files it happens to open — 43 of them
 * carry it. Converting all 43 blind would trade a silent wrong answer
 * for a skeleton that never stops, which is worse: `isPending` stays
 * TRUE for ever on a query that never runs.
 *
 * So each one needs reading, and the honest move is to make the
 * remaining work countable instead of invisible. The right shape,
 * once read, is `isPending || !readWillRun` for "we do not know", and
 * `isPending && readWillRun` for a skeleton.
 *
 * TO REMOVE A LINE: fix the file, then delete its line here.
 */
const NOT_YET_READ = new Set<string>([
  "components/account-pool/psm-account-pool.tsx",
  "components/account/accounts-table.tsx",
  "components/ad-account-requests/create-ad-account-from-request-dialog.tsx",
  "components/admin/dashboard.tsx",
  "components/admin/users/psm-advertisers.tsx",
  "components/admin/users/user-affiliates.tsx",
  "components/advertiser/adv-app.tsx",
  "components/advertiser/affiliate-commissions-card.tsx",
  "components/affiliate/advertise-too-card.tsx",
  "components/affiliate/aff-app.tsx",
  "components/affiliate/affiliate-table.tsx",
  "components/affiliate/affiliates-book.tsx",
  "components/audit/use-audit-events.ts",
  "components/commissions/use-is-affiliate.ts",
  "components/dst/psm-dst.tsx",
  "components/fee-changes/fee-change-queue.tsx",
  "components/integrations/rockads-panel.tsx",
  "components/invites/invites-table.tsx",
  "components/notifications/notification-dialog.tsx",
  "components/notifications/use-notifications.ts",
  "components/promotions/promotions-manager.tsx",
  "components/promotions/psm-promotions.tsx",
  "components/subscriptions/create-subscription-dialog.tsx",
  "components/subscriptions/use-subscriptions.ts",
  "components/topups/account-topup-form.tsx",
  "components/topups/topup-details-sheet.tsx",
  "components/wallet-transactions/money-in-tabs.tsx",
  "components/wallet-transactions/wallet-transaction-details-sheet.tsx",
  "components/wallet/wallet-exchanges-table.tsx",
  "components/wallet/wallet-topup-details-sheet.tsx",
  "components/wallets/use-wallets.ts",
  "components/wallets/wallet-details-sheet.tsx",
  "components/withdrawals/precharge-panel.tsx",
  "components/withdrawals/psm-withdrawals.tsx",
  "hooks/use-account-spend.ts",
  "hooks/use-affiliate-earnings.ts",
  "hooks/use-affiliate-stats.ts",
  "hooks/use-matched-deposits.ts",
  "hooks/use-tenant.ts",
  "hooks/use-usd-to-eur.ts",
]);

const ROOTS = ["components", "hooks", "app"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

test("no NEW file reads isLoading off a query that can be switched off", () => {
  const offenders: string[] = [];

  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const rel = file.split("\\").join("/");
      if (NOT_YET_READ.has(rel)) continue;
      const text = readFileSync(file, "utf8");
      // Only files that actually have a switchable query.
      if (!text.includes("enabled:")) continue;

      // ── A COMMENT ABOUT THE BUG IS NOT THE BUG ──────────────────
      //
      // This scanned the whole file, comments included, and the house
      // style is to write down what went wrong where it went wrong.
      // So `use-pending-counts.ts` failed for a doc comment that
      // explains why its field is called isPending and not isLoading
      // — a test that punishes the explanation teaches people to
      // delete the explanation, which is the opposite of the point.
      const code = text
        .split("\n")
        .filter((l) => {
          const t = l.trim();
          return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
        })
        .join("\n");

      // `isLoading: isPending` is the correct rename and is not this.
      if (code.includes("isLoading: isPending")) continue;
      if (/^\s*isLoading,|isLoading:\s*[a-zA-Z]|\.isLoading/m.test(code)) {
        offenders.push(rel);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `isLoading is FALSE while a switched-off query has no answer at all, so the\n` +
      `screen falls through to its empty state and states there is nothing.\n` +
      `Use \`isPending || !readWillRun\` for "we do not know", or\n` +
      `\`isPending && readWillRun\` for a skeleton.\n\n` +
      offenders.join("\n"),
  );
});

test("the debt list only shrinks", () => {
  // If a file on the list no longer has the shape, its line is stale
  // and should be deleted — that is how the number goes down and stays
  // down.
  const stale: string[] = [];
  for (const rel of NOT_YET_READ) {
    let text = "";
    try {
      text = readFileSync(rel, "utf8");
    } catch {
      stale.push(`${rel}  (file is gone)`);
      continue;
    }
    const still =
      text.includes("enabled:") &&
      !text.includes("isLoading: isPending") &&
      /^\s*isLoading,|isLoading:\s*[a-zA-Z]|\.isLoading/m.test(text);
    if (!still) stale.push(`${rel}  (fixed — delete this line)`);
  }
  assert.deepEqual(stale, [], `\n${stale.join("\n")}`);
});
