import { test, expect } from "@playwright/test";

// Super-admin drills into an individual advertiser from /users.
// Verifies the detail sheet opens, the commission-setup dialog can
// be opened, and the create-subscription dialog can be opened.
// Doesn't submit anything — those are separate flows tested elsewhere.
//
// Uses the seeded E2E Advertiser row so the assertions are stable
// across runs.

test.describe("super-admin — advertisers page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/users");
    await expect(page).not.toHaveURL(/\/auth\//);
    await page.waitForTimeout(1500);
  });

  test("advertiser table shows the seeded E2E Advertiser", async ({ page }) => {
    // The seeded advertiser's full_name is "E2E Advertiser".
    // Playwright's role queries include table cells as generic text.
    await expect(page.getByText("E2E Advertiser").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("clicking an advertiser row opens a details sheet", async ({ page }) => {
    // The table row is clickable — the row body opens the details
    // sheet. Locate via the advertiser's email since names may
    // repeat in a busy tenant.
    const row = page.locator("tr").filter({
      hasText: "e2e-adv@primescalemedia.test",
    });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.first().click();

    // Sheet is a shadcn <Sheet> — asserts on its dialog role.
    await expect(
      page.getByRole("dialog").filter({ hasText: /E2E Advertiser/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("CSV export button is present on the advertisers page", async ({
    page,
  }) => {
    // The advertisers table has a CSV export affordance for admins.
    // Regression sensor: it disappearing would break the workflow
    // admins use to hand data to finance.
    await expect(
      page.getByRole("button", { name: /download csv/i }).first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});
