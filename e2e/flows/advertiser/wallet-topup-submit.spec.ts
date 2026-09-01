import { test, expect } from "@playwright/test";

// 1x1 transparent PNG used as a fake payment slip.
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("advertiser can SUBMIT a wallet topup end-to-end (amount + slip)", async ({
  page,
}) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message.slice(0, 160)}`));

  await page.goto("/wallet");
  await page.getByRole("button", { name: "Add Balance" }).click();
  await expect(page.getByText("Request Wallet Topup")).toBeVisible({
    timeout: 15000,
  });

  // Step 1 → 2 → 3.
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /made the transfer/i }).click();

  // Amount above the minimum (default 300).
  await page.locator("#amount").fill("1000");

  // Upload the slip (required for both groups now) and wait for it to land.
  await page.locator("#payment_slip").setInputFiles({
    name: "slip.png",
    mimeType: "image/png",
    buffer: PNG_1x1,
  });

  const submit = page.getByRole("button", { name: "Submit Request" });
  // Submit is disabled until the slip finishes uploading.
  await expect(submit).toBeEnabled({ timeout: 20000 });
  await submit.click();

  // The RPC ran (reference_no text fix) and the request was created.
  await expect(page.getByText("Request Successful!")).toBeVisible({
    timeout: 20000,
  });

  expect(errs, errs.join("\n")).toHaveLength(0);
});
