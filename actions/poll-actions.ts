"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
import {
  normalizeOptions,
  pollProblems,
  pollProblemText,
  POLL_AUDIENCES,
  type PollAudience,
  type PollKind,
} from "@/lib/pure-poll";
import { type ActionResult, resolveOwnerContext } from "./_shared";

/**
 * POLLS — the owner asks everybody a question.
 *
 * The owner, 28-09: "bouw ook de poll systeem dat super admin makkelijk
 * een poll kan maken voor alle users."
 *
 * OWNER ONLY, not every admin. A poll goes out to every customer in the
 * book under the company's name; that is the same class of thing as a
 * price or a payout floor, and the account owner is the one who answers
 * for it. `resolveOwnerContext` is the same guard those use.
 *
 * ── WHY THE SERVICE KEY ───────────────────────────────────────────
 *
 * Not because the caller lacks the right — the guard above has already
 * established they are the owner — but so the live database can keep
 * `authenticated` off `polls` entirely. The RLS policy lets any member
 * of the tenant READ an open poll; nobody holds insert or update, so a
 * poll cannot be written from a browser console with the publishable
 * key. The grant is the boundary, and Postgres checks it before the
 * policy.
 *
 * Every field written below is built here from validated input. None of
 * the caller's object is spread into an update.
 *
 * Voting is NOT here: it is `poll_vote()` in the database (plak 129),
 * because a customer writing their own row needs the one-per-person
 * rule enforced where two browser tabs cannot race it.
 */

/** Postgres: relation does not exist. Plak 129 adds the tables. */
const MISSING = /42P01|does not exist|schema cache|PGRST20\d/i;

const NOT_YET =
  "Polls are not switched on in the database yet — run plak 129 and this works.";

function audienceOf(value: unknown): PollAudience {
  const raw = String(value ?? "").trim().toLowerCase();
  return (POLL_AUDIENCES as string[]).includes(raw)
    ? (raw as PollAudience)
    : "everyone";
}

/**
 * A closing time, or null. A date in the past is refused rather than
 * silently accepted: a poll that is born closed reads on every screen
 * as a poll that is open, because `status` says so.
 */
function closesAtOf(value: unknown): { ok: true; at: string | null } | { ok: false; error: string } {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, at: null };
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) {
    return { ok: false, error: "That closing time is not a date we can read." };
  }
  if (t <= Date.now()) {
    return { ok: false, error: "That closing time has already passed." };
  }
  return { ok: true, at: new Date(t).toISOString() };
}

export async function createPoll(input: {
  question: string;
  options: string[];
  audience?: string;
  /** "choice" (pick one) or "open" (their own words). */
  kind?: string;
  closesAt?: string | null;
  /** Ask straight away, or keep it as a draft to look at first. */
  openNow?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  const owner = await resolveOwnerContext();
  if (!owner.ok) return { ok: false, error: owner.error };
  const tenantId = owner.ctx.profile.tenant_id;

  const kind: PollKind = input.kind === "open" ? "open" : "choice";
  const problems = pollProblems({
    question: input.question,
    options: input.options ?? [],
    kind,
  });
  if (problems.length) {
    return { ok: false, error: problems.map(pollProblemText).join(" ") };
  }

  const closes = closesAtOf(input.closesAt);
  if (!closes.ok) return { ok: false, error: closes.error };

  const db = await createAdminClient();
  const { data, error } = await db
    .from("polls")
    .insert({
      tenant_id: tenantId,
      question: String(input.question).trim(),
      // An open poll has no answers to store. `[]` rather than null:
      // the column is not null, and every reader does
      // Array.isArray(options) before touching it.
      options: kind === "open" ? [] : normalizeOptions(input.options ?? []),
      kind,
      audience: audienceOf(input.audience),
      status: input.openNow === false ? "draft" : "open",
      closes_at: closes.at,
      created_by: owner.ctx.profile.user_id ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (MISSING.test(String(error.message ?? ""))) {
      return { ok: false, error: NOT_YET };
    }
    return { ok: false, error: safeErrorMessage(error) };
  }
  return { ok: true, data: { id: (data as { id: string }).id } };
}

/**
 * Open a draft, or close a running poll.
 *
 * Closing does not delete anything: the question, the answers and the
 * votes stay, and the result stays readable. A poll people answered is
 * a record of what they said.
 */
export async function setPollStatus(
  pollId: string,
  status: "draft" | "open" | "closed",
): Promise<ActionResult<null>> {
  const owner = await resolveOwnerContext();
  if (!owner.ok) return { ok: false, error: owner.error };
  const tenantId = owner.ctx.profile.tenant_id;
  if (!["draft", "open", "closed"].includes(status)) {
    return { ok: false, error: "That is not a state a poll can be in." };
  }

  const db = await createAdminClient();
  // Re-fetched and compared here rather than trusted: the id comes from
  // the caller, and `polls` is keyed by uuid across every tenant.
  const { data: row, error: readError } = await db
    .from("polls")
    .select("id, tenant_id")
    .eq("id", pollId)
    .maybeSingle();
  if (readError) {
    if (MISSING.test(String(readError.message ?? ""))) {
      return { ok: false, error: NOT_YET };
    }
    return { ok: false, error: safeErrorMessage(readError) };
  }
  if (!row || (row as { tenant_id: string }).tenant_id !== tenantId) {
    return { ok: false, error: "That poll is not there any more." };
  }

  const { error } = await db
    .from("polls")
    .update({ status })
    .eq("id", pollId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}

/**
 * Delete a poll and its votes.
 *
 * Only a poll NOBODY answered. Once people have replied, the thing on
 * screen is their answers, and removing it removes what they said — so
 * the owner closes it instead, which is what the message says. The
 * cascade on poll_votes stays for the case where a draft is thrown away.
 */
export async function deletePoll(pollId: string): Promise<ActionResult<null>> {
  const owner = await resolveOwnerContext();
  if (!owner.ok) return { ok: false, error: owner.error };
  const tenantId = owner.ctx.profile.tenant_id;

  const db = await createAdminClient();
  const { count, error: countError } = await db
    .from("poll_votes")
    .select("id", { count: "exact", head: true })
    .eq("poll_id", pollId);
  if (countError && !MISSING.test(String(countError.message ?? ""))) {
    return { ok: false, error: safeErrorMessage(countError) };
  }
  // NOT `count ?? 0`. A count comes out of the content-range header and
  // postgrest leaves it null, with no error, when that header is
  // missing — and treating "we could not count" as "nobody answered"
  // is how a poll full of replies gets deleted.
  if (count === null || count === undefined || !Number.isFinite(count)) {
    return {
      ok: false,
      error: "We could not check whether anybody has answered yet. Try again.",
    };
  }
  if (count > 0) {
    return {
      ok: false,
      error: `${count} ${count === 1 ? "person has" : "people have"} answered this poll, so it cannot be deleted. Close it instead — the result stays readable.`,
    };
  }

  const { error } = await db
    .from("polls")
    .delete()
    .eq("id", pollId)
    .eq("tenant_id", tenantId);
  if (error) {
    if (MISSING.test(String(error.message ?? ""))) {
      return { ok: false, error: NOT_YET };
    }
    return { ok: false, error: safeErrorMessage(error) };
  }
  return { ok: true, data: null };
}
