import test from "node:test";
import assert from "node:assert/strict";

import { safeExternalHref } from "../../lib/url-field";

test("a bare host gets the scheme, so the link is not relative", () => {
  // The bug: href="acme.com" resolves against our own origin.
  assert.equal(safeExternalHref("acme.com"), "https://acme.com");
  assert.equal(safeExternalHref("  www.acme.co.uk/shop  "), "https://www.acme.co.uk/shop");
});

test("a full address is left alone", () => {
  assert.equal(safeExternalHref("https://acme.com/a?b=c"), "https://acme.com/a?b=c");
  assert.equal(safeExternalHref("http://acme.com"), "http://acme.com");
});

test("javascript: gets no link at all", () => {
  assert.equal(safeExternalHref("javascript:alert(1)"), null);
  assert.equal(safeExternalHref("JaVaScRiPt:alert(1)"), null);
  assert.equal(safeExternalHref("data:text/html,<script>x</script>"), null);
  assert.equal(safeExternalHref("vbscript:msgbox(1)"), null);
});

test("a mail address is not a website", () => {
  assert.equal(safeExternalHref("mailto:a@b.com"), null);
});

test("nothing typed means no link", () => {
  assert.equal(safeExternalHref(""), null);
  assert.equal(safeExternalHref("   "), null);
  assert.equal(safeExternalHref(null), null);
  assert.equal(safeExternalHref(undefined), null);
});

test("a bare word is not a host", () => {
  // normaliseUrl would make it https://website, which is a real URL but
  // not a place. No link; the caller still shows the text.
  assert.equal(safeExternalHref("website"), null);
  assert.equal(safeExternalHref("to be confirmed"), null);
});

test("a host with a port is a host, not a scheme", () => {
  assert.equal(safeExternalHref("acme.com:8080"), "https://acme.com:8080");
});

test("protocol-relative picks https", () => {
  assert.equal(safeExternalHref("//acme.com"), "https://acme.com");
});
