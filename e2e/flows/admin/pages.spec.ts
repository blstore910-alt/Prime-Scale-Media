import { test, expect } from "@playwright/test";

// Plain admin: same shape as super-admin's page coverage, minus the
// super-admin-only URLs which should REDIRECT (already asserted in
// shell.spec.ts). This just walks what an employee sees.

const PAGES = [
  { url: "/dashboard",           name: "Dashboard" },
  { url: "/users",               name: "Advertisers" },
  { url: "/accounts",            name: "Ad Accounts" },
  { url: "/top-ups",             name: "Topups" },
  { url: "/ad-account-requests", name: "Account Requests" },
  { url: "/subscriptions",       name: "Subscriptions" },
  { url: "/invoices",            name: "Invoices" },
  { url: "/wallets",             name: "Wallets" },
  { url: "/wallet-topups",       name: "Wallet Topups" },
] as const;

test.describe("admin — every allowed page loads", () => {
  for (const p of PAGES) {
    test(`${p.name} (${p.url})`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      const res = await page.goto(p.url);
      expect(res?.status(), `HTTP status for ${p.url}`).toBeLessThan(500);
      await expect(page).not.toHaveURL(/\/auth\//);
      await expect(page.locator("body")).toBeVisible();
      await page.waitForTimeout(1500);

      const buttonCount = await page.getByRole("button").count();
      const linkCount = await page.getByRole("link").count();
      console.log(
        `  ${p.name.padEnd(24)}  buttons=${buttonCount}  links=${linkCount}  console_errors=${consoleErrors.length}`,
      );
      expect(buttonCount + linkCount).toBeGreaterThan(0);
    });
  }
});
