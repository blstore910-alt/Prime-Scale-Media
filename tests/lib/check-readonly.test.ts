import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  splitStatements,
  firstWord,
  refuseWrites,
  makeMasker,
  cell,
  sslFor,
  DATE_OID,
} from "../../scripts/check.mjs";

/**
 * `npm run check` holds a connection to the LIVE database. Two things
 * keep it from ever writing: the server (BEGIN READ ONLY ... ROLLBACK)
 * and this refusal, which never lets a write leave the machine. The
 * server side cannot be tested from here; this side can, and must be,
 * because it is the half that decides what is even sent.
 */

const refuse = (sql: string) => refuseWrites(splitStatements(sql));

describe("check.mjs refuses anything that is not a read", () => {
  for (const sql of [
    "delete from wallets",
    "update wallets set balance = 0",
    "insert into wallets (id) values (1)",
    "drop table wallets",
    "alter table wallets add column x int",
    "truncate wallets",
    "grant select on wallets to anon",
    "create role hacker",
    "call some_procedure()",
    "do $blk0$ begin delete from wallets; end $blk0$",
    "copy wallets to stdout",
    "refresh materialized view mv",
    "set role postgres",
  ]) {
    test(sql.slice(0, 40), () => assert.ok(refuse(sql), `should refuse: ${sql}`));
  }
});

describe("and lets a read through", () => {
  for (const sql of [
    "select now()",
    "SELECT count(*) FROM wallets",
    "with x as (select 1 as n) select * from x",
    "explain select * from wallets",
    "show statement_timeout",
    "table tenants",
    "values (1), (2)",
    "-- a comment first\nselect 1",
    "/* and a block comment */ select 1",
    "select 'delete from wallets' as harmless_text",
  ]) {
    test(sql.slice(0, 40), () => assert.equal(refuse(sql), null, `should allow: ${sql}`));
  }
});

describe("the ways a write hides behind a read", () => {
  test("a CTE that deletes is not a read", () => {
    assert.match(
      refuse("with gone as (delete from wallets returning *) select * from gone") ?? "",
      /DELETE/,
    );
  });

  test("a CTE that updates is not a read", () => {
    assert.ok(refuse("with x as (update wallets set balance = 0 returning *) select * from x"));
  });

  test("EXPLAIN ANALYZE runs the statement, so it is refused", () => {
    assert.match(refuse("explain analyze delete from wallets") ?? "", /ANALYZE/);
    assert.match(refuse("EXPLAIN (ANALYZE, BUFFERS) select 1") ?? "", /ANALYZE/);
  });

  test("a write hiding behind a harmless first statement", () => {
    assert.ok(refuse("select 1; delete from wallets"));
  });

  test("a semicolon inside a string does not end the statement", () => {
    // If the split were naive, the second "statement" here would be
    // ` delete from wallets'` -- and the first would look like a read.
    assert.equal(splitStatements("select 'a;b' as s").length, 1);
    assert.ok(refuse("select 'a;b'; delete from wallets"));
  });

  test("a semicolon inside a dollar-quoted block does not end it either", () => {
    assert.equal(splitStatements("select $blk0$ a; b $blk0$ as s").length, 1);
  });

  test("a semicolon inside a comment does not end it either", () => {
    assert.equal(splitStatements("select 1 -- ; not a statement\n").length, 1);
  });

  test("a doubled quote inside a string", () => {
    assert.equal(splitStatements("select 'it''s fine; really' as s").length, 1);
  });

  test("trailing semicolons and blank statements are dropped", () => {
    assert.deepEqual(splitStatements("select 1;;\n  ;"), ["select 1"]);
  });
});

describe("firstWord looks past whitespace and comments", () => {
  test("plain", () => assert.equal(firstWord("  SELECT 1"), "select"));
  test("line comment", () => assert.equal(firstWord("-- hi\n  delete from x"), "delete"));
  test("block comment", () => assert.equal(firstWord("/* hi */ update x"), "update"));
  test("nothing but a comment", () => assert.equal(firstWord("-- hi"), ""));
});

