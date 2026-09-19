"use client";

import { useEffect, useState } from "react";
import { Ic } from "./adv-icons";
import {
  isCompanyComplete,
  missingCompanyFields,
} from "@/lib/pure-company-complete";

// Presentation + localStorage only. No business-table writes here; every
// step derives from data passed in by the parent, and manual ticks, the
// collapsed state and the "all set" dismissal are persisted per-advertiser
// in localStorage.

type Props = {
  advertiserId: string | null;
  company: Record<string, unknown> | null;
  eurBalance: number;
  usdBalance: number;
  accountsCount: number;
  /**
   * Has a wallet top-up EVER completed for this advertiser?
   *
   * The tick used to be `eurBalance > 0 || usdBalance > 0`, and a balance
   * is not the thing the step describes. Top up your wallet is something
   * you DID; the money then leaves again — the first €5 top-up goes
   * straight out to the €5 monthly plan — and the moment it does, the
   * list unticks the step, says "2 steps left" and tells the customer to
   * fund a wallet they have already funded.
   */
  hasToppedUp?: boolean;
  /** True while any of the reads behind the ticks is still in flight. */
  loading?: boolean;
  /**
   * True when one of those reads FAILED. Not the same as loading, and it
   * used not to be passed at all — so on a failed read `isLoading` went
   * false, `company` came back null and both balances came back 0, and a
   * customer holding EUR 10,000 with six live accounts was shown "Get
   * started — 4 steps left" at 0%, told to fund their wallet and request
   * an ad account. The `dismissed` flag does not protect them: it only
   * suppresses the all-done card.
   */
  unavailable?: boolean;
  onNavigate: (view: string) => void;
};

type Step = {
  id: string;
  title: string;
  desc: string;
  icon: string;
  cta: string;
  view: string;
  // Auto-detected from real data. Informational steps are always false and
  // rely on a manual tick.
  auto: boolean;
  // Steps that are part of setting the account up stay on the list once
  // ticked, collapsed, so the list still reads as a record of what was done.
  // An optional invitation to go and look at something does not: once you
  // have looked, it is finished with, and leaving it there is clutter.
  removeWhenDone?: boolean;
};

type Persisted = { manual: string[]; dismissed: boolean; collapsed: boolean };

const storageKey = (advertiserId: string | null) =>
  `psm-onboarding-${advertiserId ?? "anon"}`;

function loadState(advertiserId: string | null): Persisted {
  const empty: Persisted = { manual: [], dismissed: false, collapsed: false };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(storageKey(advertiserId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      manual: Array.isArray(parsed.manual)
        ? parsed.manual.filter((x): x is string => typeof x === "string")
        : [],
      dismissed: !!parsed.dismissed,
      collapsed: !!parsed.collapsed,
    };
  } catch {
    return empty;
  }
}

function saveState(advertiserId: string | null, state: Persisted) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(advertiserId),
      JSON.stringify(state),
    );
  } catch {
    /* ignore quota / disabled storage */
  }
}


