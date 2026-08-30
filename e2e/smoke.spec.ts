import { test, expect } from "@playwright/test";

// Read-only smoke test. Runs before any authenticated flow. Fails
// loudly and fast if the app itself is down, so a later 4-role flow
// failure isn't misdiagnosed as an auth problem.

test.describe("smoke — unauthenticated surface", () => {
  test("login page renders", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const response = await page.goto("/auth/login");
    expect(response?.status(), "GET /auth/login").toBeLessThan(400);

    await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: /password/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /login/i })).toBeVisible();

    // Silent-until-cause: dump console errors when there are any so
    // debugging doesn't need a rerun with a trace.
    if (consoleErrors.length > 0) {
      console.error("console errors:", consoleErrors);
    }
    // Console errors on the login page are always a real regression.
    expect(consoleErrors, "no console errors on /auth/login").toEqual([]);
  });

  test("unauthenticated visit to /dashboard redirects to login", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    // Middleware bounces to /auth/login. Wait for the redirect to
    // settle on any /auth/* URL, then assert the login form is there.
    await page.waitForURL(/\/auth\//, { timeout: 10_000 });
    await expect(page.getByRole("button", { name: /login/i })).toBeVisible();
  });
});
