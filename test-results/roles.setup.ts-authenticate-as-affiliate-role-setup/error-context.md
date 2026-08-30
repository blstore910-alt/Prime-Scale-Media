# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: roles.setup.ts >> authenticate as affiliate
- Location: e2e\roles.setup.ts:23:8

# Error details

```
TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e5]:
    - img "PSM Logo" [ref=e7]
    - generic [ref=e8]:
      - generic [ref=e9]: Login
      - generic [ref=e10]: Enter your email below to login to your account
    - generic [ref=e13]:
      - generic [ref=e14]:
        - generic [ref=e15]: Email
        - textbox "Email" [ref=e16]:
          - /placeholder: m@example.com
          - text: e2e-aff@primescalemedia.test
      - generic [ref=e17]:
        - generic [ref=e18]:
          - generic [ref=e19]: Password
          - link "Forgot your password?" [ref=e20] [cursor=pointer]:
            - /url: /auth/forgot-password
        - textbox "Password" [ref=e21]: E2E-passw0rd!
      - paragraph [ref=e22]: Invalid login credentials
      - button "Login" [ref=e23] [cursor=pointer]
  - alert [ref=e24]
```

# Test source

```ts
  1  | import { test as setup, expect } from "@playwright/test";
  2  | import { mkdirSync } from "node:fs";
  3  | import { E2E_PASSWORD, E2E_USERS, type E2ERole } from "./fixtures/ids";
  4  | 
  5  | mkdirSync("playwright/.auth", { recursive: true });
  6  | 
  7  | // One setup test per role. Each hits /auth/login, signs in with the
  8  | // fixed password, waits for the app shell to load, then writes the
  9  | // authenticated storage state to playwright/.auth/<role>.json — the
  10 | // role-scoped projects in playwright.config.ts pick it up from there.
  11 | 
  12 | const ROLES: E2ERole[] = [
  13 |   "superAdmin",
  14 |   "admin",
  15 |   "advertiser",
  16 |   "affiliate",
  17 | ];
  18 | 
  19 | for (const role of ROLES) {
  20 |   const user = E2E_USERS[role];
  21 |   const stateFile = `playwright/.auth/${user.label}.json`;
  22 | 
  23 |   setup(`authenticate as ${user.label}`, async ({ page }) => {
  24 |     await page.goto("/auth/login");
  25 |     await page
  26 |       .getByRole("textbox", { name: /email/i })
  27 |       .fill(user.email);
  28 |     await page
  29 |       .getByRole("textbox", { name: /password/i })
  30 |       .fill(E2E_PASSWORD);
  31 |     await page.getByRole("button", { name: /login/i }).click();
  32 | 
  33 |     // Wait for the redirect into the app shell — could be /dashboard
  34 |     // (admins) or /complete-profile (advertisers without a company)
  35 |     // or the wallet page. Anything under /(app) is a success signal.
> 36 |     await page.waitForURL(
     |                ^ TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
  37 |       (url) => !url.pathname.startsWith("/auth/"),
  38 |       { timeout: 15_000 },
  39 |     );
  40 | 
  41 |     // Sanity check: cookies actually exist before we save.
  42 |     const cookies = await page.context().cookies();
  43 |     expect(
  44 |       cookies.some((c) => c.name.includes("supabase") || c.name === "profile_id"),
  45 |       `${user.label} — expected auth cookies to be set`,
  46 |     ).toBe(true);
  47 | 
  48 |     await page.context().storageState({ path: stateFile });
  49 |   });
  50 | }
  51 | 
```