import { test } from "node:test";
import assert from "node:assert/strict";

import { billingDate, billingEmail, billingMoney } from "../../lib/pure-billing-email";

test("money to the cent, in the invoice's own currency", () => {
  assert.equal(billingMoney(200, "EUR"), "€200.00");
  assert.equal(billingMoney("1250.5", "usd"), "$1,250.50");
  assert.equal(billingMoney(null, "EUR"), "€0.00");
  assert.equal(billingMoney("abc", "EUR"), "—");
});

test("a due date is the calendar day, never shifted by a time zone", () => {
  assert.equal(billingDate("2026-09-24"), "24 Sep 2026");
  assert.equal(billingDate("2026-10-01T00:00:00+00:00"), "1 Oct 2026");
  assert.equal(billingDate(null), null);
});

test("the three mails say the amount, the date and where to go", () => {
  const inv = { number: "0006-125", total: 200, currency: "EUR", due_date: "2026-09-24" };
  const ready = billingEmail("subscription_invoice", inv)!;
  assert.match(ready.subject, /€200\.00, due 24 Sep 2026/);
  assert.match(ready.html, /view=billing/);
  assert.match(ready.html, /Invoice 0006-125/);

  const soon = billingEmail("subscription_invoice_due_soon", inv)!;
  assert.equal(soon.subject, "Reminder: €200.00 is due on 24 Sep 2026");

  const failed = billingEmail("subscription_past_due", inv)!;
  assert.match(failed.html, /view=wallet/);
  assert.match(failed.text, /Top up your EUR wallet/);

  assert.equal(billingEmail("topup_completed", inv), null);
});

test("an invoice number typed by a person is escaped", () => {
  const html = billingEmail("subscription_invoice", { number: "<b>x</b>", total: 1, currency: "EUR" })!.html;
  assert.ok(!html.includes("<b>x</b>"));
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"));
});
