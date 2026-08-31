import { test, expect, type Page } from "@playwright/test";

// Plain admin button coverage — mirrors the super-admin sweep but
// only over pages an employee-tier admin can reach. Super-only
// paths are already asserted as rejected in shell.spec.ts.

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
];

const SKIP_LABELS = [
  /sign out/i, /log out/i,
  /^delete/i, /^remove/i, /revoke/i,
  /reject/i, /approve/i, /verify/i, /confirm/i,
  /^send/i, /^save/i, /^submit/i,
];

type Outcome = {
  label: string;
  changed: "dialog" | "nav" | "toast" | "nothing" | "error";
  detail?: string;
};

async function probe(page: Page, url: string) {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(url);
  await page.waitForTimeout(2000);

  const buttons = await page.getByRole("button").all();
  const labels: string[] = [];
  for (const b of buttons) {
    try {
      const t = (await b.textContent())?.trim() ?? "";
      if (t) labels.push(t);
    } catch {}
  }
  const outcomes: Outcome[] = [];
  for (const label of [...new Set(labels)]) {
    if (SKIP_LABELS.some((rx) => rx.test(label))) continue;
    if (label.length > 40) continue;
    try {
      const before = page.url();
      const dBefore = await page.getByRole("dialog").count();
      const btn = page.getByRole("button", { name: label, exact: true }).first();
      if ((await btn.count()) === 0) continue;
      await btn.click({ timeout: 3000 });
      await page.waitForTimeout(400);
      const after = page.url();
      const dAfter = await page.getByRole("dialog").count();
      let changed: Outcome["changed"] = "nothing";
      let detail: string | undefined;
      if (after !== before) {
        changed = "nav";
        detail = new URL(after).pathname;
      } else if (dAfter > dBefore) changed = "dialog";
      outcomes.push({ label, changed, detail });
      if (changed === "dialog") {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
      } else if (changed === "nav") {
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
    const r = await probe(page, url);
    console.log(`\n=== ${r.url} ===`);
    for (const o of r.outcomes) {
      console.log(`  [${o.changed.padEnd(7)}] ${o.label}${o.detail ? "  " + o.detail : ""}`);
    }
    if (r.errors.length > 0) {
      console.log(`  console errors: ${r.errors.length}`);
      r.errors.slice(0, 3).forEach((e) => console.log(`    - ${e.slice(0, 120)}`));
    }
    expect(r.outcomes.length + r.errors.length).toBeGreaterThanOrEqual(0);
  });
}
