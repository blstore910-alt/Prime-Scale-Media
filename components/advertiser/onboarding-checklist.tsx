"use client";

import { useEffect, useState } from "react";
import { Ic } from "./adv-icons";

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

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export default function OnboardingChecklist({
  advertiserId,
  company,
  eurBalance,
  usdBalance,
  accountsCount,
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

  const companyDone =
    !!str(company?.name) && !!str(company?.vat_no) && !!str(company?.country);

  const steps: Step[] = [
    {
      id: "company",
      title: "Complete your company details",
      desc: "Add your legal name, VAT ID and country so we can invoice you.",
      icon: "i-building",
      cta: "Add details",
      view: "settings",
      auto: companyDone,
    },
    {
      id: "topup",
      title: "Top up your wallet",
      desc: "Fund your wallet by bank transfer to start spending.",
      icon: "i-wallet",
      cta: "Top up",
      view: "wallet",
      auto: eurBalance > 0 || usdBalance > 0,
    },
    {
      id: "account",
      title: "Request your first ad account",
      desc: "We set it up on our verified Business Manager, live in 3–12 hours.",
      icon: "i-ad",
      cta: "Request",
      view: "accounts",
      auto: accountsCount > 0,
    },
    {
      id: "affiliate",
      title: "Explore the affiliate program",
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

  // Nothing until the persisted state is loaded (also keeps SSR output empty).
  if (!hydrated) return null;

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
              <div key={s.id} className="onbrow">
                <button
                  className="onb-tick"
                  onClick={() => toggle(s)}
                  disabled={s.auto}
                  aria-label={
                    s.auto
                      ? `${s.title} — completed automatically once done`
                      : `Mark "${s.title}" complete`
                  }
                />
                <span className="onb-ic">
                  <Ic name={s.icon} />
                </span>
                <div className="otx">
                  <div className="onb-t">{s.title}</div>
                  <div className="onb-d">{s.desc}</div>
                </div>
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
