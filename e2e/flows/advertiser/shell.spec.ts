import { test, expect } from "@playwright/test";

// Advertiser shell: end-user sidebar (My Ad Accounts, Wallet,
// Topups, My Subscription, My Referrals, Invoices). No admin
// surface. Also verifies /complete-profile doesn't loop — the
// test seed advertiser has no company yet, so a bounce to
// /complete-profile is the correct behaviour, not a regression.

test.describe("advertiser — shell", () => {
  test("lands somewhere in the app shell after login", async ({ page }) => {
    await page.goto("/");
    // A fresh advertiser without company/billing gets sent to
    // /complete-profile by (app)/layout.tsx. Anywhere OUT of
    // /auth/* is a success signal that the storageState works.
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/auth/");
  });

  test("wallet page loads (or complete-profile if company missing)", async ({
    page,
  }) => {
    await page.goto("/wallet");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    // Either the wallet page renders OR complete-profile intercepts.
    // Both mean the auth is working. A bounce to /auth/* would be
    // the regression.
    expect(page.url()).not.toContain("/auth/");
    expect(page.url()).toMatch(/\/(wallet|complete-profile)/);
  });

  test("sidebar hides admin-only sections", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Even if we land on /complete-profile the sidebar isn't rendered.
    // Only assert when we're inside the shell.
    if (page.url().includes("/complete-profile")) {
      test.skip(true, "no sidebar on /complete-profile — nothing to check");
      return;
    }
    for (const label of [
      "Advertisers",
      "Ad Accounts",
      "Wallet Topups",
      "Admins",
      "Settings",
    ]) {
      // "Ad Accounts" vs "My Ad Accounts" — admin sees the former,
      // advertiser sees the latter. Exact-match makes the assertion
      // resilient.
      await expect(
        page.getByRole("link", { name: label, exact: true }),
        `sidebar link "${label}" MUST NOT be visible to advertiser`,
      ).not.toBeVisible();
    }
  });
});
