"use client";

import { useT } from "@/hooks/use-t";
import dayjs from "dayjs";

import { Ic } from "@/components/advertiser/adv-icons";
import WhatsappIcon from "@/components/psm/whatsapp-icon";

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
  const { t: tr } = useT();
  if (state === "refused") {
    return (
      <div className="appcard refused">
        <div className="ac-top">
          <span className="ac-ic warn">
            <Ic name="i-help" />
          </span>
          <div>
            <h2>{tr("label.affapp.notThisTime")}</h2>
            <p className="cap">
              {reason ? reason : tr("affapp.weCouldnTTakeYou")}
            </p>
          </div>
        </div>
        <p className="ac-note">
          {tr("affapp.thingsChangeYouCanApply")}</p>
        <div className="ac-acts">
          <button className="btn" onClick={onApplyAgain} disabled={applying}>
            <Ic name="i-gift" /> {applying ? tr("btn.sending") : tr("label.adv.applyAgain")}
          </button>
          <span className="btn ghost wa" style={{ cursor: "default" }}>
            <WhatsappIcon /> {" "}{tr("affapp.askUsInYourGroup")}</span>
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
          <h2>{tr("affapp.applicationReceived")}</h2>
          <p className="cap">
            {tr("affapp.weReSettingUpYour")}</p>
        </div>
      </div>
      <ol className="ac-steps">
        <li className="done">
          <span className="dot">
            <Ic name="i-check" />
          </span>
          <span className="t">
            <b>{tr("label.affapp.youApplied")}</b>
            <small>{appliedAt ? dayjs(appliedAt).format("D MMM YYYY, HH:mm") : tr("label.affapp.justNow")}</small>
          </span>
        </li>
        <li className="now">
          <span className="dot" />
          <span className="t">
            <b>{tr("label.affapp.weSetYourRate")}</b>
            <small>{tr("affapp.whatYouEarnOnEach")}</small>
          </span>
        </li>
        <li>
          <span className="dot" />
          <span className="t">
            <b>{tr("affapp.yourLinkGoesLive")}</b>
            <small>{tr("affapp.shareItEveryoneWhoSigns")}</small>
          </span>
        </li>
      </ol>
      <p className="ac-help">
        <WhatsappIcon /> {" "}{tr("affapp.questionsAskUsInYour")}</p>
    </div>
  );
}
