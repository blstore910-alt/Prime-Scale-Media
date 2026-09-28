import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  isPollOpen,
  normalizeOptions,
  pollIsForRole,
  pollProblems,
  pollTally,
  pollTotalText,
} from "../../lib/pure-poll.ts";

/**
 * The owner: "bouw ook de poll systeem dat super admin makkelijk een
 * poll kan maken voor alle users." Easy to make means the screen has to
 * catch the mistakes, and a result nobody can argue with means the
 * percentages have to add up.
 */

test("options are trimmed, blanks dropped, ids stay put", () => {
  assert.deepEqual(normalizeOptions(["  Meta ", "", "Google", "   "]), [
    { id: "o1", label: "Meta" },
    { id: "o2", label: "Google" },
  ]);
});

test("a typo fixed in a label keeps its id, so the votes stay on it", () => {
  const before = normalizeOptions(["Mata", "Google"]);
  const after = normalizeOptions(["Meta", "Google"]);
  assert.equal(before[0].id, after[0].id);
});

test("every problem at once, not one at a time", () => {
  const p = pollProblems({ question: "  ", options: ["a", "A"] });
  assert.ok(p.includes("question-missing"));
  assert.ok(p.includes("duplicate-options"));
});

test("a poll needs two answers", () => {
  assert.deepEqual(pollProblems({ question: "Which?", options: ["only"] }), [
    "too-few-options",
  ]);
  assert.deepEqual(pollProblems({ question: "Which?", options: ["a", "b"] }), []);
});

test("nine answers is too many", () => {
  const nine = Array.from({ length: 9 }, (_, i) => `answer ${i}`);
  assert.ok(pollProblems({ question: "Q", options: nine }).includes("too-many-options"));
});

test("duplicates are caught whatever the casing or padding", () => {
  const p = pollProblems({ question: "Q", options: ["Meta", " meta "] });
  assert.ok(p.includes("duplicate-options"));
});

test("open means open AND not past its closing time", () => {
  const now = new Date("2026-09-28T20:00:00Z");
  assert.equal(isPollOpen({ status: "open", closes_at: "2026-09-29T00:00:00Z" }, now), true);
  assert.equal(isPollOpen({ status: "open", closes_at: "2026-09-28T19:00:00Z" }, now), false);
  assert.equal(isPollOpen({ status: "draft", closes_at: null }, now), false);
  assert.equal(isPollOpen({ status: "closed", closes_at: null }, now), false);
});

test("no closing time means it stays open until somebody closes it", () => {
  assert.equal(isPollOpen({ status: "open", closes_at: null }), true);
});

test("an unreadable closing time does not silently retire a poll", () => {
  // The owner set the status. A date we cannot parse is our problem,
  // not a reason to stop asking the question.
  assert.equal(isPollOpen({ status: "open", closes_at: "not a date" }), true);
});

test("who is asked", () => {
  assert.equal(pollIsForRole("everyone", "advertiser"), true);
  assert.equal(pollIsForRole("everyone", "affiliate"), true);
  assert.equal(pollIsForRole("advertisers", "advertiser"), true);
  assert.equal(pollIsForRole("advertisers", "affiliate"), false);
  assert.equal(pollIsForRole("affiliates", "affiliate"), true);
  assert.equal(pollIsForRole("affiliates", "advertiser"), false);
});

test("an advertiser who is also an affiliate is in the affiliates audience", () => {
  assert.equal(pollIsForRole("affiliates", "advertiser", { isAffiliate: true }), true);
});

test("an admin sees every poll, so somebody proof-reads it", () => {
  assert.equal(pollIsForRole("advertisers", "admin"), true);
  assert.equal(pollIsForRole("affiliates", "admin"), true);
  assert.equal(pollIsForRole("nonsense", "admin"), true);
});

test("an audience nobody recognises reaches NOBODY, not everybody", () => {
  // A typo must not broadcast a question to the whole book.
  assert.equal(pollIsForRole("advertizers", "advertiser"), false);
});

test("a missing audience is everyone, which is the default", () => {
  assert.equal(pollIsForRole(null, "advertiser"), true);
  assert.equal(pollIsForRole("", "affiliate"), true);
});

test("percentages add up to 100, even at a third each", () => {
  const options = normalizeOptions(["a", "b", "c"]);
  const { rows, total } = pollTally(options, [
    { option_id: "o1" },
    { option_id: "o2" },
    { option_id: "o3" },
  ]);
  assert.equal(total, 3);
  // Rounded because adding one-decimal floats is itself imprecise
  // (33.4 + 33.3 + 33.3 lands on 99.99999999999999). The contract is
  // that they total 100 AT ONE DECIMAL, which is what a reader sees.
  assert.equal(
    Math.round(rows.reduce((a, r) => a + r.pct, 0) * 10) / 10,
    100,
  );
  assert.deepEqual(rows.map((r) => r.pct), [33.4, 33.3, 33.3]);
});

test("a plain split is exact", () => {
  const options = normalizeOptions(["a", "b"]);
  const { rows } = pollTally(options, [{ option_id: "o1" }, { option_id: "o2" }]);
  assert.deepEqual(rows.map((r) => r.pct), [50, 50]);
});

test("seven votes over three answers still totals 100", () => {
  const options = normalizeOptions(["a", "b", "c"]);
  const votes = [
    ...Array(3).fill({ option_id: "o1" }),
    ...Array(2).fill({ option_id: "o2" }),
    ...Array(2).fill({ option_id: "o3" }),
  ];
  const { rows } = pollTally(options, votes);
  assert.equal(
    Math.round(rows.reduce((a, r) => a + r.pct, 0) * 10) / 10,
    100,
  );
});

test("nobody voted: every row is a real zero, not a blank", () => {
  const options = normalizeOptions(["a", "b"]);
  const { rows, total } = pollTally(options, []);
  assert.equal(total, 0);
  assert.deepEqual(rows.map((r) => [r.votes, r.pct]), [[0, 0], [0, 0]]);
});

test("a vote for an answer that no longer exists is not counted, and not lost as a total", () => {
  const options = normalizeOptions(["a", "b"]);
  const { rows, total } = pollTally(options, [
    { option_id: "o1" },
    { option_id: "o9" },
    { option_id: null },
  ]);
  assert.equal(total, 1, "only the vote for a live answer counts");
  assert.equal(rows[0].votes, 1);
  assert.equal(rows[0].pct, 100);
});

test("the sentence under the result", () => {
  assert.equal(pollTotalText(0), "Nobody has answered yet.");
  assert.equal(pollTotalText(1), "1 answer so far.");
  assert.equal(pollTotalText(12), "12 answers so far.");
});
