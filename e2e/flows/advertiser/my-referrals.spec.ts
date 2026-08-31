import { test, expect } from "@playwright/test";

// Advertiser opens /my-referrals. Two things worth verifying that
// today's code paths already deliver:
//   1. The page renders their referral URL (built client-side from
//      tenant.slug + advertiser.tenant_client_code) with a Copy button.
//   2. The referrals table renders (empty for our seed advertiser
//      since nobody has signed up under their code — that empty
//      state MUST render, not crash).

test.describe("advertiser — my referrals", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/my-referrals");
    await expect(page).not.toHaveURL(/\/auth\//);
    await page.waitForTimeout(2000);
  });

  test("referral link textbox + copy button render", async ({ page }) => {
    // The link is exposed via an <Input readOnly> — pattern used
    // across the app for share-me strings. Its value contains
    // "sign-up?" and the tenant slug from the E2E fixture (psm-e2e).
    const linkInput = page.getByRole("textbox").filter({
      has: page.locator("[value*='sign-up']"),
    });
    // Fallback: many components render as a plain input without
    // role=textbox on the DOM node. Also accept any input whose
    // value contains our slug.
    const anyInputWithSlug = page.locator("input[value*='psm-e2e']");

    await expect(
      linkInput.or(anyInputWithSlug).first(),
      "referral link input",
    ).toBeVisible({ timeout: 10_000 });

    // Copy button is next to it.
    await expect(
      page.getByRole("button", { name: /copy/i }).first(),
    ).toBeVisible();
  });

  test("empty referrals table renders (advertiser has no referees yet)", async ({
    page,
  }) => {
    // Either an empty state message or a table with zero data rows —
    // both are valid. What's NOT valid is a client render throw
    // (would leave the body blank).
    await expect(page.locator("body")).toBeVisible();
    const bodyText = await page.locator("body").textContent();
    expect(bodyText, "my-referrals body content").toBeTruthy();
    expect(bodyText).toMatch(/referral/i);
  });
});
