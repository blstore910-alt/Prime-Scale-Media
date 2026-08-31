import { test, expect } from "@playwright/test";

// Every super-admin sidebar page: does it load without a redirect
// to /auth/ and without a server-side crash?
// Also: how many action buttons render, so a page suddenly losing
// its "New / Approve / Verify / Export" affordances shows up as a
// count regression.

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
  { url: "/withdrawals",         name: "Withdrawals & Precharge" },
  { url: "/affiliates",          name: "Referral Links" },
  { url: "/commissions",         name: "Referral Commissions" },
  { url: "/settings/finance",    name: "Finance Settings" },
  { url: "/settings/general",    name: "General Settings" },
  { url: "/activity-logs",       name: "Activity Logs" },
  { url: "/audit",               name: "Audit Log" },
  { url: "/invites",             name: "Invites" },
  { url: "/admins",              name: "Admins" },
] as const;

test.describe("super-admin — every page loads", () => {
  for (const p of PAGES) {
    test(`${p.name} (${p.url})`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      const res = await page.goto(p.url);
      // A hard server error would be 5xx. 200/307/404 are all fine
      // here (some pages redirect to /dashboard on empty state; a
      // fresh tenant may not have every page's dependencies).
      expect(res?.status(), `HTTP status for ${p.url}`).toBeLessThan(500);

      // We must land inside the app shell — no bounce back to
      // /auth/*.
      await expect(page).not.toHaveURL(/\/auth\//);

      // Body renders (protects against a blank white screen from a
      // client-side render throw).
      await expect(page.locator("body")).toBeVisible();
      // Wait a beat for hydration + first data query.
      await page.waitForTimeout(1500);

      // Count actionable elements so a regression that strips buttons
      // (e.g. accidental permission tightening) shows up loud.
      const buttonCount = await page.getByRole("button").count();
      const linkCount = await page.getByRole("link").count();
      console.log(
        `  ${p.name.padEnd(24)}  buttons=${buttonCount}  links=${linkCount}  console_errors=${consoleErrors.length}`,
      );

      // Every logged-in page should have SOME interactive surface
      // (the user menu button at minimum). Zero is a broken render.
      expect(buttonCount + linkCount, "no interactive elements").toBeGreaterThan(
        0,
      );
    });
  }
});
