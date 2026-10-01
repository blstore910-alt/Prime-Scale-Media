import { strict as assert } from "node:assert";
import { test } from "node:test";
import { accountNameProblem } from "../../lib/pure-account-name";

test("de namen die nu bestaan mogen", () => {
  for (const n of ["AA-PSM0016-EU-01", "AA-PSM0005-EU-02", "AA-E2E-1788269360779", "D2-0011-WALK", "test1321", "Shop Ads Main"]) {
    assert.equal(accountNameProblem(n), null, n);
  }
});

test("HK, GH en leveranciers niet", () => {
  for (const n of ["AA-PSM0019-HK-01", "AA-PSM0019-GH-01", "hk main", "Rockads 1", "AA-Falkyn-2", "Bestads-01", "PSM premium"]) {
    assert.ok(accountNameProblem(n), n);
  }
});

test("een woord dat 'hk' of 'gh' alleen bevat mag wel", () => {
  assert.equal(accountNameProblem("Highlight shop"), null);
  assert.equal(accountNameProblem("Thinking"), null);
});
