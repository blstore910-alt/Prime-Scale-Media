import { test, expect } from "@playwright/test";

test("reconciliation page renders — check card, balances, ledger, no crash", async ({
  page,
}) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message.slice(0, 140)}`));

  await page.goto("/reconciliation");

  await expect(
    page.getByRole("heading", { name: "Bank Balances & Reconciliation" }),
  ).toBeVisible({ timeout: 15000 });

  // Reconciliation summary card + its columns.
  await expect(page.getByText("Credited", { exact: true })).toBeVisible();
  await expect(page.getByText("Received", { exact: true })).toBeVisible();
  await expect(page.getByText("Gap", { exact: true })).toBeVisible();

  // Record-entry form + ledger sections present.
  await expect(page.getByText("Record a bank entry")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ledger", exact: true }),
  ).toBeVisible();

  expect(errs, errs.join("\n")).toHaveLength(0);
});
