import { strict as assert } from "node:assert";
import { test } from "node:test";
import { moneyLines } from "../../lib/pure-money-lines";

test("a currency with no activity does not get a line", () => {
  const lines = moneyLines({ amount: 0, count: 0 }, { amount: 75, count: 1 });
  assert.deepEqual(lines, [{ currency: "EUR", amount: 75 }]);
});

test("both currencies active gives both, USD first", () => {
  const lines = moneyLines({ amount: 10, count: 2 }, { amount: 75, count: 1 });
  assert.deepEqual(lines, [
    { currency: "USD", amount: 10 },
    { currency: "EUR", amount: 75 },
  ]);
});

// Het onderscheid waar dit hulpje voor bestaat. Een opwaardering en een
// terugboeking van hetzelfde bedrag is een ECHTE nul -- er is iets
// gebeurd en het saldo-effect was 0 -- en die regel hoort te blijven
// staan. Zou de filter op het bedrag kijken, dan verdween hij.
test("a real zero keeps its line, because something happened", () => {
  const lines = moneyLines({ amount: 0, count: 2 }, { amount: 0, count: 0 });
  assert.deepEqual(lines, [{ currency: "USD", amount: 0 }]);
});

test("nothing at all still yields one figure, never an empty card", () => {
  const lines = moneyLines({ amount: 0, count: 0 }, { amount: 0, count: 0 });
  assert.deepEqual(lines, [{ currency: "EUR", amount: 0 }]);
});

test("missing sides do not crash and do not invent a currency", () => {
  assert.deepEqual(moneyLines(null, undefined), [
    { currency: "EUR", amount: 0 },
  ]);
});

test("a nonsense amount reads as zero rather than NaN", () => {
  const lines = moneyLines(
    { amount: Number("x"), count: 1 },
    { amount: 0, count: 0 },
  );
  assert.deepEqual(lines, [{ currency: "USD", amount: 0 }]);
});
