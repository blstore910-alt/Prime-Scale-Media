import assert from "node:assert/strict";
import test from "node:test";

import {
  customerPlatformName,
  platformFamily,
  platformLabel,
} from "../../lib/pure-platform-badge.ts";
import {
  normalizeSupplierUrl,
  supplierPillLabel,
  supplierUrlHost,
} from "../../lib/pure-supplier-link.ts";

test("every vocabulary in the app lands on the right family", () => {
  // The one the admin queue was printing raw.
  assert.equal(platformFamily("meta-ads"), "meta");
  // The seeded ad-account type slugs.
  assert.equal(platformFamily("eu-meta-psm"), "meta");
  assert.equal(platformFamily("hk-meta-business-green"), "meta");
  assert.equal(platformFamily("google"), "google");
  assert.equal(platformFamily("google-ads"), "google");
  assert.equal(platformFamily("tiktok"), "tiktok");
  assert.equal(platformFamily("Tiktok-Ads"), "tiktok");
  assert.equal(platformFamily("taboola"), "other");
  assert.equal(platformFamily(null), "other");
  assert.equal(platformFamily(""), "other");
});

test("a slug the tenant named keeps the name the owner gave it", () => {
  assert.equal(platformLabel("eu-meta-psm", "Meta-EU-PSM"), "Meta-EU-PSM");
  // Blank/whitespace is not a name.
  assert.equal(platformLabel("eu-meta-psm", "   "), "Meta");
  assert.equal(platformLabel("eu-meta-psm", null), "Meta");
});

test("an unknown slug reads as words, never as a slug", () => {
  assert.equal(platformLabel("meta-ads"), "Meta");
  assert.equal(platformLabel("snapchat-ads"), "Snapchat Ads");
  assert.equal(platformLabel(null), "—");
});

test("a supplier link is only ever http(s)", () => {
  assert.equal(
    normalizeSupplierUrl("https://app.example.com/topup"),
    "https://app.example.com/topup",
  );
  // How an owner actually types it.
  assert.equal(normalizeSupplierUrl("app.example.com"), "https://app.example.com/");
  assert.equal(normalizeSupplierUrl("  app.example.com  "), "https://app.example.com/");
  assert.equal(normalizeSupplierUrl("http://app.example.com"), "http://app.example.com/");
});

test("a supplier link refuses anything that would run in the admin's session", () => {
  assert.equal(normalizeSupplierUrl("javascript:alert(1)"), null);
  // The classic way past a naive scheme check: a real newline
  // inside the scheme. Built here rather than written as an
  // escape, because an escape in this file has been eaten once.
  assert.equal(
    normalizeSupplierUrl(["java", "script:alert(1)"].join(String.fromCharCode(10))),
    null,
  );
  assert.equal(
    normalizeSupplierUrl("java" + String.fromCharCode(9) + "script:alert(1)"),
    null,
  );
  assert.equal(normalizeSupplierUrl("JavaScript:alert(1)"), null);
  // The classic way past a naive scheme check.
  assert.equal(normalizeSupplierUrl("java\nscript:alert(1)"), null);
  assert.equal(normalizeSupplierUrl("  javascript:alert(1)"), null);
  assert.equal(normalizeSupplierUrl("data:text/html,<script>x</script>"), null);
  assert.equal(normalizeSupplierUrl("file:///etc/passwd"), null);
  assert.equal(normalizeSupplierUrl(""), null);
  assert.equal(normalizeSupplierUrl(null), null);
  assert.equal(normalizeSupplierUrl("https://"), null);
  // A hostname with no dot is a local name, not a supplier dashboard.
  assert.equal(normalizeSupplierUrl("https://localhost"), null);
});

test("the pill says something useful even when half the record is blank", () => {
  assert.equal(supplierPillLabel("Gradyn", "Meta-EU-PSM"), "Gradyn");
  assert.equal(supplierPillLabel("", "Meta-EU-PSM"), "Meta-EU-PSM");
  assert.equal(supplierPillLabel(null, null), "supplier");
  assert.equal(supplierUrlHost("https://app.example.com/x?y=1"), "app.example.com");
  assert.equal(supplierUrlHost("javascript:alert(1)"), "");
});

test("a customer reads the network, never the type or the slug", () => {
  // The tile under AA-PSM0007-EU-01 printed "Meta-EU-PSM".
  assert.equal(customerPlatformName("eu-meta-psm"), "Meta");
  assert.equal(customerPlatformName("eu-meta-psm-gh"), "Meta");
  assert.equal(customerPlatformName("hk-meta-business-green"), "Meta");
  assert.equal(customerPlatformName("meta-ads"), "Meta");
  assert.equal(customerPlatformName("google-ads"), "Google");
  assert.equal(customerPlatformName("tiktok"), "TikTok");
  // A platform we cannot name prints nothing -- never its slug, which
  // carries the same internals a type label does.
  assert.equal(customerPlatformName("taboola-eu-psm"), null);
  assert.equal(customerPlatformName(""), null);
  assert.equal(customerPlatformName(null), null);
});
