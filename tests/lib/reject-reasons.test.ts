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
  for (const ctx of ["wallet_topup", "account_topup", "account_request", "withdrawal"] as const) {
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
  for (const ctx of ["wallet_topup", "account_topup", "account_request", "withdrawal"] as const) {
    const shorts = rejectTemplates(ctx).map((t) => t.short);
    assert.equal(new Set(shorts).size, shorts.length, ctx);
  }
});

const CUSTOMER_FACING = [
  "wallet_topup",
  "account_topup",
  "account_request",
  "withdrawal",
] as const;

test("templates the customer reads are written TO them, not about them", () => {
  for (const ctx of CUSTOMER_FACING) {
    for (const t of rejectTemplates(ctx)) {
      const hay = t.text.toLowerCase();
      assert.ok(
        hay.includes("you") || hay.includes("your"),
        `${ctx}: not addressed to the customer: ${t.short}`,
      );
    }
  }
});

test("the internal reason is NOT written to the customer", () => {
  // A wallet refund and a wallet adjustment are raised by an admin.
  // The customer has no row for them on any screen and gets no
  // notification. These used to borrow the withdrawal templates, so
  // they offered "we could not find a payment matching this" to a
  // reader who is a colleague, and promised under the button that
  // "the customer reads it" — which nobody does.
  //
  // The reader here is the next admin, or you in three months looking
  // at why money did or did not move. Second person would be
  // addressing the wrong person, so this rule runs the other way.
  const internal = rejectTemplates("internal");
  assert.ok(internal.length >= 4, "the internal context needs templates");
  for (const t of internal) {
    assert.doesNotMatch(
      t.text,
      /\b(you|your)\b/i,
      `internal reason addresses the customer: ${t.short}`,
    );
  }
});

test("every context is covered by one of the two rules", () => {
  // So a fifth context added next year cannot slip past both. Without
  // this, adding one and forgetting to classify it means neither rule
  // applies and anything goes.
  const all = allRejectTemplates().length;
  const counted =
    CUSTOMER_FACING.reduce((n, c) => n + rejectTemplates(c).length, 0) +
    rejectTemplates("internal").length;
  assert.equal(
    counted,
    all,
    "a reject context exists that neither rule checks — add it above",
  );
});

test("an unknown context is empty, never undefined", () => {
  assert.deepEqual(
    rejectTemplates("nope" as unknown as "wallet_topup"),
    [],
  );
});
