"use client";

import { useEffect, useState } from "react";
import { Ic } from "./adv-icons";

// Presentation + localStorage only. No business-table writes here; every
// step derives from data passed in by the parent, and manual ticks + the
// "all set" dismissal are persisted per-advertiser in localStorage.

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
};

type Persisted = { manual: string[]; dismissed: boolean };

const storageKey = (advertiserId: string | null) =>
  `psm-onboarding-${advertiserId ?? "anon"}`;

function loadState(advertiserId: string | null): Persisted {
  if (typeof window === "undefined") return { manual: [], dismissed: false };
  try {
    const raw = window.localStorage.getItem(storageKey(advertiserId));
    if (!raw) return { manual: [], dismissed: false };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      manual: Array.isArray(parsed.manual)
        ? parsed.manual.filter((x): x is string => typeof x === "string")
        : [],
      dismissed: !!parsed.dismissed,
    };
  } catch {
    return { manual: [], dismissed: false };
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
  const [hydrated, setHydrated] = useState(false);

  // Read persisted state after mount only, so SSR and the first client render
  // agree (avoids a hydration mismatch).
  useEffect(() => {
    const s = loadState(advertiserId);
    setManual(s.manual);
    setDismissed(s.dismissed);
    setHydrated(true);
  }, [advertiserId]);

  const persist = (nextManual: string[], nextDismissed: boolean) => {
    setManual(nextManual);
    setDismissed(nextDismissed);
    saveState(advertiserId, { manual: nextManual, dismissed: nextDismissed });
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
    },
  ];

  const isDone = (s: Step) => s.auto || manual.includes(s.id);
  const doneCount = steps.filter(isDone).length;
  const allDone = doneCount === steps.length;

  const toggle = (s: Step) => {
    if (s.auto) return; // data-driven; can't be unticked by hand
    const next = manual.includes(s.id)
      ? manual.filter((x) => x !== s.id)
      : [...manual, s.id];
    persist(next, dismissed);
  };

  // Nothing until the persisted state is loaded (also keeps SSR output empty).
  if (!hydrated) return null;

  if (allDone) {
    if (dismissed) return null;
    return (
      <div
        className="card"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "var(--win-soft)",
          border: "1px solid rgba(16,185,129,.24)",
        }}
      >
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            background: "#fff",
            color: "var(--win)",
            display: "grid",
            placeItems: "center",
            flex: "0 0 auto",
          }}
        >
          <Ic name="i-check" />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--hd)", fontWeight: 800 }}>
            You&apos;re all set 🎉
          </div>
          <div style={{ color: "var(--muted)", fontSize: ".85rem" }}>
            Your account is ready — nice work.
          </div>
        </div>
        <button
          className="btn ghost sm"
          style={{ marginLeft: "auto" }}
          aria-label="Dismiss"
          onClick={() => persist(manual, true)}
        >
          <Ic name="i-x" /> Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="phead" style={{ alignItems: "center" }}>
        <div>
          <h2>Get started</h2>
          <p className="cap" style={{ margin: "4px 0 0" }}>
            {doneCount} of {steps.length} done — {steps.length - doneCount} to
            go.
          </p>
        </div>
        <span className="badge info">
          {doneCount}/{steps.length}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginTop: 14,
        }}
      >
        {steps.map((s) => {
          const done = isDone(s);
          return (
            /* .onbrow handles the layout (see adv-shell-css.ts). It used to
               be a single non-wrapping flex line: the tick, the icon and a
               nowrap CTA are all unshrinkable, so on a phone the text was the
               only thing that could give and collapsed to a ~55px column —
               one word per line, turning the first card on the dashboard into
               a ~1100px wall. */
            <div
              key={s.id}
              className="onbrow"
              style={{
                padding: "12px 13px",
                border: "1px solid var(--line)",
                borderRadius: 13,
                background: done ? "var(--win-soft)" : "var(--panel-2)",
              }}
            >
              <button
                onClick={() => toggle(s)}
                disabled={s.auto}
                aria-pressed={done}
                aria-label={done ? "Completed" : `Mark "${s.title}" complete`}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9,
                  border: done ? "0" : "2px solid var(--line-2)",
                  background: done ? "var(--win)" : "var(--panel)",
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  flex: "0 0 auto",
                  cursor: s.auto ? "default" : "pointer",
                }}
              >
                {done && <Ic name="i-check" />}
              </button>
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  display: "grid",
                  placeItems: "center",
                  flex: "0 0 auto",
                  background: "var(--primary-tint)",
                  color: "var(--primary-600)",
                }}
              >
                <Ic name={s.icon} />
              </span>
              <div className="otx">
                <div
                  style={{
                    fontWeight: 700,
                    color: done ? "var(--muted)" : "var(--ink)",
                    textDecoration: done ? "line-through" : "none",
                  }}
                >
                  {s.title}
                </div>
                <div style={{ color: "var(--faint)", fontSize: ".82rem" }}>
                  {s.desc}
                </div>
              </div>
              {done ? (
                <span className="badge ok ocat">Done</span>
              ) : (
                <button
                  className="btn ghost sm ocat"
                  onClick={() => onNavigate(s.view)}
                >
                  {s.cta} <Ic name="i-arrow" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
