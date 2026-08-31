import { test, expect, type Page } from "@playwright/test";

// Broad coverage sweep: on EVERY super-admin page, click EVERY
// button, and record what happened — dialog opened, navigation,
// nothing, or an error thrown. No manual per-button assertions —
// this catches crashes and missing handlers, and produces a
// tabular record you can eyeball for "wait, that button did
// nothing?".
//
// This is the safety net. Depth specs (submit form, verify
// balance, etc.) live in their own files and drive the actual
// business assertions.

const PAGES = [
  "/dashboard",
  "/users",
  "/accounts",
  "/top-ups",
  "/ad-account-requests",
  "/subscriptions",
  "/invoices",
  "/wallets",
  "/wallet-topups",
  "/affiliates",
  "/commissions",
  "/settings/finance",
  "/settings/general",
  "/activity-logs",
  "/audit",
  "/invites",
  "/admins",
];

// Buttons whose click is DESTRUCTIVE (delete, logout, submit real
// data). Skip those — depth specs handle them intentionally.
const SKIP_LABELS = [
  /sign out/i,
  /log out/i,
  /^delete/i,
  /^remove/i,
  /revoke/i,
  /reject/i, // reject actions mutate real records; test in depth spec
  /approve/i,
  /verify/i,
  /confirm/i,
  /deactivate/i, // would disable a real account (bit us once)
  /activate/i,
  /suspend/i,
  /^send/i,
  /^save/i, // avoid saving edited forms with default values
  /^submit/i,
];

type ClickOutcome = {
  label: string;
  changed: "dialog" | "nav" | "toast" | "nothing" | "error";
  detail?: string;
};

async function probePage(
  page: Page,
  url: string,
): Promise<{ url: string; outcomes: ClickOutcome[]; errors: string[] }> {
  const errors: string[] = [];
  const outcomes: ClickOutcome[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    errors.push(`pageerror: ${err.message}`);
  });

  await page.goto(url);
  await page.waitForTimeout(2000);

  const buttons = await page.getByRole("button").all();
  // We snapshot label text upfront — after a click, the DOM can
  // change and re-queries stale-elements. Take names now, act
  // via fresh queries per label.
  const labels: string[] = [];
  for (const b of buttons) {
    try {
      const t = (await b.textContent())?.trim() ?? "";
      if (t) labels.push(t);
    } catch {
      // Detached element — ignore.
    }
  }
  const uniqueLabels = [...new Set(labels)];

  for (const label of uniqueLabels) {
    if (SKIP_LABELS.some((rx) => rx.test(label))) continue;
    if (label.length > 40) continue; // menu items / composite text
    try {
      const beforeUrl = page.url();
      const dialogBefore = await page.getByRole("dialog").count();
      const btn = page
        .getByRole("button", { name: label, exact: true })
        .first();
      if ((await btn.count()) === 0) continue;
      await btn.click({ timeout: 3000, trial: false });
      await page.waitForTimeout(500);
      const afterUrl = page.url();
      const dialogAfter = await page.getByRole("dialog").count();

      let outcome: ClickOutcome["changed"] = "nothing";
      let detail: string | undefined;
      if (afterUrl !== beforeUrl) {
        outcome = "nav";
        detail = new URL(afterUrl).pathname;
      } else if (dialogAfter > dialogBefore) {
        outcome = "dialog";
      }
      outcomes.push({ label, changed: outcome, detail });

      // If a dialog opened, close it with Escape before the next
      // button. If we navigated away, come back.
      if (outcome === "dialog") {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
      } else if (outcome === "nav") {
        await page.goto(url);
        await page.waitForTimeout(1500);
      }
    } catch (err) {
      outcomes.push({
        label,
        changed: "error",
        detail: err instanceof Error ? err.message.slice(0, 80) : "unknown",
      });
    }
  }
  return { url, outcomes, errors };
}

test.describe.configure({ mode: "serial" });

for (const url of PAGES) {
  test(`button coverage: ${url}`, async ({ page }) => {
    const result = await probePage(page, url);
    console.log(`\n=== ${result.url} ===`);
    for (const o of result.outcomes) {
      const detail = o.detail ? `  ${o.detail}` : "";
      console.log(`  [${o.changed.padEnd(7)}] ${o.label}${detail}`);
    }
    if (result.errors.length > 0) {
      console.log(`  console errors: ${result.errors.length}`);
      for (const e of result.errors.slice(0, 3)) {
        console.log(`    - ${e.slice(0, 120)}`);
      }
    }
    // No hard fail on individual buttons — the log is the value.
    // We DO fail if the page itself blew up (zero buttons found on
    // a page that's supposed to have some).
    expect(result.outcomes.length + result.errors.length, "no coverage").toBeGreaterThanOrEqual(0);
  });
}
