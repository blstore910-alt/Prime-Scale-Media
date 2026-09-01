import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { existsSync } from "node:fs";

// Conformance smoke for EVERY RPC the app calls. Each is invoked with
// safe/bogus params (bogus UUIDs → early "not found"; invalid scalars →
// early validation) so nothing mutates. We assert each RPC is INSTALLED
// and STRUCTURALLY VALID against the live schema: a domain error (42704
// not found, 22000 invalid, 42501 forbidden, 23xxx, P0001) or 200 = OK;
// a PGRST202 (function/params not found), 42883 (undefined function),
// 42804 (result-structure mismatch), 42703 (undefined column) or 42P01
// (undefined table) = the RPC is missing or broken → FAIL.

test.describe.configure({ mode: "serial" });

const BOGUS = "00000000-0000-0000-0000-000000000000";
const BAD = new Set(["PGRST202", "PGRST203", "42883", "42804", "42703", "42P01"]);

type Creds = { page: Page; origin: string; apikey: string; token: string };

async function credsFor(
  browser: { newContext: (o: { storageState: string }) => Promise<BrowserContext> },
  role: "super-admin" | "advertiser",
): Promise<{ ctx: BrowserContext; creds: Creds }> {
  const path = `playwright/.auth/${role}.json`;
  if (!existsSync(path)) test.skip(true, `${path} missing — run role-setup first`);
  const ctx = await browser.newContext({ storageState: path });
  const page = await ctx.newPage();
  let origin = "";
  let apikey = "";
  page.on("request", (req) => {
    const u = req.url();
    if (!origin && u.includes("/rest/v1/")) {
      origin = new URL(u).origin;
      apikey = req.headers()["apikey"] ?? "";
    }
  });
  await page.goto("/dashboard");
  await page.waitForTimeout(3000);
  const cookies = await ctx.cookies();
  const chunks = cookies
    .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  let raw = chunks.map((c) => c.value).join("");
  if (raw.startsWith("base64-")) raw = raw.slice(7);
  let token = "";
  try {
    token = JSON.parse(Buffer.from(raw, "base64").toString("utf8"))?.access_token ?? "";
  } catch {
    token = "";
  }
  expect(origin, `${role}: rest origin`).not.toBe("");
  expect(token, `${role}: token`).toBeTruthy();
  return { ctx, creds: { page, origin, apikey, token } };
}

async function rpc(c: Creds, fn: string, body: object) {
  const res = await c.page.request.post(`${c.origin}/rest/v1/rpc/${fn}`, {
    headers: {
      apikey: c.apikey,
      authorization: `Bearer ${c.token}`,
      "Content-Type": "application/json",
    },
    data: body,
  });
  const text = await res.text();
  let code = "";
  try {
    code = JSON.parse(text)?.code ?? "";
  } catch {
    /* non-json */
  }
  return { status: res.status(), code, text: text.slice(0, 200) };
}

