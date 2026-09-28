"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { toast } from "sonner";

import { createPoll, deletePoll, setPollStatus } from "@/actions/poll-actions";
import { POLL_CSS } from "@/components/polls/poll-css";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_ANSWER,
  MAX_OPTIONS,
  pollProblems,
  pollProblemText,
  pollTally,
  pollTotalText,
  type PollKind,
  type PollOption,
} from "@/lib/pure-poll";

/**
 * MAKING A POLL, IN ONE BOX.
 *
 * The owner, 28-09: "bouw ook de poll systeem dat super admin makkelijk
 * een poll kan maken voor alle users", then "maak poll duidelijker en
 * mooier design", then "open answer moet ook mogelijk zijn en char
 * limited en veilig".
 *
 * So: two ways to ask, side by side rather than hidden in a dropdown —
 * pick one of your answers, or say it in your own words. The problems
 * are shown as you type, under the button they grey out, so a disabled
 * Ask always carries its reason.
 *
 * An open answer is capped at MAX_ANSWER and stripped of control
 * characters, here AND in the database (plak 133) — a length checked
 * only on the screen is not a length check, because the RPC is
 * callable directly.
 */

const MISSING = /42P01|42703|does not exist|schema cache|PGRST20\d/i;

type AdminPoll = {
  id: string;
  question: string;
  options: PollOption[] | null;
  audience: string | null;
  status: string | null;
  kind?: string | null;
  closes_at: string | null;
  created_at: string;
};

function usePolls(tenantId: string | null | undefined) {
  return useQuery<{ rows: AdminPoll[]; notSwitchedOn: boolean }>({
    queryKey: ["admin-polls", tenantId ?? ""],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      // `kind` arrives with plak 133. Asked for, and on that one error
      // asked for again without it — so the screen keeps working
      // between the deploy and the plak instead of showing a Postgres
      // message (CLAUDE.md).
      const base = "id, question, options, audience, status, closes_at, created_at";
      const ask = (cols: string) =>
        supabase
          .from("polls")
          .select(cols)
          .eq("tenant_id", tenantId!)
          .order("created_at", { ascending: false })
          .limit(25);

      let res: { data: unknown; error: { message: string } | null } = await ask(
        `${base}, kind`,
      );
      if (res.error && MISSING.test(res.error.message)) {
        res = await ask(base);
      }
      if (res.error) {
        if (MISSING.test(res.error.message)) return { rows: [], notSwitchedOn: true };
        throw res.error;
      }
      return { rows: (res.data ?? []) as AdminPoll[], notSwitchedOn: false };
    },
  });
}

/** Counts per answer, for the choice polls. */
function useResults(pollIds: string[]) {
  const key = [...pollIds].sort().join(",");
  return useQuery<Record<string, { option_id: string | null; votes: number }[]>>({
    queryKey: ["admin-poll-results", key],
    enabled: pollIds.length > 0,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("poll_results")
        .select("poll_id, option_id, votes")
        .in("poll_id", pollIds);
      if (error) {
        if (MISSING.test(error.message)) return {};
        throw error;
      }
      const out: Record<string, { option_id: string | null; votes: number }[]> = {};
      for (const r of (data ?? []) as {
        poll_id: string;
        option_id: string | null;
        votes: number | string | null;
      }[]) {
        const n = Number(r.votes);
        (out[r.poll_id] ??= []).push({
          option_id: r.option_id,
          votes: Number.isFinite(n) ? n : 0,
        });
      }
      return out;
    },
  });
}

