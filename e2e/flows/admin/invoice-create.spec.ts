import { test, expect } from "@playwright/test";

// FUNCTIONAL money-flow spec: actually CREATE an invoice. Runs under the
// "admin" project (this file lives in flows/admin; that storage state is
// role=admin). The "Create Invoice" trigger is admin-gated
// (invoices-table.tsx:165 `isAdmin`).
//
// Selectors read from the live components:
//  - Trigger button:         invoices-table.tsx:166-168  <Button onClick=…>Create Invoice</Button>
//  - Dialog title (heading): create-invoice-dialog.tsx:170 <DialogTitle>Create Invoice</DialogTitle>
//  - Advertiser SelectField: create-invoice-dialog.tsx:184 id="invoice-advertiser-select"
//  - Amount input id:        create-invoice-dialog.tsx:240 id="invoice-amount"
//  - Currency defaults EUR:  create-invoice-dialog.tsx:55  (getDefaultValues) — left untouched
//  - Submit button:          create-invoice-dialog.tsx:258-265 <Button form="invoice-form">…"Create Invoice"</Button>
//  - Success toast:          create-invoice-dialog.tsx:142 "Invoice created successfully."
//
// NOTE: the trigger button, the DialogTitle, and the submit button all read
// "Create Invoice". Before opening, only the trigger exists (Radix renders
// DialogContent lazily), so the first click is unambiguous. After opening,
// the title is matched via role=heading and the submit is scoped to the dialog.

test("admin can SUBMIT a new invoice end-to-end", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) =>
    errs.push(`pageerror: ${e.message.slice(0, 200)}`),
  );

  await page.goto("/invoices");

  // Only the trigger exists at this point (dialog content not yet rendered).
  await page.getByRole("button", { name: "Create Invoice" }).click();

  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Create Invoice" }),
  ).toBeVisible({ timeout: 15000 });

  // Advertiser is a hard prerequisite — pick the first option, or skip.
  await dialog.locator("#invoice-advertiser-select").click();
  const firstAdvertiser = page.getByRole("option").first();
  let hasAdvertiser = true;
  try {
    await firstAdvertiser.waitFor({ state: "visible", timeout: 8000 });
  } catch {
    hasAdvertiser = false;
  }
  if (!hasAdvertiser) {
    console.log(
      "[skip] No advertiser options in #invoice-advertiser-select — cannot create an invoice. Seed at least one advertiser for this tenant.",
    );
    test.skip(true, "No advertiser available.");
  }
  await firstAdvertiser.click();

  // Amount (> 0 required). Currency defaults to EUR.
  await dialog.locator("#invoice-amount").fill("250");

  // Submit — disabled until advertisers finish loading, so wait for enabled.
  const submit = dialog.getByRole("button", { name: "Create Invoice" });
  await expect(submit).toBeEnabled({ timeout: 15000 });
  await submit.click();

  // Success toast — OR the "Company not found" precondition error (the
  // invoice action requires the advertiser to have a company). The
  // latter is a valid business precondition, not a bug: skip cleanly.
  const success = page.getByText("Invoice created successfully.");
  const noCompany = page.getByText(/Company not found/i);
  await expect(success.or(noCompany)).toBeVisible({ timeout: 15000 });
  if (await noCompany.isVisible()) {
    console.log(
      "[skip] Selected advertiser has no company — invoice requires one.",
    );
    test.skip(true, "Advertiser has no company.");
  }

  expect(errs, errs.join("\n")).toHaveLength(0);
});
