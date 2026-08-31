import { defineConfig, devices } from "@playwright/test";

// E2E harness. Runs against a live URL — deployed app by default, or
// a local next dev server if PLAYWRIGHT_BASE_URL points at localhost.
//
// Test structure supports 4 parallel role contexts (super_admin,
// admin, advertiser, affiliate). Each role gets its own storage
// state (auth cookies) written into playwright/.auth/ by the
// "seed-and-login" project, then consumed by role-scoped tests.

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "https://app.primescalemedia.com";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // Smoke — read-only, no auth. Verifies the app is reachable and
    // the login page renders. Runs first, unblocks the role setup.
    {
      name: "smoke",
      testMatch: /smoke\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },

    // Role setup — hits the auth endpoint, stores cookies. Each role
    // depends on this project having run.
    {
      name: "role-setup",
      testMatch: /roles\.setup\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },

    // Role-scoped test projects — one per authenticated persona.
    // Each loads its storage state from the setup step and runs the
    // flow specs that expect that role.
    {
      name: "super-admin",
      testMatch: /(flows\/super-admin|tours)\/.*\.spec\.ts$/,
      dependencies: ["role-setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/super-admin.json",
      },
    },
    {
      name: "admin",
      testMatch: /(flows\/admin|tours)\/.*\.spec\.ts$/,
      dependencies: ["role-setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/admin.json",
      },
    },
    {
      name: "advertiser",
      testMatch: /(flows\/advertiser|tours)\/.*\.spec\.ts$/,
      dependencies: ["role-setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/advertiser.json",
      },
    },
    {
      name: "affiliate",
      testMatch: /flows\/affiliate\/.*\.spec\.ts$/,
      dependencies: ["role-setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/affiliate.json",
      },
    },

    // Chain specs that drive multiple browser contexts in ONE test
    // (advertiser session + admin session in parallel). They open
    // their own contexts from the storage state files themselves —
    // no project-level storageState.
    {
      name: "chains",
      testMatch: /flows\/chains\/.*\.spec\.ts$/,
      dependencies: ["role-setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
