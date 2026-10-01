import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildLedgerDays, depositGap, latestBalance } from "../../lib/pure-supplier-ledger";

// Overgenomen uit het spreadsheet van de eigenaar (29-09-26): begin
// $4,414.83, vier klant-top-ups, $20.34 fees, echt eind $2,447.69 --
// verwacht volgens het sheet $4,435.17... dat sheet rekende de top-ups
// niet mee. Hier rekenen we het wel goed, en het verschil volgt.

test("een dag rekent begin + deposits - top-ups - fees - DST", () => {
  const dagen = buildLedgerDays(
    [
      { id: "a", day: "2026-09-28", kind: "deposit", amount: 4414.83 },
      { id: "b", day: "2026-09-29", kind: "customer_topup", amount: 268.33, clientRef: "PSM2127" },
      { id: "c", day: "2026-09-29", kind: "customer_topup", amount: 1128.8, clientRef: "PSM1644" },
      { id: "d", day: "2026-09-29", kind: "customer_topup", amount: 268.33, clientRef: "PSM2102" },
      { id: "e", day: "2026-09-29", kind: "customer_topup", amount: 322.0, clientRef: "PSM2121" },
      { id: "f", day: "2026-09-29", kind: "fee", amount: 20.34 },
    ],
    [
      { day: "2026-09-28", actualEnd: 4414.83 },
      { day: "2026-09-29", actualEnd: 2447.69 },
    ],
  );
  assert.equal(dagen.length, 2);
  assert.equal(dagen[1].start, 4414.83);
  assert.equal(dagen[1].topups, 1987.46);
  assert.equal(dagen[1].expectedEnd, 2407.03);
  assert.equal(dagen[1].difference, 40.66);
  assert.equal(dagen[1].status, "off");
});

test("binnen een cent klopt het", () => {
  const d = buildLedgerDays(
    [{ id: "a", day: "2026-10-01", kind: "deposit", amount: 100 }, { id: "b", day: "2026-10-01", kind: "dst", amount: 3.33 }],
    [{ day: "2026-10-01", actualEnd: 96.67 }],
  );
  assert.equal(d[0].status, "ok");
  assert.equal(d[0].difference, 0);
});

test("zonder echt eind is een dag open, en de volgende begint bij het verwachte", () => {
  const d = buildLedgerDays(
    [
      { id: "a", day: "2026-10-01", kind: "deposit", amount: 500 },
      { id: "b", day: "2026-10-02", kind: "customer_topup", amount: 120.5 },
    ],
    [],
  );
  assert.equal(d[0].status, "open");
  assert.equal(d[1].start, 500);
  assert.equal(d[1].expectedEnd, 379.5);
  assert.deepEqual(latestBalance(d), { day: "2026-10-02", amount: 379.5, actual: false });
});

test("de volgende dag begint bij het ECHTE eind als dat er is", () => {
  const d = buildLedgerDays(
    [{ id: "a", day: "2026-10-01", kind: "deposit", amount: 500 }, { id: "b", day: "2026-10-02", kind: "fee", amount: 10 }],
    [{ day: "2026-10-01", actualEnd: 490 }],
  );
  assert.equal(d[1].start, 490);
  assert.equal(d[1].expectedEnd, 480);
});

test("geen regels, geen saldo", () => {
  assert.equal(latestBalance(buildLedgerDays([], [])), null);
});

test("een wachtende of afgewezen correctie telt niet mee; een goedgekeurde wel", () => {
  const d = buildLedgerDays(
    [
      { id: "a", day: "2026-10-01", kind: "deposit", amount: 1000 },
      { id: "b", day: "2026-10-01", kind: "adjustment_out", amount: 50, status: "pending" },
      { id: "c", day: "2026-10-01", kind: "adjustment", amount: 20, status: "rejected" },
      { id: "d", day: "2026-10-01", kind: "adjustment_out", amount: 5 },
    ],
    [],
  );
  assert.equal(d[0].adjustments, -5);
  assert.equal(d[0].expectedEnd, 995);
  assert.equal(d[0].lines.length, 4);
});

test("het wisselgat: zij gaven 1.1266, wij rekenen 1.13 -- \$13.44 in hun voordeel", () => {
  const g = depositGap(
    { id: "a", day: "2026-10-01", kind: "deposit", amount: 4506.56, sentAmount: 4000, sentCurrency: "EUR" },
    1.13,
  );
  assert.deepEqual(g, { theirRate: 1.1266, gapUsd: -13.44 });
  assert.equal(depositGap({ id: "b", day: "2026-10-01", kind: "deposit", amount: 100 }, 1.13), null);
});
