import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Visual proof-of-life tour. Loads each key page per role and dumps
// a full-page PNG into playwright/screenshots/. Not a real
// assertion — just a way to eyeball what every role sees, matched
// to timestamps in the filename so you can compare across runs.
//
// Run with:
//   npx playwright test --project=super-admin --grep "screenshot tour"
//   npx playwright test --project=admin       --grep "screenshot tour"
//   npx playwright test --project=advertiser  --grep "screenshot tour"

const OUT = "playwright/screenshots";
mkdirSync(OUT, { recursive: true });

const PAGES: Record<string, { url: string; label: string }[]> = {
  "super-admin": [
    { url: "/dashboard",           label: "01-dashboard" },
    { url: "/users",               label: "02-users" },
    { url: "/accounts",            label: "03-accounts" },
    { url: "/top-ups",             label: "04-topups" },
    { url: "/ad-account-requests", label: "05-ad-account-requests" },
    { url: "/subscriptions",       label: "06-subscriptions" },
    { url: "/invoices",            label: "07-invoices" },
    { url: "/wallets",             label: "08-wallets" },
    { url: "/wallet-topups",       label: "09-wallet-topups" },
    { url: "/affiliates",          label: "10-affiliates" },
    { url: "/commissions",         label: "11-commissions" },
    { url: "/settings/finance",    label: "12-settings-finance" },
    { url: "/settings/general",    label: "13-settings-general" },
    { url: "/activity-logs",       label: "14-activity-logs" },
    { url: "/audit",               label: "15-audit" },
    { url: "/invites",             label: "16-invites" },
    { url: "/admins",              label: "17-admins" },
  ],
  admin: [
    { url: "/dashboard",           label: "01-dashboard" },
    { url: "/users",               label: "02-users" },
    { url: "/accounts",            label: "03-accounts" },
    { url: "/top-ups",             label: "04-topups" },
    { url: "/ad-account-requests", label: "05-ad-account-requests" },
    { url: "/subscriptions",       label: "06-subscriptions" },
    { url: "/invoices",            label: "07-invoices" },
    { url: "/wallets",             label: "08-wallets" },
    { url: "/wallet-topups",       label: "09-wallet-topups" },
  ],
  advertiser: [
    { url: "/dashboard",       label: "01-dashboard" },
    { url: "/accounts",        label: "02-accounts" },
    { url: "/top-ups",         label: "03-topups" },
    { url: "/my-subscription", label: "04-subscription" },
    { url: "/my-referrals",    label: "05-referrals" },
    { url: "/wallet",          label: "06-wallet" },
    { url: "/invoices",        label: "07-invoices" },
  ],
};

for (const [role, pages] of Object.entries(PAGES)) {
  test.describe(`screenshot tour — ${role}`, () => {
    // Match the project's storageState convention — this describe
    // block runs once per project (super-admin, admin, advertiser).
    // We filter to only run the tour for the current project by
    // checking the project name inside each test.
    for (const p of pages) {
      test(`${role}: ${p.label}`, async ({ page }, testInfo) => {
        if (testInfo.project.name !== role) {
          test.skip(true, `tour is scoped to project=${role}`);
          return;
        }
        await page.goto(p.url);
        await page.waitForTimeout(2500);
        await page.screenshot({
          path: `${OUT}/${role}-${p.label}.png`,
          fullPage: true,
        });
      });
    }
  });
}
