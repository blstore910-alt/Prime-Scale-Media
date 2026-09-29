import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  rockadsHoldings,
  seamxHoldings,
  totalHoldings,
  type SupplierHolding,
} from "../../lib/pure-supplier-holdings.ts";

// ── THE FAULT THIS MODULE EXISTS TO PREVENT ────────────────────────
//
// 29-09, /finance-check: "Money involved $85,940.06" — a reduce over a
// list of mixed-currency rows, wearing the currency of the first one.
// RockAds returns exactly that shape, so the same one-liner would have
// produced the same lie about supplier credit, and a person would have
// funded against it.

test("euros and dollars are summed separately, never into one figure", () => {
  const { lines } = rockadsHoldings([
    { name: "EUR main", balance: 1000, currency: "EUR" },
    { name: "USD main", balance: 500, currency: "USD" },
    { name: "EUR spare", balance: 250.5, currency: "EUR" },
  ]);
  assert.equal(lines.length, 2);
  // EUR sorts first: it is the currency the desk works in.
  assert.equal(lines[0].currency, "EUR");
  assert.equal(lines[0].total, 1250.5);
  assert.equal(lines[1].currency, "USD");
  assert.equal(lines[1].total, 500);
});

test("the same currency written three ways is one line", () => {
  const { lines } = rockadsHoldings([
    { name: "a", balance: 10, currency: "eur" },
    { name: "b", balance: 10, currency: "EUR " },
    { name: "c", balance: 10, currency: "Eur" },
  ]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].total, 30);
});

test("a currency we did not expect gets its own line, not a silent drop", () => {
  const { lines, skipped } = rockadsHoldings([
    { name: "eu", balance: 100, currency: "EUR" },
    { name: "uk", balance: 80, currency: "GBP" },
  ]);
  assert.equal(skipped, 0);
  assert.equal(lines.length, 2);
  const gbp = lines.find((l) => l.currency === "GBP");
  assert.ok(gbp, "a GBP wallet must appear as GBP");
  assert.equal(gbp!.total, 80);
  // And it must NOT have inflated the euro line.
  assert.equal(lines.find((l) => l.currency === "EUR")!.total, 100);
});

test("a wallet with no currency is counted, not guessed at", () => {
  const { lines, skipped } = rockadsHoldings([
    { name: "ok", balance: 100, currency: "EUR" },
    { name: "no currency", balance: 40, currency: null },
    { name: "no balance", balance: null, currency: "EUR" },
  ]);
  assert.equal(skipped, 2);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].total, 100);
});

test("every wallet behind a figure is kept for the click-through", () => {
  const { lines } = rockadsHoldings([
    { name: "Wallet A", balance: 1, currency: "EUR" },
    { code: "W-B", balance: 2, currency: "EUR" },
    { balance: 3, currency: "EUR" },
  ]);
  assert.deepEqual(
    lines[0].parts.map((p) => p.label),
    ["Wallet A", "W-B", "Wallet"],
  );
});

test("no wallets is an empty list, not a zero line", () => {
  assert.deepEqual(rockadsHoldings([]).lines, []);
  assert.deepEqual(rockadsHoldings(null).lines, []);
});

// ── SEAMX: GROSS, SPENDABLE, AND THE DST IN BETWEEN ────────────────

test("what SeamX holds back is the difference, and it is named", () => {
  const lines = seamxHoldings({
    usd_balance: 1000,
    available_usd: 900,
    eur_balance: 500,
    available_eur: 500,
  });
  const usd = lines.find((l) => l.currency === "USD")!;
  assert.equal(usd.total, 1000);
  assert.equal(usd.available, 900);
  assert.equal(usd.heldBack, 100);
  // Nothing held back is null, not 0 — "they reserve nothing" and "they
  // reserve zero" read the same on screen and only one is a claim.
  const eur = lines.find((l) => l.currency === "EUR")!;
  assert.equal(eur.heldBack, null);
});

test("spendable above gross is never reported as a negative reserve", () => {
  const lines = seamxHoldings({ usd_balance: 100, available_usd: 150 });
  assert.equal(lines[0].heldBack, null);
  assert.equal(lines[0].available, 150);
});

