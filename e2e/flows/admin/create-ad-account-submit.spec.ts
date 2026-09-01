import { test, expect } from "@playwright/test";

// FUNCTIONAL money-flow spec: actually CREATE an ad account (not just
// render the form). Runs under the "admin" project because this file
// lives in flows/admin — that storage state is role=admin, which is
// what CreateAccountDialog requires (create-account-dialog.tsx:21
// `profile?.role === "admin"`).
//
// Selectors were read from the live components:
//  - Trigger button aria-label:        create-account-dialog.tsx:23  <Button aria-label="Create new account">
//  - Dialog title:                      create-account-dialog.tsx:31  "Create New Ad Account"
//  - Platform SelectField id:           account-form.tsx:391          id="platform-select"
//  - Account name input id:             account-form.tsx:400          id="account-name"
//  - Advertiser SelectField id:         account-form.tsx:409          id="advertiser-select"
//  - Fee input id:                      account-form.tsx:418          id="fee-percent"
//  - Timezone SelectField id:           account-form.tsx:426          id="timezone-select"
//  - Meta metadata field ids:           account-form.tsx:204/209      id="fb-bm-id" / id="fb-profile-link"
//  - Submit button:                     account-form.tsx:457-460      <Button type="submit" form="account-form"><span>Create Account</span>
//  - Success toast:                     account-form.tsx:312          "New Ad Account created successfully."
//  - Meta group + fee autofill:         account-form.tsx:242-248 (setValue fee = default_fee_pct) — all seed Meta types default to 5 (lib/types/ad-account-type.ts:53-58)
//  - Radix Select interaction (click trigger, getByRole('option')):
//    matches the existing passing spec flows/super-admin/create-account-form.spec.ts.

test("admin can SUBMIT a new Meta ad account end-to-end", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) =>
    errs.push(`pageerror: ${e.message.slice(0, 200)}`),
  );

  await page.goto("/accounts");

  // Open the Create New dialog (trigger uses aria-label, not visible text).
  await page.getByRole("button", { name: "Create new account" }).click();
  await expect(page.getByText("Create New Ad Account")).toBeVisible({
    timeout: 15000,
  });

  const dialog = page.getByRole("dialog");

  // Discard any restored draft so the banner doesn't reflow the form mid-click
  // (account-form.tsx:382 aria-label="Discard draft").
  const discard = page.getByRole("button", { name: "Discard draft" });
  if (await discard.count()) await discard.first().click();

  // Let the ad-account-types query resolve (options swap from the seed
  // fallback to the DB list) before touching the Radix trigger — mirrors
  // the existing create-account-form.spec.ts which needed this settle.
  await page.waitForTimeout(3000);

  // Account name (placeholder is upper-cased via CSS; value is what we set).
  await page.locator("#account-name").fill(`AA-E2E-${Date.now()}`);

  // Platform → pick the first Meta type. Meta group makes the fee autofill
  // and reveals the Meta metadata fields (account-form.tsx:435).
  await page.locator("#platform-select").click();
  const metaOption = page.getByRole("option", { name: /^Meta/ }).first();
  await expect(metaOption).toBeVisible({ timeout: 15000 });
  await metaOption.click();

  // Fee auto-fills to the type default (all seed Meta types = 5).
  await expect(page.locator("#fee-percent")).toHaveValue("5", {
    timeout: 15000,
  });

  // Meta-specific required fields (only rendered once a Meta type is chosen).
  // fb-profile-link is validated as a URL (account-form.tsx:132-140).
  await page.locator("#fb-bm-id").fill("1234567890");
  await page
    .locator("#fb-profile-link")
    .fill("https://facebook.com/e2e.test.profile");

  // Advertiser is a hard prerequisite — pick the first available option, or
  // skip if the tenant has none seeded.
  await page.locator("#advertiser-select").click();
  const firstAdvertiser = page.getByRole("option").first();
  let hasAdvertiser = true;
  try {
    await firstAdvertiser.waitFor({ state: "visible", timeout: 8000 });
  } catch {
    hasAdvertiser = false;
  }
  if (!hasAdvertiser) {
    console.log(
      "[skip] No advertiser options in #advertiser-select — cannot assign an ad account. Seed at least one advertiser for this tenant.",
    );
    test.skip(true, "No advertiser available to assign.");
  }
  await firstAdvertiser.click();

  // Timezone → pick the first option from the static TIMEZONES list.
  await page.locator("#timezone-select").click();
  await page.getByRole("option").first().click();

  // Submit (button is outside the <form> but wired via form="account-form").
  await dialog.getByRole("button", { name: "Create Account" }).click();

  // Success: toast, with dialog-close as a fallback signal.
  try {
    await expect(
      page.getByText("New Ad Account created successfully."),
    ).toBeVisible({ timeout: 15000 });
  } catch {
    await expect(page.getByText("Create New Ad Account")).toBeHidden({
      timeout: 15000,
    });
  }

  expect(errs, errs.join("\n")).toHaveLength(0);
});
