"use client";

import { useState } from "react";
import { toast } from "sonner";

import { usePoll, usePollVote } from "@/hooks/use-poll";
import { pollTotalText } from "@/lib/pure-poll";

/**
 * THE QUESTION, ON THE CUSTOMER'S OWN SCREEN.
 *
 * The owner, 28-09: "bouw ook de poll systeem dat super admin makkelijk
 * een poll kan maken voor alle users."
 *
 * One question, the answers as buttons, and the result the moment they
 * pick one. The result is hidden until they have answered — a standing
 * that is visible first steers the vote, and then the poll measures
 * itself.
 *
 * It renders NOTHING when there is no poll, when the read failed, or
 * while it is loading. A card that says "no poll right now" is a card
 * on every screen forever; this one is only there when there is
 * something to answer.
 */
export default function PollCard({
  tenantId,
  profileId,
  role,
  isAffiliate,
  enabled = true,
}: {
  tenantId: string | null | undefined;
  profileId: string | null | undefined;
  role: string | null | undefined;
  isAffiliate?: boolean;
  enabled?: boolean;
}) {
  const poll = usePoll({ tenantId, profileId, role, isAffiliate, enabled });
  const vote = usePollVote();
  const [busy, setBusy] = useState<string | null>(null);

  if (poll.isPending || poll.isError || !poll.data) return null;

  const { id, question, options, myVote, result } = poll.data;

  const cast = async (optionId: string) => {
    setBusy(optionId);
    try {
      await vote(id, optionId);
    } catch (error) {
      toast.error("We could not record that", {
        description:
          error instanceof Error ? error.message : "Try again in a moment.",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card psm-poll">
      <style>{POLL_CSS}</style>
      <div className="pq">{question}</div>

      {myVote && result ? (
        <>
          <div className="pbars">
            {result.rows.map((r) => (
              <div
                className={`pbar${r.option.id === myVote ? " mine" : ""}`}
                key={r.option.id}
              >
                <div className="pl">
                  <span className="pname">{r.option.label}</span>
                  <span className="ppct">{r.pct}%</span>
                </div>
                <div className="ptrack">
                  {/* Width, not a transform: a 0% bar must be nothing
                      at all, and a scaled-to-zero element still shows
                      its own rounding. */}
                  <span className="pfill" style={{ width: `${r.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="pfoot">
            {pollTotalText(result.total)} You can change your answer while
            this is open.
          </p>
        </>
      ) : (
        <div className="popts">
          {options.map((o) => (
            <button
              key={o.id}
              className="popt"
              disabled={!!busy}
              onClick={() => cast(o.id)}
            >
              {busy === o.id ? "Saving…" : o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const POLL_CSS = `
  .psm-poll{padding:16px}
  .psm-poll .pq{font-family:var(--hd,inherit);font-weight:800;font-size:1rem;
    line-height:1.3;margin-bottom:12px;color:var(--ink,#12162a)}
  .psm-poll .popts{display:flex;flex-direction:column;gap:8px}
  .psm-poll .popt{display:block;width:100%;text-align:left;padding:11px 14px;
    border-radius:12px;border:1px solid var(--line,#e3e8f4);background:var(--panel,#fff);
    font:inherit;font-weight:600;font-size:.92rem;color:var(--ink,#12162a);cursor:pointer;
    transition:border-color .14s,transform .14s,background .14s}
  .psm-poll .popt:hover:not(:disabled){border-color:var(--primary,#3a6fff);transform:translateY(-1px)}
  .psm-poll .popt:disabled{opacity:.6;cursor:default}
  .psm-poll .pbars{display:flex;flex-direction:column;gap:10px}
  .psm-poll .pl{display:flex;justify-content:space-between;gap:10px;
    font-size:.86rem;font-weight:600;margin-bottom:4px;color:var(--ink,#12162a)}
  .psm-poll .ppct{font-variant-numeric:tabular-nums;color:var(--txt-2,#535e78)}
  .psm-poll .ptrack{height:8px;border-radius:99px;background:var(--panel-2,#f0f4fd);overflow:hidden}
  .psm-poll .pfill{display:block;height:100%;border-radius:99px;
    background:var(--line-2,#d3daec);transition:width .3s}
  .psm-poll .pbar.mine .pfill{background:var(--primary,#3a6fff)}
  .psm-poll .pbar.mine .pname::after{content:" — your answer";font-weight:500;
    color:var(--txt-2,#535e78)}
  .psm-poll .pfoot{margin:12px 0 0;font-size:.78rem;color:var(--faint,#818ead)}
`;
