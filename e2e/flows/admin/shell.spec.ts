import { test, expect } from "@playwright/test";

// Plain admin (not tenant owner) shell: sidebar should show every
// General-group item, but NONE of the super-admin-only sections.
// Regressions here mean permission-visibility drifted — either
// getAdminNavItems' isSuperAdmin gate or the resolved flag itself.

test.describe("admin — sidebar visibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    expect(page.url()).not.toContain("/auth/");
  });

  test("sidebar shows admin-common sections", async ({ page }) => {
    for (const label of [
      "Advertisers",
      "Ad Accounts",
      "Topups",
      "Account Requests",
      "Subscriptions",
      "Invoices",
      "Wallets",
      "Wallet Topups",
    ]) {
      await expect(
        page.getByRole("link", { name: label, exact: true }).first(),
        `sidebar link "${label}" expected for admin`,
      ).toBeVisible();
    }
  });

  test("sidebar hides super-admin-only sections", async ({ page }) => {
    for (const label of [
      "Referral Links",
      "Referral Commissions",
      "Settings",
      "Activity Logs",
      "Audit Log",
      "Invites",
      "Admins",
    ]) {
      await expect(
        page.getByRole("link", { name: label, exact: true }),
        `sidebar link "${label}" MUST NOT be visible to plain admin`,
      ).not.toBeVisible();
    }
  });

  test("direct visit to /settings/finance is rejected", async ({ page }) => {
    // requireSuperAdmin should bounce back to /dashboard.
    await page.goto("/settings/finance");
    await page.waitForURL(
      (url) => url.pathname === "/dashboard" || url.pathname === "/",
      { timeout: 10_000 },
    );
  });

  test("direct visit to /admins is rejected", async ({ page }) => {
    await page.goto("/admins");
    await page.waitForURL(
      (url) => url.pathname === "/dashboard" || url.pathname === "/",
      { timeout: 10_000 },
    );
  });
});
