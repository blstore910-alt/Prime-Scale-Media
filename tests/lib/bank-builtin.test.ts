import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  builtInBankDraft,
  builtInCurrencies,
  firstLine,
} from "../../lib/bank-builtin";

test("firstLine keeps the value and drops the explanation under it", () => {
  assert.equal(
    firstLine("101019628\n(Use this routing number for both Wire and ACH.)"),
    "101019628",
  );
  assert.equal(firstLine("BE86967511906550"), "BE86967511906550");
  assert.equal(firstLine(null), "");
});

test("TURLIT EUR carries the IBAN, the BIC and the bank, not a sentence", () => {
  const d = builtInBankDraft("turlit", "EUR");
  assert.ok(d);
  assert.equal(d!.beneficiary, "TURLIT LLC");
  assert.equal(d!.account_no, "BE86967511906550");
  assert.equal(d!.swift_bic, "TRWIBEB1XXX");
  assert.equal(d!.bank_name, "Wise");
  // Multi-line addresses flatten; the tail IS part of an address.
  assert.match(d!.bank_address, /Brussels/);
  assert.match(d!.bank_address, /Belgium/);
  assert.ok(!d!.bank_address.includes("\n"));
});

test("TURLIT USD takes the routing number without its parenthetical", () => {
  const d = builtInBankDraft("turlit", "USD");
  assert.ok(d);
  assert.equal(d!.routing_no, "101019628");
  assert.equal(d!.account_no, "218065661196");
  // The SWIFT value in this block ends with a sentence on the next line.
  assert.equal(d!.swift_bic, "TRWIUS35XXX");
});

test("ZANEL USD reads the trailing-XXX note off the BIC", () => {
  const d = builtInBankDraft("zanel", "USD");
  assert.ok(d);
  assert.equal(d!.beneficiary, "ZANEL ENTERPRISE");
  assert.equal(d!.swift_bic, "CLNOUS66XXX");
  assert.equal(d!.routing_no, "121145307");
  assert.equal(d!.account_no, "940045169143500");
});

test("a currency a group does not hold is null, not an empty row", () => {
  // ZANEL takes USD only. Offering a EUR destination there would invite a
  // transfer that bounces — which is why this returns null rather than a
  // blank row that looks configurable.
  assert.equal(builtInBankDraft("zanel", "EUR"), null);
  assert.equal(builtInBankDraft("zanel", "HKD"), null);
});

test("TURLIT does hold HKD, and it comes back filled", () => {
  // Caught by this test being written the other way round first: the HK
  // account is real (Wise HK / DBS), so a settings page that offered no HKD
  // destination would be hiding one we actually take money into.
  const d = builtInBankDraft("turlit", "HKD");
  assert.ok(d);
  assert.equal(d!.beneficiary, "TURLIT LLC");
  assert.equal(d!.account_no, "79680167588");
  assert.equal(d!.swift_bic, "DHBKHKHH");
  assert.match(d!.bank_name, /DBS Bank/);
});

test("builtInCurrencies reports what is actually held", () => {
  assert.deepEqual(builtInCurrencies("zanel"), ["USD"]);
  const turlit = builtInCurrencies("turlit");
  assert.ok(turlit.includes("USD"));
  assert.ok(turlit.includes("EUR"));
  assert.ok(turlit.includes("HKD"));
});

test("case and spacing in a currency code do not matter", () => {
  assert.deepEqual(builtInBankDraft("turlit", "eur"), builtInBankDraft("turlit", "EUR"));
});
