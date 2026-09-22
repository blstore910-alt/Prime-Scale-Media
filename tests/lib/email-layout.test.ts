import { test } from "node:test";
import assert from "node:assert/strict";

import { emailLayout, emailPanel, emailParagraph, escapeHtml } from "../../lib/pure-email-layout";

test("escapes what a person typed", () => {
  assert.equal(escapeHtml(`<b>"Bart" & 'co'</b>`), "&lt;b&gt;&quot;Bart&quot; &amp; &#39;co&#39;&lt;/b&gt;");
});

test("the button and the fallback link both point at the CTA", () => {
  const html = emailLayout({
    preheader: "p",
    title: "Confirm your email",
    bodyHtml: emailParagraph("hi"),
    steps: ["One", "Two", "Three"],
    cta: { label: "Confirm my email", href: "{{ .ConfirmationURL }}" },
  });
  // Supabase fills the placeholder: it must survive untouched, twice.
  assert.equal(html.split("{{ .ConfirmationURL }}").length - 1, 3);
  assert.match(html, /Confirm my email &rarr;<\/a>/);
});

test("no leftover template syntax, no style block (Gmail strips it)", () => {
  const html = emailLayout({
    preheader: "p",
    title: "t",
    bodyHtml: emailPanel("Your plan", "EUR 200.00 per month"),
    footnoteHtml: "small print",
  });
  assert.ok(!html.includes("${"));
  assert.ok(!/<style/i.test(html));
  assert.match(html, /small print/);
  assert.match(html, /Prime Scale Media/);
});
