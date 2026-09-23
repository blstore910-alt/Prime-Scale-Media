#!/usr/bin/env node
/**
 * Read the live database. Never write to it.
 *
 * WHY THIS EXISTS. Checking a figure on screen against the database
 * used to cost ten minutes: write a SQL file, hand it over, wait for it
 * to be pasted into the Supabase editor, wait for the result table to
 * come back -- for a question the database answers in two milliseconds.
 * Over a walkthrough of sixteen journeys that is most of a day.
 *
 *   npm run check -- "select count(*) from wallets"
 *   npm run check -- -f supabase/checks/SOME-READ.sql
 *   npm run check -- --json "select id, balance from wallets limit 5"
 *   npm run check -- --setup          # what to do if it is not wired yet
 *
 * WHAT KEEPS IT HONEST
 *
 *   1  Every statement runs inside BEGIN READ ONLY and ends in ROLLBACK.
 *      Postgres itself refuses a write in that transaction -- including
 *      one hidden inside a SECURITY DEFINER function -- so the lock is
 *      on the server, not a promise in a script.
 *   2  On top of that a statement must START with select / with /
 *      explain / show / table / values, and a CTE containing insert,
 *      update, delete or merge is refused before it is ever sent.
 *   3  A connection that can see no tenants is a connection that RLS is
 *      blinding, not an empty database. It says so, instead of printing
 *      a confident zero.
 *
 * The connection string lives in .env.check, which git ignores. It is
 * never printed: the password is masked out of every line this script
 * writes, including the driver's own error messages.
 */

import { readFileSync, existsSync, writeFileSync, chmodSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = join(ROOT, ".env.check");
const VAR = "CHECK_DATABASE_URL";

/** Statements that only read. Anything else is refused before sending. */
const READ_STARTS = ["select", "with", "explain", "show", "table", "values"];
/** A CTE can write: `with x as (delete ... returning *)` is not a read. */
const WRITE_WORDS =
  /\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|call|copy|vacuum|reindex|refresh)\b/i;

const SETUP = [
  "Not wired up yet. Two steps, once.",
  "",
  "1. Make a read-only login on the database",
  "   Open supabase/checks/PLAK-DIT-59-LEESACCOUNT.sql, put a password of",
  "   your own on the ONE line marked <== VERANDER DIT, and paste the whole",
  "   file into the Supabase SQL editor. Row 5 of the table it prints says",
  "   whether that login can see past row-level security; if it cannot, it",
  "   says so, and you use the postgres string instead.",
  "",
  "2. Hand the connection string over, once",
  "",
  "      npm run check -- --init",
  "",
  "   It asks for the string, does not show it while you paste, writes it",
  "   to .env.check (which git ignores) and tries it straight away.",
  "",
  "   The string is in Supabase -> Project Settings -> Database ->",
  '   Connection string -> "Session pooler". Swap in the user and the',
  "   password from step 1 -- through the pooler the user carries the",
  "   project reference after a dot: psm_check.abcdefghijklm, not plain",
  "   psm_check.",
  "",
  'Then: npm run check -- "select now()"',
].join("\n");

