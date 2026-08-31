import { test, expect } from "@playwright/test";

test("finance: ad-account types card renders with seeded types, no GDN", async ({
  page,
}) => {
  const errs: string[] = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 140)));
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message.slice(0, 140)}`));

  await page.goto("/settings/finance");
  // New card title
  await expect(page.getByText("Ad-Account Types & Fees")).toBeVisible({
    timeout: 15000,
  });
  // A seeded type is listed (input value)
  await expect(page.locator('input[value="Meta-EU-PSM"]')).toBeVisible();
  // GDN was removed — must NOT appear
  await expect(page.locator('input[value="Meta-EU-GDN"]')).toHaveCount(0);
  // The "Add a type" affordance exists
  await expect(page.getByText("Add a type")).toBeVisible();

  await page.waitForTimeout(1500);
  console.log(`### /settings/finance console errors: ${errs.length}`);
  for (const e of errs) console.log(`  · ${e}`);
  expect(errs, errs.join("\n")).toHaveLength(0);
});
