import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { existsSync } from "node:fs";

// Functional money-logic tests against the live app, on the isolated
// PSM E2E Test tenant (never touches real customers). They call the
// SECURITY DEFINER RPCs directly via authenticated REST — the same
// calls the app makes — so we assert the actual money behaviour, not
// just that a page renders.
//
// Auth: each role's Supabase JWT is read from its stored session
// (localStorage) and the anon apikey is captured from a live request;
// both are then sent on direct PostgREST calls.

test.describe.configure({ mode: "serial" });

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

  // @supabase/ssr stores the session in a cookie named
  // sb-<ref>-auth-token (chunked as .0/.1 when large), value prefixed
  // with "base64-" then a base64 JSON blob holding access_token.
  const cookies = await ctx.cookies();
  const authChunks = cookies
    .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  let raw = authChunks.map((c) => c.value).join("");
  if (raw.startsWith("base64-")) raw = raw.slice("base64-".length);
  let token = "";
  try {
    const session = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    token = session?.access_token ?? "";
  } catch {
    token = "";
  }

  expect(origin, `${role}: captured a rest origin`).not.toBe("");
  expect(token, `${role}: extracted an access token`).toBeTruthy();
  return { ctx, creds: { page, origin, apikey, token } };
}

function headers(c: Creds) {
  return {
    apikey: c.apikey,
    authorization: `Bearer ${c.token}`,
    "Content-Type": "application/json",
  };
}

async function rpc(c: Creds, fn: string, body: object) {
  const res = await c.page.request.post(`${c.origin}/rest/v1/rpc/${fn}`, {
    headers: headers(c),
    data: body,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-json */
  }
  return { status: res.status(), json: json as Record<string, unknown> | null, text };
}

async function getRest(c: Creds, path: string) {
  const res = await c.page.request.get(`${c.origin}/rest/v1/${path}`, {
    headers: headers(c),
  });
  return { status: res.status(), rows: (await res.json().catch(() => [])) as any[] };
}

test("perk: a free-request perk makes a request free and is consumed, no wallet charge", async ({
  browser,
}) => {
  const admin = await credsFor(browser, "super-admin");
  const adv = await credsFor(browser, "advertiser");
  try {
    // Advertiser id + starting EUR balance.
    const advRows = await getRest(adv.creds, "advertisers?select=id&limit=1");
    const advId = advRows.rows?.[0]?.id as string | undefined;
    expect(advId, "advertiser id resolved").toBeTruthy();

    const wBefore = await getRest(
      adv.creds,
      `wallets?select=eur_balance&advertiser_id=eq.${advId}`,
    );
    const eurBefore = Number(wBefore.rows?.[0]?.eur_balance ?? 0);

    // Determinism: clear any existing active free-request perks first.
    const existing = await getRest(
      admin.creds,
      `advertiser_perks?select=id&advertiser_id=eq.${advId}&kind=eq.free_ad_account_requests&active=eq.true`,
    );
    for (const p of existing.rows ?? []) {
      await rpc(admin.creds, "revoke_advertiser_perk", { p_perk_id: p.id });
    }

    // Admin grants 2 free requests.
    const grant = await rpc(admin.creds, "grant_advertiser_perk", {
      p_advertiser_id: advId,
      p_kind: "free_ad_account_requests",
      p_remaining: 2,
    });
    expect(grant.status, `grant returned ${grant.text}`).toBe(200);
    const perk = (Array.isArray(grant.json) ? grant.json[0] : grant.json) as
      | Record<string, unknown>
      | null;
    const perkId = perk?.id as string | undefined;
    expect(perkId, "granted perk id").toBeTruthy();
    expect(Number(perk?.remaining), "granted with 2 remaining").toBe(2);

    // Advertiser submits an ad-account request → should be free via perk.
    const req = await rpc(adv.creds, "ad_account_request_create_paid", {
      p_platform: "meta-ads",
      p_currency: "EUR",
      p_timezone: "Europe/Amsterdam",
      p_metadata: {
        facebook_business_manager_id: "e2e-test",
        personal_facebook_profile_link: "https://facebook.com/e2e",
        e2e: true,
      },
    });
    expect(req.status, `request returned ${req.text}`).toBe(200);
    const reqRow = (Array.isArray(req.json) ? req.json[0] : req.json) as
      | Record<string, any>
      | null;
    const meta = reqRow?.metadata ?? {};
    expect(meta.request_fee_included, "request was free").toBe(true);
    expect(Number(meta.request_fee), "fee charged was 0").toBe(0);
    expect(meta.request_fee_free_source, "free came from a perk").toBe("perk");

    // Wallet must be untouched by a free request.
    const wAfter = await getRest(
      adv.creds,
      `wallets?select=eur_balance&advertiser_id=eq.${advId}`,
    );
    const eurAfter = Number(wAfter.rows?.[0]?.eur_balance ?? 0);
    expect(eurAfter, "wallet not charged for a free request").toBe(eurBefore);

    // Perk consumed: 2 → 1.
    const perkAfter = await getRest(
      admin.creds,
      `advertiser_perks?select=remaining,active&id=eq.${perkId}`,
    );
    expect(Number(perkAfter.rows?.[0]?.remaining), "perk decremented to 1").toBe(1);

    // Revoke → inactive.
    const revoke = await rpc(admin.creds, "revoke_advertiser_perk", {
      p_perk_id: perkId,
    });
    expect(revoke.status, `revoke returned ${revoke.text}`).toBeLessThan(300);
    const perkRevoked = await getRest(
      admin.creds,
      `advertiser_perks?select=active&id=eq.${perkId}`,
    );
    expect(perkRevoked.rows?.[0]?.active, "perk is revoked").toBe(false);
  } finally {
    await admin.ctx.close();
    await adv.ctx.close();
  }
});

test("money RPCs are installed with valid structure (bogus-id smoke)", async ({
  browser,
}) => {
  const admin = await credsFor(browser, "super-admin");
  const adv = await credsFor(browser, "advertiser");
  try {
    const BOGUS = "00000000-0000-0000-0000-000000000000";

    // A missing function → PostgREST PGRST202. A structure/column bug →
    // 42804 / 42703 (the class of bug that broke the affiliate RPC).
    // Reaching the domain 'not found' (42704) proves the function is
    // installed AND its body parses cleanly against the live schema.
    const csa = await rpc(admin.creds, "change_subscription_amount", {
      p_subscription_id: BOGUS,
      p_new_amount: 100,
    });
    expect(csa.json?.code, `change_subscription_amount → ${csa.text}`).toBe(
      "42704",
    );

    const ipw = await rpc(adv.creds, "invoice_pay_from_wallet", {
      p_invoice_id: BOGUS,
    });
    expect(ipw.json?.code, `invoice_pay_from_wallet → ${ipw.text}`).toBe("42704");

    // affiliate_referral_stats must simply resolve (returns 200 + array).
    const aff = await rpc(adv.creds, "affiliate_referral_stats", {
      p_from: null,
      p_to: null,
    });
    expect(aff.status, `affiliate_referral_stats → ${aff.text}`).toBe(200);
    expect(Array.isArray(aff.json), "affiliate stats returns an array").toBe(true);
  } finally {
    await admin.ctx.close();
    await adv.ctx.close();
  }
});