/** What people typed, for the open polls. The owner reads these. */
function useAnswers(pollIds: string[]) {
  const key = [...pollIds].sort().join(",");
  return useQuery<Record<string, { text: string; at: string }[]>>({
    queryKey: ["admin-poll-answers", key],
    enabled: pollIds.length > 0,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("poll_votes")
        .select("poll_id, answer_text, created_at")
        .in("poll_id", pollIds)
        .not("answer_text", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) {
        if (MISSING.test(error.message)) return {};
        throw error;
      }
      const out: Record<string, { text: string; at: string }[]> = {};
      for (const r of (data ?? []) as {
        poll_id: string;
        answer_text: string | null;
        created_at: string;
      }[]) {
        const text = String(r.answer_text ?? "").trim();
        if (!text) continue;
        (out[r.poll_id] ??= []).push({ text, at: r.created_at });
      }
      return out;
    },
  });
}

export default function PollAdmin({
  tenantId,
}: {
  tenantId: string | null | undefined;
}) {
  const queryClient = useQueryClient();
  const polls = usePolls(tenantId);
  const ids = useMemo(() => (polls.data?.rows ?? []).map((p) => p.id), [polls.data]);
  const results = useResults(ids);
  const answers = useAnswers(ids);

  const [kind, setKind] = useState<PollKind>("choice");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [audience, setAudience] = useState("everyone");
  const [busy, setBusy] = useState(false);

  const problems = pollProblems({ question, options, kind });
  const touched = question.trim() !== "" || options.some((o) => o.trim() !== "");
  const canAsk = problems.length === 0 && !busy;

  const refresh = () => {
    for (const k of ["admin-polls", "admin-poll-results", "admin-poll-answers", "open-poll"]) {
      queryClient.invalidateQueries({ queryKey: [k], exact: false });
    }
  };

  const ask = async () => {
    setBusy(true);
    try {
      const res = await createPoll({ question, options, audience, kind });
      if (!res.ok) {
        toast.error("Not asked", { description: res.error });
        return;
      }
      setQuestion("");
      setOptions(["", ""]);
      setAudience("everyone");
      setKind("choice");
      toast.success("Your poll is live", {
        description: "Everyone it is for sees it the next time they open the app.",
      });
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const change = async (id: string, status: "open" | "closed") => {
    const res = await setPollStatus(id, status);
    if (!res.ok) return void toast.error("Could not change that", { description: res.error });
    toast.success(status === "closed" ? "Poll closed" : "Poll re-opened");
    refresh();
  };

  const remove = async (id: string) => {
    const res = await deletePoll(id);
    if (!res.ok) return void toast.error("Not deleted", { description: res.error });
    toast.success("Poll deleted");
    refresh();
  };

  if (polls.data?.notSwitchedOn) {
    return (
      <div className="pa">
        <style>{POLL_CSS}</style>
        <div className="pa-card">
          <h2>Polls</h2>
          <p className="sub" style={{ margin: 0 }}>
            Not switched on in the database yet — run plak 129 (and 133 for
            open answers) and this page works.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pa">
      <style>{POLL_CSS}</style>

      <div className="pa-card">
        <h2>Ask everybody something</h2>
        <p className="sub">
          It appears on their dashboard. They answer once, and can change
          their mind while it is open.
        </p>

        <div className="pa-kinds">
          <button
            type="button"
            className={`pa-kind${kind === "choice" ? " on" : ""}`}
            onClick={() => setKind("choice")}
          >
            <b>Pick one</b>
            <span>You write the answers. You get a result you can read at a glance.</span>
          </button>
          <button
            type="button"
            className={`pa-kind${kind === "open" ? " on" : ""}`}
            onClick={() => setKind("open")}
          >
            <b>In their own words</b>
            <span>One line of free text, up to {MAX_ANSWER} characters.</span>
          </button>
        </div>

        <label className="pa-lab" htmlFor="poll-q">
          Question
        </label>
        <input
          id="poll-q"
          className="pa-in"
          style={{ marginBottom: 16 }}
          value={question}
          maxLength={200}
          placeholder="What should we build next?"
          onChange={(e) => setQuestion(e.target.value)}
        />

        {kind === "choice" ? (
          <>
            <span className="pa-lab">Answers</span>
            <div className="pa-rows">
              {options.map((o, i) => (
                <div className="pa-row" key={i}>
                  <input
                    className="pa-in"
                    value={o}
                    maxLength={80}
                    placeholder={`Answer ${i + 1}`}
                    onChange={(e) => {
                      const next = [...options];
                      next[i] = e.target.value;
                      setOptions(next);
                    }}
                  />
                  {options.length > 2 ? (
                    <button
                      type="button"
                      className="pa-x"
                      aria-label={`Remove answer ${i + 1}`}
                      onClick={() => setOptions(options.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            {options.length < MAX_OPTIONS ? (
              <button type="button" className="pa-add" onClick={() => setOptions([...options, ""])}>
                + Add an answer
              </button>
            ) : null}
          </>
        ) : (
          <p className="sub" style={{ margin: 0 }}>
            They get one text box. Answers are trimmed to {MAX_ANSWER}
            characters and stripped of anything invisible, here and in the
            database.
          </p>
        )}

        <div style={{ marginTop: 16 }}>
          <label className="pa-lab" htmlFor="poll-audience">
            Who sees it
          </label>
          <select
            id="poll-audience"
            className="pa-in"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
          >
            <option value="everyone">Everyone</option>
            <option value="advertisers">Advertisers only</option>
            <option value="affiliates">Affiliates only</option>
          </select>
        </div>

        <div className="pa-foot">
          <button className="pa-ask" disabled={!canAsk} onClick={ask}>
            {busy ? "Asking…" : "Ask"}
          </button>
          {touched && problems.length ? (
            <p className="pa-why">{problems.map(pollProblemText).join(" ")}</p>
          ) : null}
        </div>
      </div>

      {(polls.data?.rows ?? []).map((p) => {
        const isOpen = String(p.kind ?? "choice") === "open";
        const opts = Array.isArray(p.options) ? p.options : [];
        const counts = results.data?.[p.id] ?? [];
        const flat: { option_id: string | null }[] = [];
        for (const c of counts) {
          for (let i = 0; i < c.votes; i += 1) flat.push({ option_id: c.option_id });
        }
        const tally = pollTally(opts, flat);
        const said = answers.data?.[p.id] ?? [];
        const total = isOpen ? said.length : tally.total;
        const live = String(p.status ?? "") === "open";
        const state = live ? "open" : p.status === "draft" ? "draft" : "closed";

        return (
          <div className="pa-card" key={p.id}>
            <div className="pa-head">
              <div>
                <p className="pa-q">{p.question}</p>
                <div className="pa-meta">
                  <span className={`pa-pill ${state}`}>{state}</span>
                  {isOpen ? "Own words" : "Pick one"} ·{" "}
                  {p.audience === "everyone" ? "Everyone" : p.audience} ·{" "}
                  {pollTotalText(total)}
                </div>
              </div>
              <div className="pa-acts">
                <button className="pa-btn" onClick={() => change(p.id, live ? "closed" : "open")}>
                  {live ? "Close" : "Open"}
                </button>
                {total === 0 ? (
                  <button className="pa-btn danger" onClick={() => remove(p.id)}>
                    Delete
                  </button>
                ) : null}
              </div>
            </div>

            {isOpen ? (
              said.length ? (
                <div className="pa-said">
                  {said.map((s, i) => (
                    <div className="pa-say" key={i}>
                      {/* React escapes this. Nothing here builds HTML. */}
                      {s.text}
                      <span className="pa-when">{dayjs(s.at).format("D MMM, HH:mm")}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="pa-none">Nobody has written anything yet.</p>
              )
            ) : (
              <div className="pa-bars">
                {tally.rows.map((r) => (
                  <div key={r.option.id}>
                    <div className="pa-bl">
                      <span>{r.option.label}</span>
                      <span className="n">
                        {r.votes} · {r.pct}%
                      </span>
                    </div>
                    <div className="pa-tr">
                      <span className="pa-fi" style={{ width: `${r.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
