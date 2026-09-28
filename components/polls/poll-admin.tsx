"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createPoll, deletePoll, setPollStatus } from "@/actions/poll-actions";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_OPTIONS,
  pollProblems,
  pollProblemText,
  pollTally,
  pollTotalText,
  type PollOption,
} from "@/lib/pure-poll";

/**
 * MAKING A POLL, IN ONE BOX.
 *
 * The owner, 28-09: "bouw ook de poll systeem dat super admin makkelijk
 * een poll kan maken voor alle users." Easy means: type a question,
 * type the answers, press Ask. Everything else has a default that is
 * right for the common case — everyone, no closing time, live at once.
 *
 * The problems are shown as you type rather than on submit, so the
 * button that is greyed out always has the reason under it.
 */

const MISSING = /42P01|does not exist|schema cache|PGRST20\d/i;

type AdminPoll = {
  id: string;
  question: string;
  options: PollOption[] | null;
  audience: string | null;
  status: string | null;
  closes_at: string | null;
  created_at: string;
};

function usePolls(tenantId: string | null | undefined) {
  return useQuery<{ rows: AdminPoll[]; notSwitchedOn: boolean }>({
    queryKey: ["admin-polls", tenantId ?? ""],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("polls")
        .select("id, question, options, audience, status, closes_at, created_at")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) {
        // The tables arrive with plak 129. Until then this screen says
        // so, instead of showing a Postgres message.
        if (MISSING.test(error.message)) return { rows: [], notSwitchedOn: true };
        throw error;
      }
      return { rows: (data ?? []) as AdminPoll[], notSwitchedOn: false };
    },
  });
}

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

export default function PollAdmin({
  tenantId,
}: {
  tenantId: string | null | undefined;
}) {
  const queryClient = useQueryClient();
  const polls = usePolls(tenantId);
  const ids = useMemo(
    () => (polls.data?.rows ?? []).map((p) => p.id),
    [polls.data],
  );
  const results = useResults(ids);

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [audience, setAudience] = useState("everyone");
  const [busy, setBusy] = useState(false);

  const problems = pollProblems({ question, options });
  // Nothing typed yet is not a mistake — it is an empty form.
  const touched = question.trim() !== "" || options.some((o) => o.trim() !== "");
  const canAsk = problems.length === 0 && !busy;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-polls"], exact: false });
    queryClient.invalidateQueries({ queryKey: ["admin-poll-results"], exact: false });
    queryClient.invalidateQueries({ queryKey: ["open-poll"], exact: false });
  };

  const ask = async () => {
    setBusy(true);
    try {
      const res = await createPoll({ question, options, audience });
      if (!res.ok) {
        toast.error("Not asked", { description: res.error });
        return;
      }
      setQuestion("");
      setOptions(["", ""]);
      setAudience("everyone");
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
    if (!res.ok) {
      toast.error("Could not change that", { description: res.error });
      return;
    }
    toast.success(status === "closed" ? "Poll closed" : "Poll re-opened");
    refresh();
  };

  const remove = async (id: string) => {
    const res = await deletePoll(id);
    if (!res.ok) {
      toast.error("Not deleted", { description: res.error });
      return;
    }
    toast.success("Poll deleted");
    refresh();
  };

  if (polls.data?.notSwitchedOn) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Polls</h2>
        <p className="cap" style={{ margin: 0 }}>
          Not switched on in the database yet — run plak 129 and this page
          works.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ padding: 16 }}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>Ask everybody something</h2>
        <p className="cap" style={{ marginTop: 0 }}>
          One question, two to {MAX_OPTIONS} answers. It appears on their
          dashboard, and they see the result once they have answered.
        </p>

        <label className="cap" htmlFor="poll-q">
          Question
        </label>
        <input
          id="poll-q"
          className="psm-input"
          style={{ width: "100%", marginBottom: 12 }}
          value={question}
          maxLength={200}
          placeholder="What should we build next?"
          onChange={(e) => setQuestion(e.target.value)}
        />

        <label className="cap">Answers</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {options.map((o, i) => (
            <div key={i} style={{ display: "flex", gap: 8 }}>
              <input
                className="psm-input"
                style={{ flex: 1 }}
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
                  className="btn ghost sm"
                  onClick={() => setOptions(options.filter((_, j) => j !== i))}
                  aria-label={`Remove answer ${i + 1}`}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {options.length < MAX_OPTIONS ? (
          <button
            className="btn ghost sm"
            style={{ marginTop: 8 }}
            onClick={() => setOptions([...options, ""])}
          >
            Add an answer
          </button>
        ) : null}

        <div style={{ marginTop: 12 }}>
          <label className="cap" htmlFor="poll-audience">
            Who sees it
          </label>
          <select
            id="poll-audience"
            className="psm-input"
            style={{ width: "100%" }}
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
          >
            <option value="everyone">Everyone</option>
            <option value="advertisers">Advertisers only</option>
            <option value="affiliates">Affiliates only</option>
          </select>
        </div>

        <div style={{ marginTop: 14 }}>
          <button className="btn grad" disabled={!canAsk} onClick={ask}>
            {busy ? "Asking…" : "Ask"}
          </button>
          {/* The reason under the greyed button, always. */}
          {touched && problems.length ? (
            <p className="cap" style={{ margin: "8px 0 0" }}>
              {problems.map(pollProblemText).join(" ")}
            </p>
          ) : null}
        </div>
      </div>

      {(polls.data?.rows ?? []).map((p) => {
        const opts = Array.isArray(p.options) ? p.options : [];
        const counts = results.data?.[p.id] ?? [];
        const flat: { option_id: string | null }[] = [];
        for (const c of counts) {
          for (let i = 0; i < c.votes; i += 1) flat.push({ option_id: c.option_id });
        }
        const tally = pollTally(opts, flat);
        const open = String(p.status ?? "") === "open";
        return (
          <div className="card" style={{ padding: 16 }} key={p.id}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{p.question}</div>
                <div className="cap">
                  {open ? "Open" : p.status === "draft" ? "Draft" : "Closed"} ·{" "}
                  {p.audience === "everyone" ? "Everyone" : p.audience} ·{" "}
                  {pollTotalText(tally.total)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn ghost sm"
                  onClick={() => change(p.id, open ? "closed" : "open")}
                >
                  {open ? "Close" : "Open"}
                </button>
                {tally.total === 0 ? (
                  <button className="btn ghost sm" onClick={() => remove(p.id)}>
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              {tally.rows.map((r) => (
                <div key={r.option.id} style={{ fontSize: ".88rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{r.option.label}</span>
                    <span className="mono">
                      {r.votes} · {r.pct}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
