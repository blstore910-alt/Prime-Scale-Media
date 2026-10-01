import { test } from "node:test";
import assert from "node:assert/strict";
import { splitAddress } from "../../lib/pure-address-split.ts";

const asMap = (v: string) =>
  Object.fromEntries((splitAddress(v) ?? []).map((p) => [p.label, p.value]));

test("a European address: street, city, postal code, country", () => {
  assert.deepEqual(asMap("Rue du Trône 100, 3rd floor\nBrussels, 1050\nBelgium"), {
    Street: "Rue du Trône 100, 3rd floor",
    City: "Brussels",
    "Postal code": "1050",
    Country: "Belgium",
  });
});

test("a US address gets state and ZIP apart", () => {
  assert.deepEqual(asMap("30 N Gould St\nSheridan, WY 82801-6317\nUnited States"), {
    Street: "30 N Gould St",
    City: "Sheridan",
    State: "WY",
    "ZIP code": "82801-6317",
    Country: "United States",
  });
});

test("a name line in front is kept as the name", () => {
  const m = asMap("Wise Payments Limited\nWorship Square, 65 Clifton Street\nLondon, EC2A 4JE\nUnited Kingdom");
  assert.equal(m.Name, "Wise Payments Limited");
  assert.equal(m.Street, "Worship Square, 65 Clifton Street");
  assert.equal(m["Postal code"], "EC2A 4JE");
});

test("anything else is left alone", () => {
  assert.equal(splitAddress("One line only"), null);
  assert.equal(splitAddress("Street\nNo comma here\nCountry"), null);
});
