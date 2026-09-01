import { test, expect } from "@playwright/test";

// FUNCTIONAL money-flow spec: actually CREATE a subscription. Runs under
// the "admin" project (this file lives in flows/admin; that storage state
// is role=admin). The /subscriptions page is admin-gated
// (app/(app)/subscriptions/page.tsx:5 requireAdmin).
//
// Selectors read from the live components:
//  - Trigger button:         subscriptions-table.tsx:141-144  <Button size="sm">…"Create New Subscription"</Button>
//  - Dialog title (heading): create-subscription-dialog.tsx:193 <DialogTitle>Create New Subscription</DialogTitle>
//  - Advertiser SelectField: create-subscription-dialog.tsx:207 id="subscription-advertiser-select"
//  - Amount input id:        create-subscription-dialog.tsx:263 id="subscription-amount"
//  - Currency defaults EUR:  create-subscription-dialog.tsx:76  (getDefaultValues) — left untouched
//  - Start date defaults to today: create-subscription-dialog.tsx:77 getTodayDateValue() — valid, left untouched
//  - Submit button:          create-subscription-dialog.tsx:305-312 <Button form="subscription-form">…"Create Subscription"</Button>
//  - Success toast:          create-subscription-dialog.tsx:165 "Subscription created successfully."
//
// NOTE: the trigger button and the DialogTitle share the text
// "Create New Subscription", so the title is matched via role=heading and
// the submit button is scoped to the dialog.

test("admin can SUBMIT a new subscription end-to-end", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) =>
    errs.push(`pageerror: ${e.message.slice(0, 200)}`),
  );

  await page.goto("/subscriptions");

  await page.getByRole("button", { name: "Create New Subscription" }).click();

  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Create New Subscription" }),
  ).toBeVisible({ timeout: 15000 });

  // Advertiser is a hard prerequisite — pick the first option, or skip.
  await dialog.locator("#subscription-advertiser-select").click();
  const firstAdvertiser = page.getByRole("option").first();
  let hasAdvertiser = true;
  try {
    await firstAdvertiser.waitFor({ state: "visible", timeout: 8000 });
  } catch {
    hasAdvertiser = false;
  }
  if (!hasAdvertiser) {
    console.log(
      "[skip] No advertiser options in #subscription-advertiser-select — cannot create a subscription. Seed at least one advertiser for this tenant.",
    );
    test.skip(true, "No advertiser available.");
  }
  await firstAdvertiser.click();

  // Amount (> 0 required). Currency defaults to EUR; start date defaults to today.
  await dialog.locator("#subscription-amount").fill("500");

  // Submit — disabled until advertisers finish loading, so wait for enabled.
  const submit = dialog.getByRole("button", { name: "Create Subscription" });
  await expect(submit).toBeEnabled({ timeout: 15000 });
  await submit.click();

  // Success: toast, with dialog-close as a fallback signal.
  try {
    await expect(
      page.getByText("Subscription created successfully."),
    ).toBeVisible({ timeout: 15000 });
  } catch {
    await expect(dialog).toBeHidden({ timeout: 15000 });
  }

  expect(errs, errs.join("\n")).toHaveLength(0);
});
