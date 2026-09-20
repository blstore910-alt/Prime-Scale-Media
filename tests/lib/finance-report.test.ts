import test from "node:test";
import assert from "node:assert/strict";
import {
  filterLines,
  summarise,
  sortLines,
  toCsv,
  currenciesIn,
  accountsIn,
  KIND_LABELS,
  KIND_ORDER,
  type FinanceLine,
} from "../../lib/pure-finance-report.ts";

const line = (o: Partial<FinanceLine> & { id: string }): FinanceLine => ({
  at: "2026-09-10T12:00:00.000Z",
  kind: "wallet_topup",
  label: "Top-up",
  reference: null,
  account: null,
  counterparty: null,
  currency: "EUR",
  amount: 100,
  status: "completed",
  ...o,
});

const SAMPLE: FinanceLine[] = [
  line({ id: "1", at: "2026-09-01T10:00:00.000Z", amount: 1000 }),
  line({
    id: "2",
    at: "2026-09-02T10:00:00.000Z",
    kind: "account_topup",
    amount: -500,
    account: "Meta EU 1",
  }),
  line({ id: "3", at: "2026-09-02T11:00:00.000Z", kind: "fee", amount: -25 }),
  line({
    id: "4",
    at: "2026-09-18T09:00:00.000Z",
    currency: "USD",
    amount: 2000,
  }),
];

test("money in and money out are separated, not netted away", () => {
  const [eur] = summarise(SAMPLE.filter((l) => l.currency === "EUR"));
  assert.equal(eur.in, 1000);
  assert.equal(eur.out, 525);
  assert.equal(eur.net, 475);
  assert.equal(eur.count, 3);
});

// A total of "1500" across a $1,000 and a EUR 500 movement is not a
// number. This is the rule the whole module is built on.
test("currencies are never added together", () => {
  const totals = summarise(SAMPLE);
  assert.equal(totals.length, 2);
  assert.deepEqual(
    totals.map((t) => t.currency),
    ["EUR", "USD"],
  );
  assert.equal(totals[1].in, 2000);
});

test("a per-kind breakdown keeps its sign", () => {
  const [eur] = summarise(SAMPLE.filter((l) => l.currency === "EUR"));
  assert.equal(eur.byKind.wallet_topup, 1000);
  assert.equal(eur.byKind.account_topup, -500);
  assert.equal(eur.byKind.fee, -25);
});

// The bug every date filter has: "up to the 18th" dropping the 18th.
test("the end date includes the whole of that day", () => {
  const got = filterLines(SAMPLE, { from: "2026-09-02", to: "2026-09-18" });
  assert.equal(got.length, 3);
  assert.ok(got.some((l) => l.id === "4"));
});

test("a start date excludes what came before it", () => {
  const got = filterLines(SAMPLE, { from: "2026-09-02" });
  assert.equal(got.length, 3);
  assert.ok(!got.some((l) => l.id === "1"));
});

test("no filter means everything", () => {
  assert.equal(filterLines(SAMPLE).length, 4);
  assert.equal(filterLines(SAMPLE, { kinds: [], currencies: [] }).length, 4);
});

test("kind and currency filters combine", () => {
  const got = filterLines(SAMPLE, {
    kinds: ["wallet_topup"],
    currencies: ["eur"],
  });
  assert.equal(got.length, 1);
  assert.equal(got[0].id, "1");
});

test("the account filter matches part of a name, either case", () => {
  assert.equal(filterLines(SAMPLE, { account: "meta" }).length, 1);
  assert.equal(filterLines(SAMPLE, { account: "tiktok" }).length, 0);
});

test("search looks across every text field, not only the label", () => {
  const rows = [
    line({ id: "a", reference: "PSM0005-121" }),
    line({ id: "b", counterparty: "Acme BV" }),
    line({ id: "c", account: "Meta EU 2" }),
  ];
  assert.equal(filterLines(rows, { search: "0005-121" })[0].id, "a");
  assert.equal(filterLines(rows, { search: "acme" })[0].id, "b");
  assert.equal(filterLines(rows, { search: "eu 2" })[0].id, "c");
});

test("newest first — a report is read from today backwards", () => {
  assert.deepEqual(
    sortLines(SAMPLE).map((l) => l.id),
    ["4", "3", "2", "1"],
  );
});

// A company name with a comma in it has silently split a row in every
// export that forgot this.
test("a comma in a name does not split the row", () => {
  const csv = toCsv([line({ id: "x", label: "Acme, Inc. top-up" })]);
  const body = csv.trim().split("\n")[1];
  assert.ok(body.includes('"Acme, Inc. top-up"'), body);
  assert.equal(csv.trim().split("\n").length, 2);
});

