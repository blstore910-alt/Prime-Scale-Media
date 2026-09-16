import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isUrlLike,
  normaliseUrl,
} from "../../lib/url-field.ts";

describe("normaliseUrl", () => {
  it("adds https:// to a bare domain — the whole point", () => {
    assert.equal(normaliseUrl("acme.com"), "https://acme.com");
    assert.equal(normaliseUrl("www.acme.com"), "https://www.acme.com");
    assert.equal(normaliseUrl("acme.com/pricing"), "https://acme.com/pricing");
  });

  it("leaves an existing scheme alone, including http", () => {
    assert.equal(normaliseUrl("https://acme.com"), "https://acme.com");
    assert.equal(normaliseUrl("http://acme.com"), "http://acme.com");
  });

  it("does not double-prefix a scheme it does not recognise as http(s)", () => {
    // The guard matches any scheme, not just http, so this stays as typed and
    // is rejected by isUrlLike rather than becoming https://mailto:…
    assert.equal(normaliseUrl("mailto:a@b.com"), "mailto:a@b.com");
  });

  it("treats protocol-relative as a scheme decision", () => {
    assert.equal(normaliseUrl("//acme.com"), "https://acme.com");
  });

  it("trims, and maps blank to blank", () => {
    assert.equal(normaliseUrl("  acme.com  "), "https://acme.com");
    assert.equal(normaliseUrl(""), "");
    assert.equal(normaliseUrl("   "), "");
    assert.equal(normaliseUrl(null), "");
    assert.equal(normaliseUrl(undefined), "");
  });
});

describe("isUrlLike", () => {
  it("accepts what people actually type", () => {
    assert.equal(isUrlLike("acme.com"), true);
    assert.equal(isUrlLike("www.acme.com"), true);
    assert.equal(isUrlLike("acme.co.uk"), true);
    assert.equal(isUrlLike("test-advertiser.example.com"), true);
    assert.equal(isUrlLike("https://acme.com/a/b?c=d"), true);
  });

  it("accepts empty — whether a website is required is the schema's call", () => {
    assert.equal(isUrlLike(""), true);
    assert.equal(isUrlLike(null), true);
  });

  it("rejects a bare word, so 'website' does not become https://website", () => {
    assert.equal(isUrlLike("website"), false);
    assert.equal(isUrlLike("acme"), false);
  });

  it("rejects a hostname with no real TLD", () => {
    assert.equal(isUrlLike("acme."), false);
    assert.equal(isUrlLike("acme.c"), false);
  });

  it("rejects non-web schemes", () => {
    assert.equal(isUrlLike("mailto:a@b.com"), false);
    assert.equal(isUrlLike("javascript:alert(1)"), false);
    assert.equal(isUrlLike("ftp://acme.com"), false);
  });

  it("allows localhost, for anyone testing against a dev server", () => {
    assert.equal(isUrlLike("localhost"), true);
    assert.equal(isUrlLike("http://localhost:3000"), true);
  });
});
