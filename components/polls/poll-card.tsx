"use client";

import { useT } from "@/hooks/use-t";
import { useState } from "react";
import { toast } from "sonner";

import { usePoll, usePollVote } from "@/hooks/use-poll";
import { MAX_ANSWER, cleanAnswer, pollTotalText } from "@/lib/pure-poll";

/**
 * THE QUESTION, ON THE CUSTOMER'S OWN SCREEN.
 *
 * One question, and either the answers as buttons or one text box. The
 * result appears the moment they answer — hidden until then, because a
 * standing that is visible first steers the vote and then the poll
 * measures itself.
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
  const { t: tr } = useT();
  const poll = usePoll({ tenantId, profileId, role, isAffiliate, enabled });
  const vote = usePollVote();
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState("");

  if (poll.isPending || poll.isError || !poll.data) return null;

  const { id, question, kind, options, myVote, myText, result } = poll.data;
  const answered = kind === "open" ? !!myText : !!myVote;

  const send = async (optionId: string | null, answer?: string) => {
    setBusy(optionId ?? "open");
    try {
      await vote(id, optionId, answer);
      if (answer !== undefined) setText("");
    } catch (error) {
      toast.error(tr("poll.weCouldNotRecordThat"), {
        description: error instanceof Error ? error.message : tr("poll.tryAgainInAMoment"),
      });
    } finally {
      setBusy(null);
    }
  };

  const typed = cleanAnswer(text);
  const left = MAX_ANSWER - typed.length;

  return (
    <div className="card psm-poll">
      <style>{POLL_CARD_CSS}</style>
      <div className="pq">{question}</div>

      {kind === "open" ? (
        answered ? (
          <>
            <div className="pmine">{myText}</div>
            <p className="pfoot">
              {tr("poll.thanksThatReachedUsYou")}</p>
            <button className="popt again" onClick={() => setText(myText ?? "")}>
              {tr("label.poll.changeMyAnswer")}</button>
          </>
        ) : (
          <>
            <textarea
              className="pta"
              rows={3}
              value={text}
              maxLength={MAX_ANSWER}
              placeholder={tr("label.poll.inYourOwnWords")}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="prow">
              <span className={`pcount${left < 20 ? " low" : ""}`}>
                {tr("poll.left", { left: String(left) })}</span>
              <button
                className="psend"
                disabled={!typed || !!busy}
                onClick={() => send(null, text)}
              >
                {busy ? tr("btn.sending") : tr("label.poll.send")}
              </button>
            </div>
          </>
        )
      ) : answered && result ? (
        <>
          <div className="pbars">
            {result.rows.map((r) => (
              <div className={`pbar${r.option.id === myVote ? " mine" : ""}`} key={r.option.id}>
                <div className="pl">
                  <span className="pname">{r.option.label}</span>
                  <span className="ppct">{r.pct}%</span>
                </div>
                <div className="ptrack">
                  {/* Width, not a transform: a 0% bar must be nothing at
                      all, and a scaled-to-zero element still shows its
                      own rounding. */}
                  <span className="pfill" style={{ width: `${r.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="pfoot">
            {tr("poll.youCanChangeYourAnswer", { v: String(pollTotalText(result.total)) })}</p>
          {/* "both": they have picked, now they may say why. Optional,
              and after the bars -- asking first would make the pick
              feel like the easy way out of writing something. */}
          {kind === "both" ? (
            myText ? (
              <div className="pmine" style={{ marginTop: 10 }}>{myText}</div>
            ) : (
              <>
                <textarea
                  className="pta"
                  style={{ marginTop: 10 }}
                  rows={2}
                  value={text}
                  maxLength={MAX_ANSWER}
                  placeholder={tr("poll.wantToSayWhyOptional")}
                  onChange={(e) => setText(e.target.value)}
                />
                <div className="prow">
                  <span className={`pcount`}>{tr("poll.left", { left: String(left) })}</span>
                  <button
                    className="psend"
                    disabled={!typed || !!busy}
                    onClick={() => send(myVote, text)}
                  >
                    {busy ? tr("btn.sending") : tr("label.poll.addIt")}
                  </button>
                </div>
              </>
            )
          ) : null}
        </>
      ) : (
        <div className="popts">
          {options.map((o) => (
            <button key={o.id} className="popt" disabled={!!busy} onClick={() => send(o.id)}>
              {busy === o.id ? tr("label.adv.saving") : o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const POLL_CARD_CSS = `
  .psm-poll{padding:16px}
  .psm-poll .pq{font-family:var(--hd,inherit);font-weight:800;font-size:1rem;
    line-height:1.3;margin-bottom:12px;color:var(--ink,#12162a)}
  .psm-poll .popts{display:flex;flex-direction:column;gap:8px}
  .psm-poll .popt{display:block;width:100%;text-align:left;padding:11px 14px;
    border-radius:12px;border:1px solid var(--line,#e3e8f4);background:var(--panel,#fff);
    font:inherit;font-weight:600;font-size:.92rem;color:var(--ink,#12162a);cursor:pointer;
    transition:border-color .14s,transform .14s}
  .psm-poll .popt:hover:not(:disabled){border-color:var(--primary,#3a6fff);transform:translateY(-1px)}
  .psm-poll .popt:disabled{opacity:.6;cursor:default}
  .psm-poll .popt.again{margin-top:10px;text-align:center;font-size:.84rem;
    font-weight:700;color:var(--primary,#3a6fff);padding:9px 14px}

  .psm-poll .pta{width:100%;padding:11px 13px;border-radius:12px;font:inherit;
    font-size:.92rem;line-height:1.45;color:var(--ink,#12162a);resize:vertical;
    background:var(--panel-2,#f6f8fd);border:1px solid var(--line,#e3e8f4);outline:none}
  .psm-poll .pta:focus{border-color:var(--primary,#3a6fff);background:var(--panel,#fff)}
  .psm-poll .prow{display:flex;justify-content:space-between;align-items:center;
    gap:12px;margin-top:10px}
  .psm-poll .pcount{font-size:.76rem;color:var(--faint,#818ead);font-variant-numeric:tabular-nums}
  .psm-poll .pcount.low{color:var(--danger,#e5484d)}
  .psm-poll .psend{padding:9px 18px;border:0;border-radius:11px;cursor:pointer;
    font:inherit;font-weight:800;font-size:.88rem;color:#fff;
    background:linear-gradient(90deg,#3a6fff,#8b5cf6)}
  .psm-poll .psend:disabled{opacity:.45;cursor:not-allowed}
  .psm-poll .pmine{padding:11px 13px;border-radius:12px;font-size:.9rem;line-height:1.45;
    color:var(--ink,#12162a);background:var(--panel-2,#f6f8fd);
    border:1px solid var(--line,#e3e8f4);overflow-wrap:anywhere}

  .psm-poll .pbars{display:flex;flex-direction:column;gap:10px}
  .psm-poll .pl{display:flex;justify-content:space-between;gap:10px;
    font-size:.86rem;font-weight:600;margin-bottom:4px;color:var(--ink,#12162a)}
  .psm-poll .ppct{font-variant-numeric:tabular-nums;color:var(--txt-2,#535e78)}
  .psm-poll .ptrack{height:8px;border-radius:99px;background:var(--panel-2,#f0f4fd);overflow:hidden}
  .psm-poll .pfill{display:block;height:100%;border-radius:99px;
    background:var(--line-2,#d3daec);transition:width .3s}
  .psm-poll .pbar.mine .pfill{background:linear-gradient(90deg,#3a6fff,#8b5cf6)}
  .psm-poll .pbar.mine .pname::after{content:" — your answer";font-weight:500;
    color:var(--txt-2,#535e78)}
  .psm-poll .pfoot{margin:12px 0 0;font-size:.78rem;color:var(--faint,#818ead)}
`;
