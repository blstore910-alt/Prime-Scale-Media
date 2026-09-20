import test from "node:test";
import assert from "node:assert/strict";
import {
  allRejectTemplates,
  rejectTemplates,
} from "../../lib/pure-reject-reasons.ts";

// The supplier's name must never appear on a customer surface, and a
// rejection reason is printed on the customer's own screen. Written as a
// test rather than a comment, because the next person adding a template
// will be in a hurry.
const FORBIDDEN = [
  "seamx", "gradyn", "rockads", "supplier", "provider", "reseller",
  "partner", "upstream", "vendor",
];

test("no template names a supplier, in any wording", () => {
  for (const t of allRejectTemplates()) {
    const hay = (t.short + " " + t.text).toLowerCase();
    for (const word of FORBIDDEN) {
      assert.ok(
        !hay.includes(word),
        `template "${t.short}" contains "${word}": ${t.text}`,
      );
    }
  }
});

test("every context has templates and every template has both halves", () => {
  for (const ctx of ["wallet_topup", "account_topup", "account_request"] as const) {
    const list = rejectTemplates(ctx);
    assert.ok(list.length >= 4, `${ctx} has only ${list.length}`);
    for (const t of list) {
      assert.ok(t.short.length > 0 && t.short.length <= 22, t.short);
      // Long enough to say what to do next -- the whole point of having
      // these at all rather than "no valid pop".
      assert.ok(t.text.length >= 60, `too terse: ${t.short}`);
      assert.ok(t.text.trim() === t.text, `untrimmed: ${t.short}`);
      assert.ok(/[.!?]$/.test(t.text), `no full stop: ${t.short}`);
    }
  }
});

test("short labels are unique inside a context, so two chips cannot look alike", () => {
  for (const ctx of ["wallet_topup", "account_topup", "account_request"] as const) {
    const shorts = rejectTemplates(ctx).map((t) => t.short);
    assert.equal(new Set(shorts).size, shorts.length, ctx);
  }
});

test("templates are written to the customer, not about them", () => {
  for (const t of allRejectTemplates()) {
    const hay = t.text.toLowerCase();
    assert.ok(
      hay.includes("you") || hay.includes("your"),
      `not addressed to the customer: ${t.short}`,
    );
  }
});

test("an unknown context is empty, never undefined", () => {
  assert.deepEqual(
    rejectTemplates("nope" as unknown as "wallet_topup"),
    [],
  );
});
