"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import {
  cleanAnswer,
  isPollOpen,
  pollIsForRole,
  pollTally,
  type PollOption,
  type PollRow,
  type PollTallyRow,
} from "@/lib/pure-poll";

/**
 * The open poll for whoever is looking, their own answer, and the
 * result once they have given one.
 *
 * ── A MISSING TABLE IS "NOT SWITCHED ON", NOT AN ERROR ────────────
 *
 * `polls` arrives with plak 129, and plaks are pasted by hand while
 * code reaches production in minutes. A select against a table that is
 * not there throws, and PostgREST's message lands on whatever screen
 * asked for it — CLAUDE.md records a customer reading one across their
 * own dashboard. So that one error answers "no poll", the card renders
 * nothing, and everything else on the page is untouched.
 *
 * ── AND A FAILED READ IS NOT "NO POLL" ────────────────────────────
 *
 * Any other failure throws, so `isError` is true and the card stays
 * away rather than asserting there is nothing to answer. Nothing is
 * lost by being quiet here: a poll is not a figure somebody reconciles.
 */

const MISSING = /42P01|does not exist|schema cache|PGRST20\d/i;

export type OpenPoll = {
  id: string;
  question: string;
  /** "choice" or "open" -- what kind of answer it wants. */
  kind: "choice" | "open" | "both";
  options: PollOption[];
  /** What they typed, for an open poll they have already answered. */
  myText: string | null;
  /** The option id this person chose, or null if they have not. */
  myVote: string | null;
  /** Only filled once they have voted — the standing must not steer it. */
  result: { rows: PollTallyRow[]; total: number } | null;
};

export function usePoll(args: {
  tenantId: string | null | undefined;
  profileId: string | null | undefined;
  role: string | null | undefined;
  isAffiliate?: boolean;
  enabled?: boolean;
}) {
  const { tenantId, profileId, role, isAffiliate, enabled = true } = args;

  return useQuery<OpenPoll | null>({
    queryKey: ["open-poll", tenantId ?? "", profileId ?? ""],
    enabled: enabled && !!tenantId && !!profileId,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient();

      const { data: polls, error } = await supabase
        .from("polls")
        .select("id, question, options, audience, status, closes_at, kind")
        .eq("tenant_id", tenantId!)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) {
        if (MISSING.test(error.message)) return null;
        throw error;
      }

      const mine = ((polls ?? []) as PollRow[]).find(
        (p) =>
          isPollOpen(p) && pollIsForRole(p.audience, role, { isAffiliate }),
      );
      if (!mine) return null;

      const options = Array.isArray(mine.options) ? mine.options : [];

      const { data: voteRow, error: voteError } = await supabase
        .from("poll_votes")
        .select("option_id, answer_text")
        .eq("poll_id", mine.id)
        .eq("profile_id", profileId!)
        .maybeSingle();
      // A vote we could not read is not "has not voted": showing the
      // question again to somebody who answered it invites a second
      // answer, and the RPC would quietly replace their first.
      if (voteError && !MISSING.test(voteError.message)) throw voteError;

      const vr = voteRow as
        | { option_id?: string | null; answer_text?: string | null }
        | null;
      const myVote = vr?.option_id ?? null;
      const myText = (vr?.answer_text ?? null) || null;
      const rawKind = String((mine as { kind?: string | null }).kind ?? "choice");
      const kind: "choice" | "open" | "both" =
        rawKind === "open" ? "open" : rawKind === "both" ? "both" : "choice";
      // An open poll is answered the moment there is text; there is no
      // option to point at.
      // "both" is answered once an option is picked; the words are
      // optional, so waiting for them would keep asking somebody who
      // has already told us what they think.
      const answered = kind === "open" ? !!myText : !!myVote;

      let result: OpenPoll["result"] = null;
      if (answered && kind !== "open") {
        const { data: counts, error: countError } = await supabase
          .from("poll_results")
          .select("option_id, votes")
          .eq("poll_id", mine.id);
        if (countError && !MISSING.test(countError.message)) throw countError;
        const flat: { option_id: string | null }[] = [];
        for (const r of (counts ?? []) as {
          option_id: string | null;
          votes: number | string | null;
        }[]) {
          const n = Number(r.votes);
          // The view counts for us; pollTally counts rows. Expanding
          // keeps ONE place that decides what a percentage is.
          for (let i = 0; i < (Number.isFinite(n) ? n : 0); i += 1) {
            flat.push({ option_id: r.option_id });
          }
        }
        result = pollTally(options, flat);
      }

      return { id: mine.id, question: mine.question, kind, options, myVote, myText, result };
    },
  });
}

/** Cast or change a vote, then show the result. */
export function usePollVote() {
  const queryClient = useQueryClient();
  return async (pollId: string, optionId: string | null, answerText?: string) => {
    const supabase = createClient();
    // cleanAnswer here AND in the RPC. This one keeps what the customer
    // sees honest (they typed 400 characters, 280 were kept); the one
    // in the database is the check that actually holds, because this
    // RPC is callable directly.
    const text = answerText === undefined ? null : cleanAnswer(answerText);
    const { data, error } = await supabase.rpc("poll_vote", {
      p_poll_id: pollId,
      p_option_id: optionId,
      ...(text === null ? {} : { p_answer_text: text }),
    });
    if (error) throw error;
    const res = (Array.isArray(data) ? data[0] : data) as
      | { ok?: boolean; error?: string }
      | null;
    if (!res || res.ok !== true) {
      throw new Error(res?.error ?? "We could not record that just now.");
    }
    await queryClient.invalidateQueries({ queryKey: ["open-poll"], exact: false });
  };
}

export default usePoll;
