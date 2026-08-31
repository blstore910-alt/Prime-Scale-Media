import { test, expect } from "@playwright/test";

test("create ad-account: type dropdown lists types + fee auto-fills", async ({
  page,
}) => {
  await page.goto("/accounts");

  await page.getByRole("button", { name: "Create new account" }).click();
  await expect(page.getByText("Create New Ad Account")).toBeVisible({
    timeout: 15000,
  });
  await expect(page.locator("#fee-percent")).toBeVisible();

  // Discard any restored draft so it doesn't reflow the form mid-click.
  const discard = page.getByRole("button", { name: "Discard draft" });
  if (await discard.count()) await discard.first().click();

  // Let the ad-account-types query resolve (options swap from fallback to
  // DB) before touching the Radix trigger, so it stops re-rendering.
  await page.waitForTimeout(3000);

  // Pick Tiktok → default fee 6 auto-fills.
  await page.locator("#platform-select").click();
  await expect(
    page.getByRole("option", { name: "Meta-EU-PSM", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("option", { name: "Meta-EU-GDN" })).toHaveCount(0);
  await page.getByRole("option", { name: "Tiktok", exact: true }).click();
  await expect(page.locator("#fee-percent")).toHaveValue("6");

  // Switch to a Meta type → fee auto-fills to 5.
  await page.locator("#platform-select").click();
  await page.getByRole("option", { name: "Meta-EU-PSM", exact: true }).click();
  await expect(page.locator("#fee-percent")).toHaveValue("5");
});
