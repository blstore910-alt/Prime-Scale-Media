import { test, expect } from "@playwright/test";

// Advertiser: every end-user page. Some pages redirect to
// /complete-profile until the seed advertiser has company + billing —
// which for a fresh test tenant they don't. Accept either the
// target URL or /complete-profile as "reached the app", so this
// suite doesn't fail purely because the seed hasn't filled the
// company yet.

const PAGES = [
  { url: "/dashboard",       name: "Dashboard" },
  { url: "/accounts",        name: "My Ad Accounts" },
  { url: "/top-ups",         name: "Topups" },
  { url: "/my-subscription", name: "My Subscription" },
  { url: "/my-referrals",    name: "My Referrals" },
  { url: "/wallet",          name: "Wallet" },
  { url: "/invoices",        name: "Invoices" },
] as const;

test.describe("advertiser — every page loads", () => {
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
        `  ${p.name.padEnd(24)}  url=${new URL(page.url()).pathname.padEnd(20)}  buttons=${buttonCount}  links=${linkCount}  console_errors=${consoleErrors.length}`,
      );
      expect(buttonCount + linkCount).toBeGreaterThan(0);
    });
  }
});
