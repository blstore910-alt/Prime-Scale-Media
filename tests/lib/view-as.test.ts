import { test } from "node:test";
import assert from "node:assert/strict";
import { isBlockedInViewMode, isViewAsPath, parseViewAsCode } from "../../lib/pure-view-as.ts";

const SB = "https://abc.supabase.co";

test("reads go out", () => {
  assert.equal(isBlockedInViewMode("GET", `${SB}/rest/v1/wallets?select=*`), false);
  assert.equal(isBlockedInViewMode(undefined, "/api/version"), false);
  assert.equal(isBlockedInViewMode("HEAD", "/dashboard"), false);
});

test("every kind of write is stopped", () => {
  // a server action posts to the page itself
  assert.equal(isBlockedInViewMode("POST", "/view-as/PSM0029"), true);
  // an RPC
  assert.equal(isBlockedInViewMode("POST", `${SB}/rest/v1/rpc/wallet_exchange`), true);
  assert.equal(isBlockedInViewMode("POST", `${SB}/rest/v1/rpc/invoice_pay_from_wallet`), true);
  // a table write, any verb
  assert.equal(isBlockedInViewMode("POST", `${SB}/rest/v1/notification_preferences`), true);
  assert.equal(isBlockedInViewMode("PATCH", `${SB}/rest/v1/user_profiles?id=eq.1`), true);
  assert.equal(isBlockedInViewMode("DELETE", `${SB}/rest/v1/notifications?id=eq.1`), true);
  assert.equal(isBlockedInViewMode("PUT", "/api/anything"), true);
  // an api route
  assert.equal(isBlockedInViewMode("POST", "/api/push/subscribe"), true);
  assert.equal(isBlockedInViewMode("POST", "/api/heartbeat"), true);
  // storage upload (a slip)
  assert.equal(isBlockedInViewMode("POST", `${SB}/storage/v1/object/payment-slips/x.png`), true);
});

test("only the harmless POSTs pass", () => {
  assert.equal(isBlockedInViewMode("POST", `${SB}/auth/v1/token?grant_type=refresh_token`), false);
  assert.equal(isBlockedInViewMode("POST", "/api/payment-slip-url"), false);
  assert.equal(isBlockedInViewMode("POST", "/api/view-as/log"), false);
  assert.equal(isBlockedInViewMode("POST", "/api/exchange-rates/refresh"), false);
  assert.equal(isBlockedInViewMode("POST", "/api/log/client-error"), false);
  // not a prefix match: a lookalike path is still refused
  assert.equal(isBlockedInViewMode("POST", "/api/payment-slip-url/../push/notify"), true);
  assert.equal(isBlockedInViewMode("POST", "/api/view-as/log2"), true);
  // sign-out everywhere goes through auth/v1/logout, not token: refused
  assert.equal(isBlockedInViewMode("POST", `${SB}/auth/v1/logout?scope=global`), true);
});

test("the code in the URL", () => {
  assert.equal(parseViewAsCode("psm0029"), "PSM0029");
  assert.equal(parseViewAsCode(" PSM0029 "), "PSM0029");
  assert.equal(parseViewAsCode("PSM0029'; drop"), null);
  assert.equal(parseViewAsCode(""), null);
  assert.equal(parseViewAsCode(undefined), null);
});

test("which paths are view mode", () => {
  assert.equal(isViewAsPath("/view-as/PSM0029"), true);
  assert.equal(isViewAsPath("/view-as"), true);
  assert.equal(isViewAsPath("/view-assets"), false);
  assert.equal(isViewAsPath("/dashboard"), false);
});
