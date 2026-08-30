import { test as setup, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { E2E_PASSWORD, E2E_USERS, type E2ERole } from "./fixtures/ids";

mkdirSync("playwright/.auth", { recursive: true });

// One setup test per role. Each hits /auth/login, signs in with the
// fixed password, waits for the app shell to load, then writes the
// authenticated storage state to playwright/.auth/<role>.json — the
// role-scoped projects in playwright.config.ts pick it up from there.

const ROLES: E2ERole[] = [
  "superAdmin",
  "admin",
  "advertiser",
  "affiliate",
];

for (const role of ROLES) {
  const user = E2E_USERS[role];
  const stateFile = `playwright/.auth/${user.label}.json`;

  setup(`authenticate as ${user.label}`, async ({ page }) => {
    await page.goto("/auth/login");
    await page
      .getByRole("textbox", { name: /email/i })
      .fill(user.email);
    await page
      .getByRole("textbox", { name: /password/i })
      .fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /login/i }).click();

    // Wait for the redirect into the app shell — could be /dashboard
    // (admins) or /complete-profile (advertisers without a company)
    // or the wallet page. Anything under /(app) is a success signal.
    await page.waitForURL(
      (url) => !url.pathname.startsWith("/auth/"),
      { timeout: 15_000 },
    );

    // Sanity check: cookies actually exist before we save.
    const cookies = await page.context().cookies();
    expect(
      cookies.some((c) => c.name.includes("supabase") || c.name === "profile_id"),
      `${user.label} — expected auth cookies to be set`,
    ).toBe(true);

    await page.context().storageState({ path: stateFile });
  });
}