test("a quote inside a field is doubled, not dropped", () => {
  const csv = toCsv([line({ id: "x", label: 'The "Big" account' })]);
  assert.ok(csv.includes('"The ""Big"" account"'), csv);
});

test("a newline inside a field stays inside its own row", () => {
  const csv = toCsv([line({ id: "x", label: "line one\nline two" })]);
  assert.ok(csv.includes('"line one\nline two"'));
});

// Excel and Sheets evaluate a cell starting with = + - @ as a formula.
test("a formula in a company name is neutralised", () => {
  const csv = toCsv([line({ id: "x", label: "=HYPERLINK(\"http://x\")" })]);
  assert.ok(csv.includes("'=HYPERLINK"), csv);
});

test("the amount column is plain and summable", () => {
  const csv = toCsv([line({ id: "x", amount: -1234.5 })]);
  assert.ok(csv.includes(",-1234.50,"), csv);
});

test("the export always carries a header and a final newline", () => {
  const csv = toCsv([]);
  assert.ok(csv.startsWith("Date,Type,Description"));
  assert.ok(csv.endsWith("\n"));
});

test("the filters are built from the data that is there", () => {
  assert.deepEqual(currenciesIn(SAMPLE), ["EUR", "USD"]);
  assert.deepEqual(accountsIn(SAMPLE), ["Meta EU 1"]);
});

test("an empty report summarises to nothing, not to zero rows of noise", () => {
  assert.deepEqual(summarise([]), []);
  assert.deepEqual(currenciesIn([]), []);
});


// ── THE THREE LISTS HAVE TO AGREE ────────────────────────────────────
//
// A kind lives in three places: the union, KIND_LABELS and KIND_ORDER.
// TypeScript makes the Record exhaustive, so a missing LABEL cannot
// compile — but KIND_ORDER is a plain array, and a kind left out of it
// simply never appears in the filter dropdown. The line is then in the
// report, in the totals and in the CSV, and unfilterable, which is the
// kind of gap nobody notices because everything still works.
test("every labelled kind is offered in the filter", () => {
  const labelled = Object.keys(KIND_LABELS).sort();
  const ordered = [...KIND_ORDER].sort();
  assert.deepEqual(ordered, labelled);
  assert.equal(new Set(KIND_ORDER).size, KIND_ORDER.length);
});

// Refunds and adjustments arrive pre-signed from the server, and the
// summary has to read them from the customer's side: a refund LEAVES the
// wallet, an adjustment carries its own delta either way.
test("refunds count as money out, adjustments either way", () => {
  const t = summarise([
    line({ id: "r1", kind: "refund", amount: -500, currency: "EUR" }),
    line({ id: "a1", kind: "adjustment", amount: 25, currency: "EUR" }),
    line({ id: "a2", kind: "adjustment", amount: -10, currency: "EUR" }),
  ]);
  const eur = t.find((x) => x.currency === "EUR");
  assert.ok(eur);
  assert.equal(eur.out, 510);
  assert.equal(eur.in, 25);
  assert.equal(eur.net, -485);
});

test("a partial export says so IN the file, not only on the screen", () => {
  const lines = [
    {
      id: "l1",
      at: "2026-08-01",
      kind: "topup" as const,
      label: "Wallet top-up",
      reference: null,
      account: null,
      counterparty: null,
      status: "completed",
      currency: "EUR",
      amount: 100,
    },
  ] as unknown as Parameters<typeof toCsv>[0];

  const plain = toCsv(lines);
  assert.ok(!plain.startsWith("#"), "a complete file carries no caveat");

  const partial = toCsv(lines, {
    failed: ["wallet_topups"],
    truncated: true,
    filters: "Aug 2026",
  });
  // The reason this exists: a report that lost wallet_topups exported
  // with no income rows and nothing saying so.
  assert.ok(partial.includes("INCOMPLETE"), partial.slice(0, 200));
  assert.ok(partial.includes("wallet_topups"));
  assert.ok(partial.includes("PARTIAL"));
  assert.ok(partial.includes("Aug 2026"));
  // The data still parses: caveats are comment rows above the header,
  // and the header row is still there.
  assert.ok(partial.includes("Wallet top-up"));
});

test("a caveat line cannot break out of its own cell", () => {
  const out = toCsv([], { failed: ['a,b"c\nd'] });
  const first = out.split("\n")[0];
  // One cell: the injected comma and quote stay inside the quotes.
  assert.ok(first.startsWith('"#'), first);
  assert.equal(first.split("\n").length, 1);
});
