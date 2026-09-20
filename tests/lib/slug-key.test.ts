import test from "node:test";
import assert from "node:assert/strict";
import { humanSlug, sameSlug, slugKey } from "../../lib/pure-slug-key.ts";

test("the two real spellings of the premium type are the same type", () => {
  // The seed writes one; slugifying the label "Meta-EU-Premium" writes
  // the other. An exact compare silently withheld a 2-point discount.
  assert.ok(sameSlug("eu-meta-premium", "meta-eu-premium"));
  assert.ok(sameSlug("Meta-EU-Premium", "eu-meta-premium"));
  assert.ok(sameSlug("meta_eu_premium", "eu-meta-premium"));
});

test("different types stay different", () => {
  assert.ok(!sameSlug("eu-meta-premium", "eu-meta-psm"));
  assert.ok(!sameSlug("hk-meta-premium", "eu-meta-premium"));
  assert.ok(!sameSlug("eu-meta-premium", "eu-meta-premium-gh"));
});

test("nothing matches nothing", () => {
  // An empty slug must not equal another empty slug, or every account
  // with no platform would get the premium rate.
  assert.ok(!sameSlug("", ""));
  assert.ok(!sameSlug(null, null));
  assert.ok(!sameSlug(undefined, "eu-meta-premium"));
  assert.ok(!sameSlug("eu-meta-premium", ""));
});

test("the key is stable whatever the separator or case", () => {
  const k = slugKey("eu-meta-premium");
  for (const v of ["EU-META-PREMIUM", "meta eu premium", "premium__eu__meta"]) {
    assert.equal(slugKey(v), k, v);
  }
});

test("humanSlug turns a slug nobody has a label for into words", () => {
  assert.equal(humanSlug("meta-ads"), "Meta Ads");
  assert.equal(humanSlug("tiktok-ads"), "TikTok Ads");
  assert.equal(humanSlug("eu-meta-psm-gh"), "EU Meta PSM GH");
  assert.equal(humanSlug("google_ads"), "Google Ads");
});

test("humanSlug gives nothing back for nothing, so the caller can dash it", () => {
  assert.equal(humanSlug(null), "");
  assert.equal(humanSlug(""), "");
  assert.equal(humanSlug("   "), "");
});