describe("the password never reaches the terminal", () => {
  const url = "postgresql://psm_check.abc:sup3r-s3cret@host.pooler.supabase.com:5432/postgres";
  const mask = makeMasker(url);

  test("in a driver error", () => {
    const out = mask('password authentication failed for "sup3r-s3cret"');
    assert.ok(!out.includes("sup3r-s3cret"));
    assert.match(out, /\*{8}/);
  });

  test("in the connection string itself", () => {
    assert.ok(!mask(url).includes("sup3r-s3cret"));
  });

  test("a percent-encoded password is masked in both spellings", () => {
    const m = makeMasker("postgresql://u:a%40b@h:5432/db");
    assert.ok(!m("tried a@b").includes("a@b"));
    assert.ok(!m("tried a%40b").includes("a%40b"));
  });

  test("an unparseable string does not throw", () => {
    assert.equal(makeMasker("not a url")("hello"), "hello");
  });
});

describe("cells print as themselves", () => {
  test("null is empty, not the word null", () => assert.equal(cell(null), ""));
  test("undefined is empty", () => assert.equal(cell(undefined), ""));
  test("zero stays zero", () => assert.equal(cell(0), "0"));
  test("a number keeps its cents", () => assert.equal(cell(10.5), "10.5"));
  test("a date is readable", () =>
    assert.equal(cell(new Date("2026-09-22T19:47:00Z")), "2026-09-22 19:47:00"));
  test("an object is json", () => assert.equal(cell({ a: 1 }), '{"a":1}'));
});

describe("the ssl parameters come out of the string", () => {
  // Supabase hands you ?sslmode=require. pg reads that as verify-full,
  // and then its own certificate chain fails. The parameter also beats
  // the ssl object passed beside it, so it has to go.
  const base = "postgresql://u:p@db.example.supabase.co:5432/postgres";

  test("sslmode=require encrypts without verifying", () => {
    const { dsn, ssl } = sslFor(base + "?sslmode=require");
    assert.ok(!dsn.includes("sslmode"));
    assert.deepEqual(ssl, { rejectUnauthorized: false });
  });

  test("no sslmode at all behaves the same", () => {
    const { dsn, ssl } = sslFor(base);
    assert.equal(dsn.replace(/\/$/, ""), base);
    assert.deepEqual(ssl, { rejectUnauthorized: false });
  });

  test("verify-full is honoured, and still leaves the string clean", () => {
    const { dsn, ssl } = sslFor(base + "?sslmode=verify-full");
    assert.equal(ssl, true);
    assert.ok(!dsn.includes("sslmode"));
  });

  test("the other ssl parameters go too", () => {
    const { dsn } = sslFor(base + "?sslmode=require&uselibpqcompat=true&sslrootcert=/x.crt");
    assert.ok(!dsn.includes("uselibpqcompat"));
    assert.ok(!dsn.includes("sslrootcert"));
  });

  test("anything else in the string survives", () => {
    const { dsn } = sslFor(base + "?sslmode=require&application_name=psm");
    assert.ok(dsn.includes("application_name=psm"));
  });

  test("the password survives the round trip", () => {
    const { dsn } = sslFor("postgresql://u:a%40b@h:5432/db?sslmode=require");
    assert.ok(dsn.includes("a%40b"));
  });

  test("an unparseable string is left alone", () => {
    assert.equal(sslFor("not a url").dsn, "not a url");
  });
});

describe("a DATE has no time, and no timezone to shift it", () => {
  // A correct period_start of 2026-09-14 printed as "2026-09-13 22:00:00"
  // because the driver hands a DATE back at LOCAL midnight and this
  // printed it in UTC. Reading money by date is half of what this tool
  // is for, so the day must not move.
  test("a DATE prints as the day itself", () => {
    const d = new Date(2026, 8, 14, 0, 0, 0);
    assert.equal(cell(d, DATE_OID), "2026-09-14");
  });

  test("the first of the month keeps its leading zeroes", () => {
    assert.equal(cell(new Date(2026, 0, 1, 0, 0, 0), DATE_OID), "2026-01-01");
  });

  test("a timestamp still shows its time", () => {
    assert.equal(
      cell(new Date("2026-09-22T19:47:00Z")),
      "2026-09-22 19:47:00",
    );
  });
});
