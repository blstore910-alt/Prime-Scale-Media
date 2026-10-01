import { strict as assert } from "node:assert";
import { test } from "node:test";
import { emailLayout } from "../../lib/pure-email-layout";
import { billingEmail } from "../../lib/pure-billing-email";

// De eigenaar, 01-10: het telefoonnummer "moet uit alle emails, anders
// krijg ik teveel spam". Elke mail gaat door emailLayout; geen nummer,
// geen wa.me-link naar zijn telefoon.
const NUMMER = /15300300|wa\.me\/31/;

test("de opmaak van elke mail bevat geen telefoonnummer", () => {
  const html = emailLayout({ preheader: "p", title: "t", lead: "l", cta: { label: "Go", href: "https://x" }, footnoteHtml: "f" });
  assert.doesNotMatch(html, NUMMER);
});

test("de factuurmails ook niet", () => {
  for (const type of ["subscription_invoice", "subscription_invoice_due_soon"]) {
    const m = billingEmail(type, { number: 1, total: 75, currency: "EUR", due_date: "2026-10-08" });
    if (!m) continue;
    assert.doesNotMatch(m.html + m.text, NUMMER, type);
  }
});
