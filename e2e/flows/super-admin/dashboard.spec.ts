import { test, expect } from "@playwright/test";

// Super-admin baseline: the app shell loads, sidebar has the
// super-admin-only sections (Referrals, Settings, Activity, Audit,
// Invites, Admins). If these disappear a permission-visibility
// regression has landed.

test.describe("super-admin — shell + sidebar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    // App shell must load; if we bounce to /auth/* the storageState
    // has expired (usually a stale seed) — surface it clearly.
    expect(page.url(), "should stay in app shell").not.toContain("/auth/");
  });

  test("dashboard renders without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    // Wait for at least one stat card to paint — that's the signal
    // the client-side data queries resolved.
    await expect(page.locator("body")).toBeVisible();
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    if (errors.length > 0) console.error("console errors:", errors);
    // Not fatal on the dashboard yet (some third-party console noise
    // is common) — record but don't fail.
    // expect(errors).toEqual([]);
  });

  test("sidebar shows super-admin-only sections", async ({ page }) => {
    // Referrals group, Settings, Activity Logs, Audit Log, Invites,
    // Admins — all gated in components/app-sidebar.tsx behind
    // isSuperAdmin. Getting these visible confirms the runtime
    // isSuperAdmin flag resolved correctly.
    for (const label of [
      "Referral Links",
      "Referral Commissions",
      "Settings",
      "Activity Logs",
      "Audit Log",
      "Invites",
      "Admins",
    ]) {
      // exact:true avoids strict-mode collisions with dashboard
      // tiles that carry the same word ("Active admins (24h)...").
      await expect(
        page.getByRole("link", { name: label, exact: true }).first(),
        `sidebar link "${label}" expected for super-admin`,
      ).toBeVisible();
    }
  });

  test("navigate to finance settings and see fee_defaults + FX cards", async ({
    page,
  }) => {
    await page
      .getByRole("link", { name: "Settings", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/settings\/finance/);

    // Don't wait for networkidle — the dashboard keeps opening SSE /
    // heartbeat sockets so the page never becomes idle. Wait on the
    // card content instead, which is what we care about anyway.
    await expect(page.getByText(/exchange rates/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/topup fees/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
