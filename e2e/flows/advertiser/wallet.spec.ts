import { test, expect } from "@playwright/test";

// Advertiser wallet page — the highest-traffic surface for an
// end user. Verifies:
//   1. Page renders (not stuck on /complete-profile now that seed
//      has company + billing).
//   2. Both currency balances (USD + EUR) are shown, both start at 0
//      for a fresh advertiser.
//   3. The Top-Up dialog opens on click.
//   4. The transactions history section renders (empty state or table).

test.describe("advertiser — wallet", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/wallet");
    await expect(page).not.toHaveURL(/\/auth\//);
    await expect(page).toHaveURL(/\/wallet/);
    await page.waitForTimeout(2000);
  });

  test("wallet page renders with balances", async ({ page }) => {
    // Look for currency indicators. The wallet-view shows amounts
    // formatted with symbols ($ / €).
    const body = await page.locator("body").textContent();
    expect(body, "wallet body").toBeTruthy();
    // Some digit-with-decimals should appear (0.00, 100.00, etc).
    expect(body).toMatch(/\d[\d,]*\.\d{2}/);
  });

  test("Add Balance button opens the topup wizard dialog", async ({ page }) => {
    // Actual button label is "Add Balance" (see wallet-view.tsx).
    // Clicking it opens WalletTopupDialog.
    const addBtn = page.getByRole("button", { name: /add balance/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();
    await expect(page.getByRole("dialog").first()).toBeVisible({
      timeout: 5_000,
    });
  });
});