test("a currency SeamX does not report is left out, not shown as zero", () => {
  const lines = seamxHoldings({ usd_balance: 42, available_usd: 42 });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].currency, "USD");
});

test("no balance object at all yields no lines", () => {
  assert.deepEqual(seamxHoldings(null), []);
  assert.deepEqual(seamxHoldings({}), []);
});

test("a gross with no available figure does not pretend it is all spendable", () => {
  const lines = seamxHoldings({ eur_balance: 300, available_eur: null });
  assert.equal(lines[0].total, 300);
  assert.equal(lines[0].available, null);
  assert.equal(lines[0].heldBack, null);
});

// ── THE TOTAL, AND WHEN THERE ISN'T ONE ────────────────────────────

const ok = (supplier: string, lines: SupplierHolding["lines"]) =>
  ({ supplier, status: "ok", error: null, lines }) as SupplierHolding;

const line = (currency: string, total: number) => ({
  currency,
  total,
  available: null,
  heldBack: null,
  parts: [],
});

test("the total adds the same currency across suppliers", () => {
  const { lines, complete } = totalHoldings([
    ok("RockAds", [line("EUR", 100), line("USD", 50)]),
    ok("SeamX", [line("EUR", 25)]),
  ]);
  assert.equal(complete, true);
  assert.deepEqual(lines, [
    { currency: "EUR", total: 125 },
    { currency: "USD", total: 50 },
  ]);
});

test("a supplier we could not read makes the total incomplete", () => {
  const { lines, complete } = totalHoldings([
    ok("RockAds", [line("EUR", 100)]),
    { supplier: "SeamX", status: "error", error: "timeout", lines: [] },
  ]);
  assert.equal(complete, false);
  // The figure it CAN see is still returned — the panel decides what to
  // print — but `complete: false` is what stops it being called a total.
  assert.deepEqual(lines, [{ currency: "EUR", total: 100 }]);
});

test("a supplier switched off holds nothing, and that is not incomplete", () => {
  const { complete } = totalHoldings([
    ok("RockAds", [line("EUR", 100)]),
    { supplier: "SeamX", status: "off", error: null, lines: [] },
  ]);
  assert.equal(complete, true);
});

test("a failed supplier's stale lines never reach the total", () => {
  const { lines } = totalHoldings([
    { supplier: "SeamX", status: "error", error: "500", lines: [line("EUR", 9_999)] },
  ]);
  assert.deepEqual(lines, []);
});

test("cents survive a list of thirds", () => {
  const { lines } = rockadsHoldings([
    { name: "a", balance: 0.1, currency: "EUR" },
    { name: "b", balance: 0.2, currency: "EUR" },
  ]);
  assert.equal(lines[0].total, 0.3);
});

// ── THE MOCK IS THE MOST DANGEROUS ANSWER OF THE FOUR ──────────────
//
// SeamX runs on the MOCK adapter unless SUPPLIER1_MODE is exactly
// "live", and the default is mock. The mock returns `ok: true` with
// USD 5,000 / EUR 2,000 and a 3% reserve — a completely plausible set
// of figures. Put on a dashboard unlabelled, that is invented supplier
// credit read as fact by the person deciding whether to fund a top-up.

test("a demo supplier never contributes to the total", () => {
  const { lines, complete } = totalHoldings([
    ok("RockAds", [line("EUR", 100)]),
    {
      supplier: "SeamX",
      status: "demo",
      error: null,
      lines: [line("USD", 5_000), line("EUR", 2_000)],
    },
  ]);
  assert.deepEqual(lines, [{ currency: "EUR", total: 100 }]);
  // And the total is not called complete: the real SeamX balance is as
  // unknown as it would be after a timeout.
  assert.equal(complete, false);
});

test("only ok and off make a complete total", () => {
  const states: SupplierHolding["status"][] = ["ok", "off", "error", "demo"];
  const completeFor = (status: SupplierHolding["status"]) =>
    totalHoldings([{ supplier: "X", status, error: null, lines: [] }]).complete;
  assert.deepEqual(
    states.map(completeFor),
    [true, true, false, false],
  );
});