export default function OnboardingChecklist({
  advertiserId,
  company,
  eurBalance,
  usdBalance,
  accountsCount,
  hasToppedUp = false,
  loading = false,
  unavailable = false,
  onNavigate,
}: Props) {
  const [manual, setManual] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Read persisted state after mount only, so SSR and the first client render
  // agree (avoids a hydration mismatch).
  useEffect(() => {
    const s = loadState(advertiserId);
    setManual(s.manual);
    setDismissed(s.dismissed);
    setCollapsed(s.collapsed);
    setHydrated(true);
  }, [advertiserId]);

  const persist = (next: Partial<Persisted>) => {
    const merged: Persisted = { manual, dismissed, collapsed, ...next };
    setManual(merged.manual);
    setDismissed(merged.dismissed);
    setCollapsed(merged.collapsed);
    saveState(advertiserId, merged);
  };

  // THE SAME FUNCTION THE GATE CALLS, not a second copy of the same
  // rule. This was written out by hand and missed the four fields that
  // live on `billings` — so the step went green and ticked while the red
  // chip "Add your company details to top up or request an account"
  // stayed on the same screen and every button it gates stayed shut. The
  // customer had done what they were told, been told they had done it,
  // and nothing unlocked. Second time this pair disagreed; it is one
  // function now.
  const companyDone = isCompanyComplete(company as never);
  const companyMissing = missingCompanyFields(company as never);

  const steps: Step[] = [
    {
      id: "company",
      title: "Add your company details",
      // Names what is actually left when it is one or two things. A
      // generic "add your company details" to somebody who has already
      // saved the company card reads as though nothing saved — and what
      // they are missing is usually the billing address, which is on a
      // different form.
      desc:
        companyMissing.length && companyMissing.length <= 2
          ? `Still needed: ${companyMissing.join(" and ")}.`
          : "Add your legal name, VAT ID and country so we can invoice you.",
      icon: "i-building",
      cta: "Add details",
      // NOT "settings". The settings card saves `companies` only —
      // updateOwnProfileAndCompany never touches `billings`, which the
      // gate also requires — so a customer filled it in, read "Company
      // saved", and nothing unlocked. /complete-profile is the form that
      // writes both.
      view: "complete-profile",
      auto: companyDone,
    },
    {
      id: "topup",
      title: "Top up your wallet",
      desc: "Fund your wallet by bank transfer to start spending.",
      icon: "i-wallet",
      cta: "Top up",
      view: "wallet",
      // A balance OR a completed transfer. Either one proves the step.
      auto: hasToppedUp || eurBalance > 0 || usdBalance > 0,
    },
    {
      id: "account",
      title: "Request an ad account",
      // No hours quoted. A number on screen is a promise, and this one is
      // not ours to make — it depends on the platform, not on us.
      desc: "We set it up for you on our verified Business Manager.",
      icon: "i-ad",
      cta: "Request",
      view: "accounts",
      auto: accountsCount > 0,
    },
    {
      id: "affiliate",
      title: "Earn as an affiliate",
      desc: "Refer other advertisers and earn commission on what they pay.",
      icon: "i-gift",
      cta: "Learn more",
      view: "referrals",
      auto: false, // informational — completed by a manual tick
      removeWhenDone: true,
    },
  ];

  const isDone = (s: Step) => s.auto || manual.includes(s.id);
  // What the list shows. The affiliate invitation leaves once it is ticked.
  const visible = steps.filter((s) => !(s.removeWhenDone && isDone(s)));
  const doneCount = visible.filter(isDone).length;
  const remaining = visible.length - doneCount;
  const allDone = remaining === 0;

  const toggle = (s: Step) => {
    if (s.auto) return; // data-driven; can't be unticked by hand
    const next = manual.includes(s.id)
      ? manual.filter((x) => x !== s.id)
      : [...manual, s.id];
    persist({ manual: next });
  };

  // Until the persisted state is read this cannot know whether it is
  // collapsed, dismissed, or which steps were ticked by hand — so it cannot
  // render the right thing. It used to render NOTHING, which meant the card
  // appeared a frame later and shoved the whole dashboard down. A block of
  // the same height holds the place instead, so the page arrives assembled.
  // `loading` as well as `hydrated`. localStorage answers in the same tick;
  // the three queries behind the ticks do not, and drawing the card before
  // they land is what made it appear to tick and untick itself.
  if (!hydrated || loading || unavailable) {
    // A FAILED READ HOLDS THE PLACE TOO, rather than drawing a checklist
    // out of zeroes. Every tick here is derived from data: no company, no
    // balance, no accounts is indistinguishable from a read that did not
    // come back, and the difference between those two is "you are new"
    // versus "we could not ask". The dashboard already says out loud, in
    // its own cards, that it could not load — this card saying it again
    // adds nothing, and saying the opposite is the fault.
    return <div className="card onb-skel" aria-hidden="true" />;
  }

  if (allDone) {
    if (dismissed) return null;
    return (
      <div className="card onb-done">
        <span className="onb-done-ic">
          <Ic name="i-check" />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="onb-done-t">You&apos;re all set</div>
          <div className="onb-done-s">
            Everything is in place — your account is ready to run.
          </div>
        </div>
        <button
          className="btn ghost sm"
          style={{ marginLeft: "auto" }}
          aria-label="Dismiss"
          onClick={() => persist({ dismissed: true })}
        >
          Dismiss
        </button>
      </div>
    );
  }

  const pct = visible.length ? (doneCount / visible.length) * 100 : 0;

  return (
    <section className="card onb">
      {/* The whole card folds away. Someone who knows what is left does not
          need it opened every time they come to the dashboard, and it sits
          above everything else on the page. */}
      <button
        className="onb-head"
        onClick={() => persist({ collapsed: !collapsed })}
        aria-expanded={!collapsed}
      >
        <span className="onb-head-t">
          <h2>Get started</h2>
          <span className="onb-head-s">
            {remaining === 1 ? "1 step left" : `${remaining} steps left`}
          </span>
        </span>
        {/* A thin bar rather than a "1/4" pill. The pill was the loudest
            thing on the dashboard and it was reporting the least urgent
            information on it. */}
        <span className="onb-meter" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </span>
        <span className={`onb-chev${collapsed ? "" : " up"}`} aria-hidden="true">
          <Ic name="i-chev" />
        </span>
      </button>

      {!collapsed && (
        <div className="onb-list">
          {visible.map((s) => {
            const done = isDone(s);

            // Finished steps collapse to one quiet line: tick, icon, title.
            // They used to keep the full block — description, Done badge and
            // all — so the card only ever grew, and the three things still
            // to do were pushed further down by the things already handled.
            if (done) {
              return (
                <div key={s.id} className="onbrow is-done">
                  <button
                    className="onb-tick on"
                    onClick={() => toggle(s)}
                    disabled={s.auto}
                    aria-label={
                      s.auto
                        ? `${s.title} — completed`
                        : `Mark "${s.title}" not done`
                    }
                  >
                    <Ic name="i-check" />
                  </button>
                  <span className="onb-ic">
                    <Ic name={s.icon} />
                  </span>
                  <span className="onb-t">{s.title}</span>
                </div>
              );
            }

            return (
              /* .onbrow handles the layout (see adv-shell-css.ts). It used to
                 be a single non-wrapping flex line: the tick, the icon and a
                 nowrap CTA are all unshrinkable, so on a phone the text was
                 the only thing that could give and collapsed to a ~55px
                 column — one word per line, turning the first card on the
                 dashboard into a ~1100px wall. */
              /* Tick, icon and TITLE share the first line; the description
                 takes its own. They used to be split the other way — the
                 whole text block wrapped below on a phone — which left two
                 small squares floating alone on a line of their own. */
              <div key={s.id} className="onbrow">
                <button
                  className="onb-tick"
                  onClick={() => toggle(s)}
                  /* ── ONLY THE INFORMATIONAL STEP TAKES A TICK ────────
                     `auto` IS the "have they actually done it" flag, so
                     `disabled={s.auto}` left the tick ENABLED on every
                     step that was still outstanding. One tap on "Add
                     your company details" set it manually, allDone went
                     true, and the card swapped to "You're all set —
                     everything is in place" on a dashboard still showing
                     the red chip telling them to add company details,
                     with Top up, Exchange and Request all dead. The
                     comment at the top of this file says it exists to
                     prevent exactly that.

                     The affiliate invitation is the one step that has
                     nothing to detect, so it is the one that can be
                     ticked by hand. */
                  disabled={!s.removeWhenDone}
                  aria-label={
                    s.removeWhenDone
                      ? `Dismiss "${s.title}"`
                      : `${s.title} — ticks itself once you have done it`
                  }
                />
                <span className="onb-ic">
                  <Ic name={s.icon} />
                </span>
                <span className="onb-t">{s.title}</span>
                <p className="onb-d">{s.desc}</p>
                <button
                  className="btn ghost sm ocat"
                  onClick={() => onNavigate(s.view)}
                >
                  {s.cta} <Ic name="i-arrow" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