// -- reading .env.check ----------------------------------------------
function connectionString() {
  if (process.env[VAR]) return process.env[VAR].trim();
  if (!existsSync(ENV_FILE)) return null;
  for (const raw of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    if (line.slice(0, eq).trim() !== VAR) continue;
    return line
      .slice(eq + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  return null;
}

/** Never let the password reach the terminal, whoever printed it. */
export function makeMasker(url) {
  const secrets = [];
  try {
    const u = new URL(url);
    if (u.password) secrets.push(decodeURIComponent(u.password), u.password);
  } catch {
    /* an unparseable string has nothing to mask */
  }
  return (text) => {
    let out = String(text ?? "");
    for (const s of secrets) if (s) out = out.split(s).join("********");
    return out;
  };
}

// -- splitting, for the safety check only ----------------------------
/**
 * Split on semicolons that are not inside a string, a dollar-quoted
 * block or a comment. The whole text still goes to the server in one
 * piece -- this split exists to look at what each statement STARTS with.
 */
export function splitStatements(sql) {
  const out = [];
  let buf = "";
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      const end = sql.indexOf("\n", i);
      const stop = end < 0 ? sql.length : end;
      buf += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (two === "/*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end < 0 ? sql.length : end + 2;
      buf += sql.slice(i, stop);
      i = stop;
      continue;
    }
    const ch = sql[i];
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === ch && sql[j + 1] === ch) j += 2;
        else if (sql[j] === ch) break;
        else j += 1;
      }
      buf += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === "$") {
      const tag = /^\$[A-Za-z_][A-Za-z_0-9]*\$|^\$\$/.exec(sql.slice(i));
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        const stop = end < 0 ? sql.length : end + tag[0].length;
        buf += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (ch === ";") {
      out.push(buf);
      buf = "";
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Strip leading comments so the first real word is visible. */
export function firstWord(statement) {
  let s = statement;
  for (;;) {
    s = s.replace(/^\s+/, "");
    if (s.startsWith("--")) {
      const nl = s.indexOf("\n");
      s = nl < 0 ? "" : s.slice(nl + 1);
      continue;
    }
    if (s.startsWith("/*")) {
      const end = s.indexOf("*/");
      s = end < 0 ? "" : s.slice(end + 2);
      continue;
    }
    break;
  }
  return (/^[a-z_]+/i.exec(s)?.[0] ?? "").toLowerCase();
}

export function refuseWrites(statements) {
  for (const st of statements) {
    const word = firstWord(st);
    if (!READ_STARTS.includes(word)) {
      return `"${word || st.slice(0, 20)}" is not a read. This connection only selects; a change goes into the SQL editor by hand.`;
    }
    if (word === "with") {
      const m = WRITE_WORDS.exec(st);
      if (m) return `a WITH block containing ${m[1].toUpperCase()} writes. Refused.`;
    }
    // EXPLAIN describes a plan -- except with ANALYZE, which RUNS the
    // statement. "explain analyze delete from wallets" starts with a
    // word on the allowlist and empties a table.
    if (word === "explain" && /\banalyze\b/i.test(st)) {
      return "EXPLAIN ANALYZE runs the statement. Use EXPLAIN on its own.";
    }
  }
  return null;
}

// -- how to encrypt ---------------------------------------------------
/**
 * Decide the TLS setting, and hand back a connection string with the ssl
 * parameters taken OUT of it.
 *
 * WHY THE STRIPPING. Supabase hands you a string ending in
 * `?sslmode=require`. In libpq that means "encrypt, do not verify the
 * chain". The pg driver reads it as verify-full, and then Supabase's own
 * certificate chain -- which is not in Node's trust store -- fails with
 * "self-signed certificate in certificate chain". Worse, the parameter
 * in the string overrides the `ssl` object passed beside it, so setting
 * that alone does nothing. So the parameter comes out and we say it
 * ourselves.
 *
 * The connection is still encrypted either way. verify-full and
 * verify-ca are honoured: they need Supabase's CA certificate in
 * NODE_EXTRA_CA_CERTS, which is a deliberate choice, not a default.
 */
export function sslFor(url) {
  try {
    const u = new URL(url);
    const mode = (u.searchParams.get("sslmode") ?? "").toLowerCase();
    for (const p of ["sslmode", "ssl", "uselibpqcompat", "sslrootcert"]) u.searchParams.delete(p);
    return {
      dsn: u.toString(),
      ssl: mode === "verify-full" || mode === "verify-ca" ? true : { rejectUnauthorized: false },
    };
  } catch {
    return { dsn: url, ssl: { rejectUnauthorized: false } };
  }
}

// -- printing --------------------------------------------------------
export function cell(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().replace("T", " ").slice(0, 19);
  if (Buffer.isBuffer(v)) return "\\x" + v.toString("hex").slice(0, 32);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function printTable(result, mask) {
  const cols = result.fields.map((f) => f.name);
  if (!cols.length) {
    console.log("(no columns)");
    return;
  }
  const rows = result.rows.map((r) => cols.map((c) => mask(cell(r[c]))));
  const width = cols.map((c, i) =>
    Math.min(60, Math.max(c.length, ...rows.map((r) => r[i].length), 0)),
  );
  const rule = (ch) => "+" + width.map((w) => ch.repeat(w + 2)).join("+") + "+";
  const row = (cells) =>
    "| " +
    cells
      .map((c, i) => (c.length > width[i] ? c.slice(0, width[i] - 1) + "~" : c.padEnd(width[i])))
      .join(" | ") +
    " |";
  const n = result.rowCount ?? rows.length;
  console.log(rule("-"));
  console.log(row(cols));
  console.log(rule("="));
  for (const r of rows) console.log(row(r));
  console.log(rule("-"));
  console.log(`${n} row${n === 1 ? "" : "s"}`);
}

// -- wiring it up, once ----------------------------------------------
/** Ask for one line without ever showing it or storing it anywhere. */
function askHidden(question) {
  return new Promise((done) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // readline echoes what is typed; this is the standard way to stop it
    // for one question. The prompt itself still prints.
    let shown = false;
    rl._writeToOutput = (s) => {
      if (!shown) {
        process.stdout.write(s);
        if (s.includes(question)) shown = true;
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      done(answer.trim());
    });
  });
}

function maskUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username}:********@${u.host}${u.pathname}`;
  } catch {
    return "(unreadable string)";
  }
}

async function init() {
  if (!process.stdin.isTTY) {
    console.error("Run this in your own terminal: npm run check -- --init");
    return 2;
  }
  console.log("Wiring up a read-only connection to the database.\n");
  if (existsSync(ENV_FILE)) {
    const yes = await askHidden(".env.check already exists. Replace it? (y/N) ");
    if (yes.toLowerCase() !== "y") {
      console.log("Left alone.");
      return 0;
    }
  }
  console.log("Paste the connection string. It is NOT shown while you type,");
  console.log("and it is never printed back.\n");
  const url = await askHidden("connection string: ");

  if (!url) {
    console.error("Nothing pasted.");
    return 2;
  }
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    console.error("That does not look like a connection string; it should start with postgresql://");
    return 2;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    console.error("That string cannot be read as a URL. If the password contains @ : / ? # or %,");
    console.error("percent-encode it (@ = %40, : = %3A, / = %2F, ? = %3F, # = %23, % = %25).");
    return 2;
  }
  if (/YOUR-?PASSWORD|\[.*\]/i.test(parsed.password ?? "")) {
    console.error("The password is still the placeholder from the dashboard. Put the real one in.");
    return 2;
  }
  if (!parsed.password) {
    console.error("There is no password in that string.");
    return 2;
  }

  writeFileSync(
    ENV_FILE,
    [
      "# Read-only database access for `npm run check`. Git ignores this file.",
      "# Written by: npm run check -- --init",
      `${VAR}=${url}`,
      "",
    ].join("\n"),
    "utf8",
  );
  try {
    chmodSync(ENV_FILE, 0o600);
  } catch {
    /* Windows does not do POSIX modes; the file is still git-ignored */
  }
  console.log(`Saved to .env.check: ${maskUrl(url)}\n`);
  console.log("Trying it...\n");

  return await main(["select now() as now, current_user as who"]);
}

// -- main ------------------------------------------------------------
async function main(override) {
  const argv = override ?? process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(SETUP);
    return 0;
  }
  if (argv.includes("--setup")) {
    console.log(SETUP);
    console.log(
      existsSync(ENV_FILE)
        ? `\n.env.check exists (${VAR} ${connectionString() ? "is set" : "is MISSING from it"}).`
        : "\n.env.check does not exist yet.",
    );
    return 0;
  }
  if (argv.includes("--init")) return await init();

  const asJson = argv.includes("--json");
  const rest = argv.filter((a) => a !== "--json");

  let sql = "";
  const fIdx = rest.findIndex((a) => a === "-f" || a === "--file");
  if (fIdx >= 0) {
    const path = rest[fIdx + 1];
    if (!path) {
      console.error("-f needs a file path.");
      return 2;
    }
    sql = readFileSync(resolve(path), "utf8");
  } else if (rest.length) {
    sql = rest.join(" ");
  } else if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    sql = Buffer.concat(chunks).toString("utf8");
  }
  if (!sql.trim()) {
    console.error('Nothing to run. Try: npm run check -- "select now()"');
    return 2;
  }

  // Before anything else, and whether or not this machine is even wired
  // up: a write is refused. Nothing to configure, nothing to reach.
  const refusal = refuseWrites(splitStatements(sql));
  if (refusal) {
    console.error(`Refused: ${refusal}`);
    return 3;
  }

  const url = connectionString();
  if (!url) {
    console.error(SETUP);
    return 2;
  }
  const mask = makeMasker(url);

  let pg;
  try {
    pg = (await import("pg")).default;
  } catch {
    console.error("The pg driver is missing. Run: npm install");
    return 2;
  }

  const { dsn, ssl } = sslFor(url);
  const client = new pg.Client({ connectionString: dsn, ssl, connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
  } catch (err) {
    console.error(`Could not connect: ${mask(err?.message ?? err)}`);
    console.error(
      "Check the host, the user (it carries .projectref through the pooler) and the password in .env.check.",
    );
    return 4;
  }

  let code = 0;
  try {
    if (!asJson) {
      const who = await client.query("select current_user as who, current_database() as db");
      const w = who.rows[0] ?? {};
      console.log(`${w.db ?? "?"} as ${w.who ?? "?"}`);
    }

    await client.query("begin read only");
    await client.query("set local statement_timeout = '20s'");

    // A connection that cannot see a single tenant is one RLS is hiding
    // the database from. Every count after that would be a lie.
    const probe = await client.query("select count(*)::int as n from public.tenants");
    if ((probe.rows[0]?.n ?? 0) === 0) {
      console.error(
        "WARNING: this login sees 0 tenants. That is row-level security, not an empty\n" +
          "         database. Every zero below is meaningless. Use the postgres connection\n" +
          "         string, or give the read login BYPASSRLS (PLAK-DIT-59-LEESACCOUNT.sql).",
      );
    }

    const started = Date.now();
    const res = await client.query(sql);
    const results = Array.isArray(res) ? res : [res];
    const ms = Date.now() - started;

    if (asJson) {
      console.log(JSON.stringify(results.map((r) => r.rows ?? []), null, 2));
    } else {
      results.forEach((r, i) => {
        if (results.length > 1) console.log(`\n-- result ${i + 1} of ${results.length} --`);
        if (r.fields?.length) printTable(r, mask);
        else console.log(r.command ?? "ok");
      });
      console.log(`(${ms} ms)`);
    }
  } catch (err) {
    console.error(`SQL error: ${mask(err?.message ?? err)}`);
    if (err?.hint) console.error(`hint: ${mask(err.hint)}`);
    code = 1;
  } finally {
    try {
      await client.query("rollback");
    } catch {
      /* the transaction may never have opened */
    }
    await client.end().catch(() => {});
  }
  return code;
}

// Only when it is run, not when the tests import the pure helpers above.
const invokedDirectly =
  !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) process.exitCode = await main();
