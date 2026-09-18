import test from "node:test";
import assert from "node:assert/strict";
import {
  isCompanyComplete,
  missingCompanyFields,
} from "../../lib/pure-company-complete.ts";

const full = {
  name: "Acme BV",
  official_email: "billing@acme.example",
  phone: "+31 20 000 0000",
  address: "Keizersgracht 1",
  country: "NL",
  state: "NH",
  zipcode: "1015 CJ",
  vat_no: "NL000000000B01",
  billings: [
    {
      address: "Keizersgracht 1",
      state: "NH",
      country: "NL",
      zipcode: "1015 CJ",
    },
  ],
};

test("a fully filled company is complete", () => {
  assert.equal(isCompanyComplete(full), true);
  assert.deepEqual(missingCompanyFields(full), []);
});

// THE FAULT THIS FILE EXISTS FOR. The checklist ticked the step green on
// the company row alone while the gate — the thing that greys out Top up,
// Exchange and Request an account — also wanted the billing address. So
// the customer read "done" and nothing unlocked.
test("the billing address is required, and it is the one people miss", () => {
  const noBilling = { ...full, billings: [] };
  assert.equal(isCompanyComplete(noBilling), false);
  assert.deepEqual(missingCompanyFields(noBilling), ["billing address"]);

  const halfBilling = {
    ...full,
    billings: [{ address: "Keizersgracht 1", state: "", country: "NL", zipcode: "1015 CJ" }],
  };
  assert.equal(isCompanyComplete(halfBilling), false);
});

// A VAT-exempt business ticks the box and has no number to give.
// Demanding one locked them out of topping up permanently, with no way to
// satisfy the condition.
test("not-VAT-registered satisfies the VAT requirement", () => {
  const exempt = { ...full, vat_no: "", is_not_vat: true };
  assert.equal(isCompanyComplete(exempt), true);

  const neither = { ...full, vat_no: "", is_not_vat: false };
  assert.equal(isCompanyComplete(neither), false);
  assert.ok(missingCompanyFields(neither)[0].startsWith("VAT number"));
});

// PostgREST returns a one-to-one embed as an object rather than an array
// on some versions. Reading `[0]` off that yields undefined, which would
// report a complete company as missing its billing address for ever.
test("a billing embed that came back as an object still counts", () => {
  const asObject = { ...full, billings: full.billings[0] };
  assert.equal(isCompanyComplete(asObject), true);
});

test("nothing at all lists every field, once each", () => {
  const missing = missingCompanyFields(null);
  assert.equal(missing.length, 9);
  assert.equal(new Set(missing).size, missing.length);
  // Whitespace is not a value.
  assert.equal(isCompanyComplete({ ...full, name: "   " }), false);
});
