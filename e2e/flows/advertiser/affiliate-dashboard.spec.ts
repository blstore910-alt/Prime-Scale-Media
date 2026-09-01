import { test, expect } from "@playwright/test";

// Regression guard for the affiliate dashboard: the affiliate_referral_stats
// RPC must resolve (it once 400'd because the referral view lacks
// commission_currency). Runs as an advertiser (advertiser-as-affiliate).
test("affiliate dashboard: stats RPC resolves without 400", async ({ page }) => {
  const statuses: number[] = [];
  page.on("response", (res) => {
    if (res.url().includes("affiliate_referral_stats")) {
      statuses.push(res.status());
    }
  });

  await page.goto("/my-referrals");

  // The referral link box + dashboard heading render.
  await expect(page.getByText(/your referral link/i).first()).toBeVisible({
    timeout: 15_000,
  });

  // Give the RPC time to fire, then assert every call succeeded.
  await page.waitForTimeout(4000);
  expect(statuses.length, "affiliate_referral_stats was called").toBeGreaterThan(0);
  for (const s of statuses) {
    expect(s, "affiliate_referral_stats returned OK").toBeLessThan(400);
  }
});