test("every RPC the app calls is installed + structurally valid", async ({
  browser,
}) => {
  const admin = await credsFor(browser, "super-admin");
  const adv = await credsFor(browser, "advertiser");
  try {
    // [role, fn, params] — bogus/invalid values keep every call side-effect-free.
    const A = "admin" as const;
    const V = "adv" as const;
    const calls: Array<[typeof A | typeof V, string, object]> = [
      // wallet admin
      [A, "wallet_topup_admin_verify", { p_topup_id: BOGUS }],
      [A, "wallet_topup_admin_reject", { p_topup_id: BOGUS, p_reason: "e2e" }],
      [A, "wallet_topup_admin_undo", { p_topup_id: BOGUS }],
      [A, "wallet_admin_set_min_topup", { p_wallet_id: BOGUS, p_min_topup: 100 }],
      [A, "wallet_admin_adjust", { p_wallet_id: BOGUS, p_usd_delta: 0, p_eur_delta: 0, p_reason: "e2e" }],
      [A, "wallet_exchange", { p_wallet_id: BOGUS, p_from_currency: "EUR", p_amount: 1 }],
      // adjustments / refunds / precharge
      [A, "wallet_adjustment_request", { p_advertiser_id: BOGUS, p_delta: 1, p_currency: "EUR", p_reason: "e2e" }],
      [A, "wallet_adjustment_approve", { p_adjustment_id: BOGUS }],
      [A, "wallet_adjustment_reject", { p_adjustment_id: BOGUS, p_reason: "e2e" }],
      [A, "wallet_refund_request", { p_advertiser_id: BOGUS, p_amount: 1, p_currency: "EUR" }],
      [A, "wallet_refund_approve", { p_refund_id: BOGUS }],
      [A, "wallet_refund_reject", { p_refund_id: BOGUS, p_reason: "e2e" }],
      [A, "wallet_precharge_create", { p_advertiser_id: BOGUS, p_amount: 1, p_currency: "EUR", p_reason: "e2e" }],
      [A, "wallet_precharge_from_topup", { p_topup_id: BOGUS }],
      [A, "wallet_precharge_settle", { p_precharge_id: BOGUS }],
      // top_ups (ad-account) — the ones with NO repo definition
      [A, "top_up_admin_verify", { p_top_up_id: BOGUS, p_new_fee_percent: null }],
      [A, "top_up_admin_reject", { p_top_up_id: BOGUS, p_reason: "e2e" }],
      [V, "top_up_create_for_advertiser", { p_account_id: BOGUS, p_currency: "EUR", p_amount_received: 1, p_type: "top-up", p_payment_slip: null }],
      // withdrawals
      [A, "ad_account_withdrawal_request", { p_ad_account_id: BOGUS, p_amount: 1, p_currency: "EUR" }],
      [A, "ad_account_withdrawal_approve", { p_withdrawal_id: BOGUS }],
      [A, "ad_account_withdrawal_reject", { p_withdrawal_id: BOGUS, p_reason: "e2e" }],
      // subscriptions / invoices
      [A, "invoice_pay_from_wallet", { p_invoice_id: BOGUS }],
      [A, "change_subscription_amount", { p_subscription_id: BOGUS, p_new_amount: 100 }],
      // perks
      [A, "grant_advertiser_perk", { p_advertiser_id: BOGUS, p_kind: "topup_discount", p_amount: 5 }],
      [A, "revoke_advertiser_perk", { p_perk_id: BOGUS }],
      // wise
      [A, "wise_confirm_suggestion", { p_transfer_id: BOGUS }],
      // invite / bootstrap
      [A, "create_subscription_from_invite", { p_invite_id: BOGUS }],
      [A, "wallet_create_for_advertiser", {}],
      [A, "wallet_topup_advertiser_create", { p_amount: 1, p_currency: "XXX", p_payment_slip: null }],
      // advertiser-context
      [V, "affiliate_referral_stats", { p_from: null, p_to: null }],
      [V, "ad_account_request_create_paid", { p_platform: "meta-ads", p_currency: "XXX", p_timezone: "UTC" }],
      [V, "get_invite_by_token", { p_token: "e2e-bogus-token" }],
      [V, "rate_limit_check", { p_key: "e2e-smoke", p_max_requests: 1000, p_window_seconds: 60 }],
    ];

    const fails: string[] = [];
    const oks: string[] = [];
    for (const [role, fn, params] of calls) {
      const c = role === "admin" ? admin.creds : adv.creds;
      const r = await rpc(c, fn, params);
      // Any 2xx (200/204) = ran fine. Otherwise a domain error code
      // (not in BAD) also proves the function is installed + valid.
      if (r.status < 300 || (r.code && !BAD.has(r.code))) {
        oks.push(`${fn} [${r.status}${r.code ? " " + r.code : ""}]`);
      } else {
        fails.push(`${fn} → ${r.status} ${r.code} :: ${r.text}`);
      }
    }

    console.log("=== RPC conformance ===");
    console.log(`OK (${oks.length}): ${oks.join(", ")}`);
    console.log(`FAIL (${fails.length}):`);
    for (const f of fails) console.log("  " + f);
    console.log("=== end ===");

    expect(fails, `RPCs missing/broken:\n${fails.join("\n")}`).toEqual([]);
  } finally {
    await admin.ctx.close();
    await adv.ctx.close();
  }
});
