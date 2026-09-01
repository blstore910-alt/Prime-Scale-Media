import { test, expect } from "@playwright/test";

test("wallet topup dialog: steps render, slip required, no crash", async ({
  page,
}) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message.slice(0, 140)}`));

  await page.goto("/wallet");

  // Open the topup dialog (advertiser sees "Add Balance").
  await page.getByRole("button", { name: "Add Balance" }).click();
  await expect(page.getByText("Request Wallet Topup")).toBeVisible({
    timeout: 15000,
  });

  // Draft resume banner must NOT show for a customer (staff-only now).
  await expect(page.getByText("Resume where you left off")).toHaveCount(0);

  // STEP 1: choose group → Continue.
  await expect(page.getByText("Choose Account Group")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // STEP 2: bank details + reference → confirm transfer.
  await expect(page.getByRole("button", { name: /made the transfer/i })).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole("button", { name: /made the transfer/i }).click();

  // STEP 3: slip is now required for BOTH groups → field must be present,
  // and Submit is disabled until a slip is uploaded.
  await expect(page.getByText("Payment Slip")).toBeVisible({ timeout: 10000 });
  const submit = page.getByRole("button", { name: "Submit Request" });
  await expect(submit).toBeVisible();
  await expect(submit).toBeDisabled();

  expect(errs, errs.join("\n")).toHaveLength(0);
});
