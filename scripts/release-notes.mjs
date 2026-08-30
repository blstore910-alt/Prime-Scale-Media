#!/usr/bin/env node
/**
 * Generate a Markdown release-notes block from the git log.
 *
 *   node scripts/release-notes.mjs                 # since last tag
 *   node scripts/release-notes.mjs v1.2.3          # since a tag
 *   node scripts/release-notes.mjs 2026-08-28      # since a date
 *
 * Output goes to stdout so you can pipe it:
 *
 *   node scripts/release-notes.mjs >> CHANGELOG.md
 *
 * Groups commits by the conventional-commits prefix (feat, fix,
 * docs, chore, test, perf, refactor, style, ci, build). Anything
 * that doesn't match a known prefix goes under "Other".
 */

import { execSync } from "node:child_process";

const CATEGORIES = {
  feat: "Features",
  fix: "Fixes",
  perf: "Performance",
  refactor: "Refactoring",
  test: "Tests",
  docs: "Documentation",
  chore: "Chores",
  ci: "CI",
  build: "Build",
  style: "Style",
};

function since() {
  const arg = process.argv[2];
  if (arg) return arg;
  // Fall back to the last tag; if there is none, use the initial commit.
  try {
    return execSync("git describe --tags --abbrev=0", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return execSync("git rev-list --max-parents=0 HEAD")
      .toString()
      .trim()
      .split("\n")[0];
  }
}

function looksLikeDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function commitsSince(ref) {
  const range = looksLikeDate(ref) ? `--since=${ref}` : `${ref}..HEAD`;
  const raw = execSync(
    `git log ${range} --pretty=format:%H%x1f%s%x1e --no-merges`,
  ).toString();
  return raw
    .split("\x1e")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, subject] = line.split("\x1f");
      return { sha: sha.slice(0, 7), subject };
    });
}

function categorise(subject) {
  const match = subject.match(/^(\w+)(?:\(([^)]+)\))?:/);
  if (!match) return "Other";
  return CATEGORIES[match[1]] ?? "Other";
}

const ref = since();
const commits = commitsSince(ref);
if (commits.length === 0) {
  console.log(`(no commits since ${ref})`);
  process.exit(0);
}

const groups = {};
for (const c of commits) {
  const cat = categorise(c.subject);
  (groups[cat] ??= []).push(c);
}

const today = execSync("git log -1 --pretty=format:%cs")
  .toString()
  .trim();
console.log(`## Since ${ref} — ${today}\n`);
for (const cat of [
  "Features",
  "Fixes",
  "Performance",
  "Refactoring",
  "Tests",
  "Documentation",
  "CI",
  "Build",
  "Chores",
  "Style",
  "Other",
]) {
  const list = groups[cat];
  if (!list) continue;
  console.log(`### ${cat}\n`);
  for (const c of list) {
    console.log(`- \`${c.sha}\` ${c.subject}`);
  }
  console.log();
}
