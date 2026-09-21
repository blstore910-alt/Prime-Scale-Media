import assert from "node:assert/strict";
import test from "node:test";

import {
  commissionOn,
  resolveCommissionRule,
  roundCents,
  topupProfit,
  type CommissionRule,
} from "../../lib/pure-commission-rules.ts";

const T = "tenant-1";
const AFF = "adv-psm0005";

function rule(p: Partial<CommissionRule>): CommissionRule {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    tenant_id: T,
    affiliate_advertiser_id: p.affiliate_advertiser_id ?? null,
    source: p.source ?? "topup",
    ad_account_type: p.ad_account_type ?? null,
    pct: p.pct === undefined ? 10 : p.pct,
    effective_from: p.effective_from ?? "2026-09-01T00:00:00Z",
    created_at: p.created_at ?? p.effective_from ?? "2026-09-01T00:00:00Z",
  };
}

test("the most specific rule wins: own type > own all > default type > default all", () => {
  const rules = [
    rule({ pct: 5 }),
    rule({ pct: 6, ad_account_type: "eu-meta-psm" }),
    rule({ pct: 7, affiliate_advertiser_id: AFF }),
    rule({ pct: 8, affiliate_advertiser_id: AFF, ad_account_type: "eu-meta-psm" }),
  ];
  const at = "2026-09-21T12:00:00Z";
  const q = { affiliateAdvertiserId: AFF, source: "topup" as const, at };
  assert.equal(resolveCommissionRule(rules, { ...q, typeSlug: "eu-meta-psm" })?.pct, 8);
  assert.equal(resolveCommissionRule(rules, { ...q, typeSlug: "eu-meta-psm" })?.level, "own-type");
  // Another type: the affiliate's all-types rule.
  assert.equal(resolveCommissionRule(rules, { ...q, typeSlug: "hk-meta-premium" })?.pct, 7);
  // Another affiliate: the defaults.
  const other = { ...q, affiliateAdvertiserId: "someone-else" };
  assert.equal(resolveCommissionRule(rules, { ...other, typeSlug: "eu-meta-psm" })?.pct, 6);
  assert.equal(resolveCommissionRule(rules, { ...other, typeSlug: "google" })?.pct, 5);
});

test("a type written in the other word order is the same type", () => {
  const rules = [rule({ pct: 9, affiliate_advertiser_id: AFF, ad_account_type: "meta-eu-psm" })];
  const r = resolveCommissionRule(rules, {
    affiliateAdvertiserId: AFF,
    source: "topup",
    typeSlug: "eu-meta-psm",
    at: "2026-09-21T00:00:00Z",
  });
  assert.equal(r?.pct, 9);
});

test("a new rule counts from its start; what happened before keeps the old rate", () => {
  const rules = [
    rule({ pct: 10, affiliate_advertiser_id: AFF, effective_from: "2026-09-01T00:00:00Z" }),
    rule({ pct: 15, affiliate_advertiser_id: AFF, effective_from: "2026-09-21T18:00:00Z" }),
  ];
  const q = { affiliateAdvertiserId: AFF, source: "topup" as const, typeSlug: "eu-meta-psm" };
  assert.equal(resolveCommissionRule(rules, { ...q, at: "2026-09-21T17:59:59Z" })?.pct, 10);
  assert.equal(resolveCommissionRule(rules, { ...q, at: "2026-09-21T18:00:00Z" })?.pct, 15);
  // A rule that has not started yet does not apply to anything.
  assert.equal(resolveCommissionRule(rules, { ...q, at: "2026-08-31T00:00:00Z" }), null);
});

test("clearing a level falls through to the next one", () => {
  const rules = [
    rule({ pct: 5 }),
    rule({ pct: 12, affiliate_advertiser_id: AFF, effective_from: "2026-09-01T00:00:00Z" }),
    rule({ pct: null, affiliate_advertiser_id: AFF, effective_from: "2026-09-10T00:00:00Z" }),
  ];
  const r = resolveCommissionRule(rules, {
    affiliateAdvertiserId: AFF,
    source: "topup",
    typeSlug: "google",
    at: "2026-09-20T00:00:00Z",
  });
  assert.equal(r?.pct, 5);
  assert.equal(r?.level, "default-all");
});

test("a newer broad rule does not erase an older specific override", () => {
  const rules = [
    rule({ pct: 15, affiliate_advertiser_id: AFF, ad_account_type: "eu-meta-psm", effective_from: "2026-09-01T00:00:00Z" }),
    rule({ pct: 12, affiliate_advertiser_id: AFF, effective_from: "2026-09-15T00:00:00Z" }),
  ];
  const q = { affiliateAdvertiserId: AFF, source: "topup" as const, at: "2026-09-20T00:00:00Z" };
  assert.equal(resolveCommissionRule(rules, { ...q, typeSlug: "eu-meta-psm" })?.pct, 15);
  assert.equal(resolveCommissionRule(rules, { ...q, typeSlug: "tiktok" })?.pct, 12);
});

test("subscriptions ignore account types and have their own rules", () => {
  const rules = [
    rule({ pct: 10, source: "topup", affiliate_advertiser_id: AFF }),
    rule({ pct: 20, source: "subscription" }),
  ];
  const r = resolveCommissionRule(rules, {
    affiliateAdvertiserId: AFF,
    source: "subscription",
    typeSlug: "eu-meta-psm",
    at: "2026-09-21T00:00:00Z",
  });
  assert.equal(r?.pct, 20);
  assert.equal(r?.level, "default-all");
});

test("no rule at all: nothing is earned", () => {
  assert.equal(
    resolveCommissionRule([], {
      affiliateAdvertiserId: AFF,
      source: "topup",
      typeSlug: "eu-meta-psm",
    }),
    null,
  );
});

test("profit is our fee minus the supplier's fee on what landed", () => {
  // The F2 walk: EUR 50 at 3% -> fee 1.50, EUR 48.50 lands. With a 2%
  // supplier fee: 0.97 cost, 0.53 profit, 10% of that is 0.05.
  const p = topupProfit({ feeAmount: 1.5, landedAmount: 48.5, supplierFeePct: 2 });
  assert.equal(p.supplierCost, 0.97);
  assert.equal(p.profit, 0.53);
  assert.equal(commissionOn(p.profit, 10), 0.05);
});

test("a supplier fee that is not recorded is not zero: profit is unknown", () => {
  const p = topupProfit({ feeAmount: 1.5, landedAmount: 48.5, supplierFeePct: null });
  assert.equal(p.profit, null);
  assert.equal(commissionOn(p.profit, 10), 0);
  // ...while a recorded zero really is zero cost.
  const z = topupProfit({ feeAmount: 1.5, landedAmount: 48.5, supplierFeePct: 0 });
  assert.equal(z.profit, 1.5);
});

test("no profit, no commission -- a loss is never shared", () => {
  const p = topupProfit({ feeAmount: 1, landedAmount: 100, supplierFeePct: 2 });
  assert.equal(p.profit, -1);
  assert.equal(commissionOn(p.profit, 10), 0);
});

test("cents round half away from zero on the decimal, like Postgres", () => {
  assert.equal(roundCents(0.485), 0.49);
  assert.equal(roundCents(1.005), 1.01);
  assert.equal(roundCents(-0.485), -0.49);
  assert.equal(roundCents(4.8499), 4.85);
});
