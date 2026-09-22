"use client";

import dayjs from "dayjs";

import { Ic } from "@/components/advertiser/adv-icons";
import WhatsappIcon from "@/components/psm/whatsapp-icon";
import { whatsappUrl } from "@/lib/whatsapp";

// ── WHERE AN APPLICATION STANDS ─────────────────────────────────────────
//
// The owner, 22-09: "application scherm is erg lelijk". After applying,
// the join offer stayed on screen with its button greyed out -- an offer
// you cannot take, instead of an answer. This is the answer: received,
// what happens now, and what comes after, with the step we are on lit.
// A refusal says why, and offers to try again.

export default function AffiliateApplicationCard({
  state,
  appliedAt,
  reason,
  applying,
  onApplyAgain,
}: {
  state: "applied" | "refused";
  appliedAt: string | null;
  reason: string | null;
  applying: boolean;
  onApplyAgain: () => void;
}) {
  if (state === "refused") {
    return (
      <div className="appcard refused">
        <div className="ac-top">
          <span className="ac-ic warn">
            <Ic name="i-help" />
          </span>
          <div>
            <h2>Not this time</h2>
            <p className="cap">
              {reason ? reason : "We couldn't take you onto the affiliate program yet."}
            </p>
          </div>
        </div>
        <p className="ac-note">
          Things change — you can apply again whenever you like, or ask us what would help.
        </p>
        <div className="ac-acts">
          <button className="btn" onClick={onApplyAgain} disabled={applying}>
            <Ic name="i-gift" /> {applying ? "Sending…" : "Apply again"}
          </button>
          <a
            className="btn ghost wa"
            href={whatsappUrl("Hi PSM, I'd like to talk about the affiliate program.")}
            target="_blank"
            rel="noopener noreferrer"
          >
            <WhatsappIcon /> Ask us
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="appcard">
      <div className="ac-top">
        <span className="ac-ic ok">
          <Ic name="i-check" />
        </span>
        <div>
          <h2>Application received</h2>
          <p className="cap">
            We&apos;re setting up your rate. You&apos;ll see it here — and your own link — the
            moment it is ready.
          </p>
        </div>
      </div>
      <ol className="ac-steps">
        <li className="done">
          <span className="dot">
            <Ic name="i-check" />
          </span>
          <span className="t">
            <b>You applied</b>
            <small>{appliedAt ? dayjs(appliedAt).format("D MMM YYYY, HH:mm") : "Just now"}</small>
          </span>
        </li>
        <li className="now">
          <span className="dot" />
          <span className="t">
            <b>We set your rate</b>
            <small>What you earn on each customer you bring</small>
          </span>
        </li>
        <li>
          <span className="dot" />
          <span className="t">
            <b>Your link goes live</b>
            <small>Share it — everyone who signs up is yours</small>
          </span>
        </li>
      </ol>
      <a
        className="btn ghost wa ac-help"
        href={whatsappUrl("Hi PSM, I applied for the affiliate program — a question:")}
        target="_blank"
        rel="noopener noreferrer"
      >
        <WhatsappIcon /> Questions? WhatsApp us
      </a>
    </div>
  );
}
