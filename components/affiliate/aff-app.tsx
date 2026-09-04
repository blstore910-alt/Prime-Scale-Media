"use client";

import { jakarta } from "@/lib/fonts";
import { useAppContext } from "@/context/app-provider";
import useAffiliateStats from "@/hooks/use-affiliate-stats";
import { getURL } from "@/lib/utils";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AFF_CSS } from "./aff-shell-css";
import { AffIcons, Ic } from "./aff-icons";

type View = "dash" | "refs" | "pay" | "notif" | "set" | "help";
const TITLES: Record<View, string> = {
  dash: "Dashboard",
  refs: "My Referrals",
  pay: "Wallet",
  notif: "Notifications",
  set: "Settings",
  help: "Get Help",
};

const TIERS = [
  { key: "bronze", name: "Bronze", min: 0 },
  { key: "silver", name: "Silver", min: 250 },
  { key: "gold", name: "Gold", min: 1000 },
  { key: "plat", name: "Platinum", min: 2500 },
];

const eur = (n: number) =>
  "€" + Math.round(Number(n) || 0).toLocaleString("nl-NL");
const usd = (n: number) =>
  "$" + Math.round(Number(n) || 0).toLocaleString("nl-NL");

function initials(name?: string | null) {
  if (!name) return "PS";
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "PS"
  );
}

function monthStartIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function AffiliateApp() {
  const { profile } = useAppContext();
  const [view, setView] = useState<View>("refs");
  const [navOpen, setNavOpen] = useState(false);
  const [showEurUsd, setShowEurUsd] = useState<"EUR" | "USD">("EUR");
  const [payOpen, setPayOpen] = useState(false);

  const name = (profile?.full_name as string) ?? "Affiliate";
  const ini = initials(name);

  // Real referral book (all-time) + this-month slice for the topbar pill.
  const all = useAffiliateStats();
  const month = useAffiliateStats({ from: monthStartIso() });

  const lifetimeEur = all.totals.earnings_eur;
  const monthEur = month.totals.earnings_eur;
  const referredCount = all.rows.length;
  const activeCount = all.rows.filter((r) => Number(r.topup_count) > 0).length;

  const tierIndex = useMemo(() => {
    let idx = 0;
    TIERS.forEach((t, i) => {
      if (lifetimeEur >= t.min) idx = i;
    });
    return idx;
  }, [lifetimeEur]);
  const tier = TIERS[tierIndex];
  const nextTier = TIERS[tierIndex + 1];
  const tierPct = nextTier
    ? Math.min(
        100,
        Math.round(
          ((lifetimeEur - tier.min) / (nextTier.min - tier.min)) * 100,
        ),
      )
    : 100;

  const tenantSlug = profile?.tenant?.slug;
  const referralCode = profile?.advertiser?.[0]?.tenant_client_code;
  const referralLink = useMemo(() => {
    if (!tenantSlug || !referralCode) return "";
    const base = getURL().replace(/\/$/, "");
    const u = new URL(`${base}/auth/sign-up`);
    u.searchParams.set("t", tenantSlug);
    u.searchParams.set("ref", referralCode);
    return u.toString();
  }, [tenantSlug, referralCode]);

  const go = (v: View) => {
    setView(v);
    setNavOpen(false);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };

  const copyLink = async () => {
    if (!referralLink) {
      toast.error("Your referral link isn't set up yet.");
      return;
    }
    try {
      await navigator.clipboard.writeText(referralLink);
      toast.success("Referral link copied.");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  const NAV: { v: View; icon: string; label: string; n?: number }[] = [
    { v: "dash", icon: "i-home", label: "Dashboard" },
    { v: "refs", icon: "i-target", label: "My Referrals" },
    { v: "pay", icon: "i-wallet", label: "Wallet" },
    { v: "notif", icon: "i-bell", label: "Notifications" },
    { v: "set", icon: "i-settings", label: "Settings" },
    { v: "help", icon: "i-help", label: "Get Help" },
  ];
  const BOTTOM: { v: View; icon: string; label: string }[] = [
    { v: "refs", icon: "i-target", label: "Referrals" },
    { v: "pay", icon: "i-wallet", label: "Wallet" },
    { v: "dash", icon: "i-home", label: "Home" },
    { v: "notif", icon: "i-bell", label: "Alerts" },
    { v: "set", icon: "i-settings", label: "Settings" },
  ];

  return (
    <div className={`affapp app ${jakarta.variable}`}>
      <style>{AFF_CSS}</style>
      <style>{
        // Softer shadow on the dashboard stat tiles (user: too heavy).
        ".affapp .stat{box-shadow:0 4px 14px -12px rgba(30,42,90,.28)}"
      }</style>
      <AffIcons />

      <div
        className={`scrim${navOpen ? " on" : ""}`}
        onClick={() => setNavOpen(false)}
      />

      <aside className={`sidebar${navOpen ? " open" : ""}`}>
        <div className="logo">
          <span className="mark">
            <Ic name="i-rocket" />
          </span>
          <span className="name">
            Prime Scale Media<small>Affiliate portal</small>
          </span>
        </div>
        {NAV.map((item) => (
          <button
            key={item.v}
            className={`navlink${view === item.v ? " on" : ""}`}
            onClick={() => go(item.v)}
          >
            <Ic name={item.icon} /> {item.label}
          </button>
        ))}
        <div className="side-foot">
          <div className="avatar">{ini}</div>
          <div className="who">
            {name}
            <small>{tier.name} partner</small>
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <button
            className="iconbtn ham"
            aria-label="Menu"
            onClick={() => setNavOpen(true)}
          >
            <Ic name="i-menu" />
          </button>
          <div className="tb-brand">
            <span className="mark">
              <Ic name="i-rocket" />
            </span>
            <span className="tb-title">{TITLES[view]}</span>
          </div>
          <div className="tb-spacer" />
          <div className="toolbar">
            <button
              className="tool earn"
              onClick={() => go("pay")}
              title="Open wallet"
            >
              <Ic name="i-trend" />
              <span className="e">
                <small>This month</small>
                <b>{eur(monthEur)}</b>
              </span>
            </button>
            <span className="tdiv" />
            <button
              className="tool tier2"
              onClick={() => go("refs")}
              title="Your tier"
            >
              <Ic name="i-trophy" /> {tier.name}
            </button>
            <span className="tdiv" />
            <button
              className="tool ic-btn"
              onClick={() => go("notif")}
              aria-label="Notifications"
            >
              <Ic name="i-bell" />
            </button>
            <button
              className="tool ava-btn"
              onClick={() => go("set")}
              title="Settings"
            >
              <span className="avatar">{ini}</span>
              <Ic name="i-chev" />
            </button>
          </div>
        </div>

        <div className="content">
          {/* DASHBOARD */}
          <div className={`view${view === "dash" ? " on" : ""}`}>
            <section className="hero">
              <div className="ribbon" />
              <div className="glow" />
              <div className="hero-inner">
                <p className="eyebrow">
                  <Ic name="i-spark" /> Your total earnings
                </p>
                <h1 className="jackpot" onClick={() => go("pay")}>
                  <span className="cur">€</span>
                  {Math.round(lifetimeEur).toLocaleString("nl-NL")}
                </h1>
                <div className="hero-tiles">
                  <div className="ht" onClick={() => go("refs")}>
                    <Ic name="i-users" className="ic hti" />
                    <div className="v">{referredCount}</div>
                    <div className="l">Referred</div>
                  </div>
                  <div className="ht win" onClick={() => go("refs")}>
                    <Ic name="i-trend" className="ic hti" />
                    <div className="v">{activeCount}</div>
                    <div className="l">Active now</div>
                  </div>
                </div>
                <span className="rise-pill" onClick={() => go("pay")}>
                  <Ic name="i-trend" /> +{eur(monthEur)} this month
                </span>
              </div>
            </section>
            <div className="stats">
              <div className="stat" onClick={() => go("pay")}>
                <div className="k">
                  <Ic name="i-trophy" /> Lifetime
                </div>
                <div className="v gold">{eur(lifetimeEur)}</div>
              </div>
              <div className="stat" onClick={() => go("pay")}>
                <div className="k">
                  <Ic name="i-trend" /> This month
                </div>
                <div className="v win">{eur(monthEur)}</div>
              </div>
              <div className="stat" onClick={() => go("refs")}>
                <div className="k">
                  <Ic name="i-users" /> Referred
                </div>
                <div className="v blue">{referredCount}</div>
              </div>
              <div className="stat" onClick={() => go("pay")}>
                <div className="k">
                  <Ic name="i-wallet" /> Available
                </div>
                <div className="v gold">{eur(lifetimeEur)}</div>
              </div>
            </div>
            <div className="invite">
              <h2>
                <Ic name="i-gift" /> Share your link
              </h2>
              <p className="cap">
                Advertisers who join through your link are linked to you. You
                earn on what they pay PSM — the terms are set per referral: a
                one-time bonus, a % of their monthly fee, and/or a % of each
                ad-account top-up.
              </p>
              <div className="linkrow">
                <div className="linkbox">
                  {referralLink || "Your link isn't set up yet"}
                </div>
                <button className="btn" onClick={copyLink}>
                  <Ic name="i-copy" /> Copy
                </button>
              </div>
              <div className="share">
                <button
                  className="btn ghost"
                  onClick={() => toast.success("Shared via WhatsApp")}
                >
                  <Ic name="i-msg" /> WhatsApp
                </button>
                <button
                  className="btn ghost"
                  onClick={() => toast.success("Shared via email")}
                >
                  <Ic name="i-mail" /> Email
                </button>
                <button
                  className="btn ghost"
                  onClick={() => toast.success("QR code ready to scan")}
                >
                  <Ic name="i-qr" /> QR code
                </button>
              </div>
            </div>
          </div>

          {/* MY REFERRALS */}
          <div className={`view${view === "refs" ? " on" : ""}`}>
            <div className="filterbar">
              <div className="ddwrap">
                <button className="dd">
                  <Ic name="i-calendar" /> All time{" "}
                  <Ic name="i-chev" className="ic ddchev" />
                </button>
              </div>
              <button
                className="dd expbtn"
                onClick={() => toast.success("Exported all referrals (CSV)")}
              >
                <Ic name="i-download" /> Export all
              </button>
            </div>
            <div className="sumbar">
              <div className="c">
                <div className="l">
                  <span className="ci b">
                    <Ic name="i-users" />
                  </span>{" "}
                  Referrals
                </div>
                <div className="n">{referredCount}</div>
              </div>
              <div className="c">
                <div className="l">
                  <span className="ci t">
                    <Ic name="i-trend" />
                  </span>{" "}
                  Active
                </div>
                <div className="n">
                  {activeCount}{" "}
                  <span
                    style={{
                      fontWeight: 500,
                      color: "var(--faint)",
                      fontSize: ".8rem",
                    }}
                  >
                    of {referredCount}
                  </span>
                </div>
              </div>
              <div className="c">
                <div className="l">
                  <span className="ci b">
                    <Ic name="i-wallet" />
                  </span>{" "}
                  Top-up volume
                </div>
                <div className="n">{eur(all.totals.spend_eur)}</div>
              </div>
              <div className="c">
                <div className="l">
                  <span className="ci g">
                    <Ic name="i-trophy" />
                  </span>{" "}
                  Your commission
                </div>
                <div className="n win">{eur(lifetimeEur)}</div>
              </div>
            </div>

            <div className="grid">
              <div className="card" style={{ padding: "18px 20px" }}>
                <div className="prog-head">
                  <h2>Earnings summary</h2>
                  <b style={{ color: "var(--win)" }}>{eur(monthEur)} / mo</b>
                </div>
                <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                  <div className="feed-row" style={{ borderTop: 0 }}>
                    <span className="feed-ic">
                      <Ic name="i-trophy" />
                    </span>
                    <div>
                      <b>Lifetime earned</b>
                      <div
                        className="d"
                        style={{ color: "var(--faint)", fontSize: ".84rem" }}
                      >
                        Across {referredCount} referrals
                      </div>
                    </div>
                    <span className="amt">{eur(lifetimeEur)}</span>
                  </div>
                  <div className="feed-row">
                    <span
                      className="feed-ic"
                      style={{
                        background: "var(--primary-tint)",
                        color: "var(--primary-600)",
                      }}
                    >
                      <Ic name="i-wallet" />
                    </span>
                    <div>
                      <b>Top-up volume</b>
                      <div
                        className="d"
                        style={{ color: "var(--faint)", fontSize: ".84rem" }}
                      >
                        Total spend you drove
                      </div>
                    </div>
                    <span className="amt" style={{ color: "var(--ink)" }}>
                      {eur(all.totals.spend_eur)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="prog-head">
                  <h2>Your tier</h2>
                  <span className="ratepill">
                    Tier {tierIndex + 1} / {TIERS.length}
                  </span>
                </div>
                <div className="tierhero">
                  <div className={`thmedal ${tier.key}`}>
                    <Ic name="i-medal" />
                  </div>
                  <div className="thinfo">
                    <div className="thname">{tier.name}</div>
                    <div className="thsub">You&apos;re a {tier.name} partner</div>
                  </div>
                </div>
                <div className="track">
                  <div className="fill" style={{ width: `${tierPct}%` }} />
                </div>
                <p className="tiernote">
                  {nextTier ? (
                    <>
                      {eur(nextTier.min - lifetimeEur)} more in lifetime earnings
                      to reach <b className="gold">{nextTier.name}</b>.
                    </>
                  ) : (
                    <>
                      You&apos;ve reached the top tier —{" "}
                      <b className="plat">{tier.name}</b>. 🎉
                    </>
                  )}
                </p>
                <p className="tierlegend">
                  Your <b>lifetime earnings</b> unlock tier bonuses. Your
                  commission rate stays whatever was agreed per referral.
                </p>
              </div>
            </div>

            <div className="refhead">
              <h2>
                Your referrals{" "}
                <span className="muted2">· {activeCount} active</span>
              </h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {all.rows.length ? (
                all.rows.map((r) => (
                  <div className="rrow" key={r.referred_advertiser_id}>
                    <div
                      className="rhead"
                      style={{
                        gridTemplateColumns: "46px 1.5fr 1fr 1fr 128px",
                      }}
                    >
                      <div className="ava">
                        {initials(r.referred_advertiser_name)}
                      </div>
                      <div>
                        <div className="who">
                          {r.referred_advertiser_name || "Advertiser"}
                        </div>
                        <div className="code">
                          {r.referred_advertiser_code || "—"}
                        </div>
                      </div>
                      <div className="col">
                        <div className="lbl">Top-ups</div>
                        <div className="num">{r.topup_count}</div>
                      </div>
                      <div className="col">
                        <div className="lbl">Spend</div>
                        <div className="num">{eur(r.spend_eur)}</div>
                      </div>
                      <div className="col comm">
                        <div className="lbl">Commission</div>
                        <div className="num win">{eur(r.earnings_eur)}</div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="card">
                  <p className="cap" style={{ margin: 0 }}>
                    No referrals yet. Share your link to start earning.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* WALLET */}
          <div className={`view${view === "pay" ? " on" : ""}`}>
            <div className="grid">
              <div className="balance">
                <div className="bshine" />
                <div className="brow">
                  <span className="btag">
                    <Ic name="i-wallet" /> Commission wallet
                  </span>
                  <span className="btag ghost2">
                    <Ic name="i-trophy" /> {tier.name}
                  </span>
                </div>
                <div className="l">Commission earned</div>
                <div className="bpots">
                  <div className="bpot">
                    <span className="pl">EUR earnings</span>
                    <b>{eur(all.totals.earnings_eur)}</b>
                  </div>
                  <div className="bpot">
                    <span className="pl">USD earnings</span>
                    <b>{usd(all.totals.earnings_usd)}</b>
                  </div>
                </div>
                <div className="sub">
                  Payouts are processed manually by the PSM team — request one
                  and we settle it to your account.
                </div>
                <div className="bactions">
                  <button
                    className="btn gold"
                    onClick={() => setPayOpen(true)}
                  >
                    <Ic name="i-download" /> Request payout
                  </button>
                  <span className="payin">
                    <Ic name="i-clock" /> Within 7 days
                  </span>
                </div>
              </div>
              <div className="card">
                <h2>How payouts work</h2>
                <p className="cap">
                  Your wallet holds the commission you&apos;ve earned. Request a
                  payout and we create an invoice — the PSM team pays it to your
                  account.
                </p>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    marginTop: 8,
                  }}
                >
                  <div
                    style={{ display: "flex", gap: 11, alignItems: "center" }}
                  >
                    <span
                      className="feed-ic"
                      style={{
                        background: "var(--primary-tint)",
                        color: "var(--primary-600)",
                      }}
                    >
                      <Ic name="i-wallet" />
                    </span>
                    <div>
                      <b>1. Request</b>
                      <div
                        className="d"
                        style={{ color: "var(--faint)", fontSize: ".84rem" }}
                      >
                        Tap &quot;Request payout&quot; for your balance.
                      </div>
                    </div>
                  </div>
                  <div
                    style={{ display: "flex", gap: 11, alignItems: "center" }}
                  >
                    <span
                      className="feed-ic"
                      style={{
                        background: "var(--gold-soft)",
                        color: "var(--gold-deep)",
                      }}
                    >
                      <Ic name="i-receipt" />
                    </span>
                    <div>
                      <b>2. Invoice</b>
                      <div
                        className="d"
                        style={{ color: "var(--faint)", fontSize: ".84rem" }}
                      >
                        An invoice is created for the PSM team.
                      </div>
                    </div>
                  </div>
                  <div
                    style={{ display: "flex", gap: 11, alignItems: "center" }}
                  >
                    <span className="feed-ic">
                      <Ic name="i-check" />
                    </span>
                    <div>
                      <b>3. Paid</b>
                      <div
                        className="d"
                        style={{ color: "var(--faint)", fontSize: ".84rem" }}
                      >
                        We pay it to your account — within 7 days.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="card feed">
              <div className="prog-head">
                <h2>Recent commission</h2>
                <button className="btn ghost sm" onClick={() => go("refs")}>
                  View all
                </button>
              </div>
              {all.rows.length ? (
                all.rows.slice(0, 5).map((r) => (
                  <div className="feed-row" key={r.referred_advertiser_id}>
                    <span className="feed-ic">
                      <Ic name="i-trophy" />
                    </span>
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {r.referred_advertiser_name || "Advertiser"}
                      </div>
                      <div style={{ color: "var(--faint)", fontSize: ".83rem" }}>
                        {r.topup_count} top-ups · {eur(r.spend_eur)} spend
                      </div>
                    </div>
                    <span className="amt">+{eur(r.earnings_eur)}</span>
                  </div>
                ))
              ) : (
                <p className="cap" style={{ margin: "8px 0 0" }}>
                  No commission yet.
                </p>
              )}
            </div>
          </div>

          {/* NOTIFICATIONS */}
          <div className={`view${view === "notif" ? " on" : ""}`}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2>Notifications</h2>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div className="nrow">
                <span className="nic blue">
                  <Ic name="i-bell" />
                </span>
                <div>
                  <div className="t">You&apos;re all caught up</div>
                  <div className="d">
                    New referrals, commission and payout updates will appear
                    here.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SETTINGS */}
          <div className={`view${view === "set" ? " on" : ""}`}>
            <div className="grid">
              <div className="card">
                <h2>
                  <span
                    style={{
                      display: "inline-flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <Ic name="i-user" /> Profile
                  </span>
                </h2>
                <div style={{ marginTop: 16 }}>
                  <div className="field">
                    <label>Full name</label>
                    <input defaultValue={name} />
                  </div>
                  <div className="field">
                    <label>Email</label>
                    <input defaultValue={profile?.email ?? ""} disabled />
                  </div>
                  <div className="field">
                    <label>Show earnings in</label>
                    <div className="seg2">
                      <button
                        type="button"
                        className={showEurUsd === "EUR" ? "on" : ""}
                        onClick={() => setShowEurUsd("EUR")}
                      >
                        EUR €
                      </button>
                      <button
                        type="button"
                        className={showEurUsd === "USD" ? "on" : ""}
                        onClick={() => setShowEurUsd("USD")}
                      >
                        USD $
                      </button>
                    </div>
                  </div>
                  <button
                    className="btn sm"
                    onClick={() => toast.success("Profile saved")}
                  >
                    Save profile
                  </button>
                </div>
              </div>
              <div className="card">
                <h2>Notification preferences</h2>
                <p className="cap">Choose what pings you.</p>
                <NotifToggle label="New referral joined" desc="When someone signs up via your link" def />
                <NotifToggle label="Commission earned" desc="When a referral tops up" def />
                <NotifToggle label="Payout status" desc="When a payout is requested or paid" def />
                <NotifToggle label="Tier changes" desc="When you reach a new tier" />
              </div>
            </div>
            <div className="card">
              <h2>
                <span
                  style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
                >
                  <Ic name="i-card" /> Payout details
                </span>
              </h2>
              <p className="cap">
                Where we send your payouts. You pick which currency to use at
                each payout.
              </p>
              <div className="field">
                <label>Business / account holder</label>
                <input placeholder="Your company or name" />
              </div>
              <div className="frow">
                <div className="field">
                  <label>Account type</label>
                  <input placeholder="Business / Personal" />
                </div>
                <div className="field">
                  <label>VAT / Tax ID</label>
                  <input className="mono" placeholder="Optional" />
                </div>
              </div>
              <div className="field">
                <label>Billing address</label>
                <input placeholder="Street, city, country" />
              </div>
              <div className="subhead2">
                <Ic name="i-wallet" /> EUR bank (SEPA)
              </div>
              <div className="frow">
                <div className="field">
                  <label>IBAN</label>
                  <input className="mono" placeholder="NL00 BANK 0000 0000 00" />
                </div>
                <div className="field">
                  <label>BIC / SWIFT</label>
                  <input className="mono" placeholder="BANKNL2A" />
                </div>
              </div>
              <button
                className="btn sm"
                onClick={() => toast.success("Payout details saved")}
              >
                Save payout details
              </button>
            </div>
          </div>

          {/* HELP */}
          <div className={`view${view === "help" ? " on" : ""}`}>
            <div className="grid">
              <div className="card">
                <h2>How the affiliate program works</h2>
                <div className="faq" style={{ marginTop: 14 }}>
                  <div>
                    <div className="q">How do I earn?</div>
                    <div className="a">
                      Share your link. When an advertiser signs up through it,
                      they&apos;re linked to you. Your commission terms are
                      agreed per referral — a one-time bonus, a percentage of
                      their monthly fee, and/or a percentage of each ad-account
                      top-up.
                    </div>
                  </div>
                  <div>
                    <div className="q">When do I get paid?</div>
                    <div className="a">
                      Request a payout of your balance under Wallet; the PSM team
                      settles it to your account.
                    </div>
                  </div>
                  <div>
                    <div className="q">What are tiers?</div>
                    <div className="a">
                      Tiers track your <b>total lifetime earnings</b> (Bronze →
                      Platinum). Each threshold unlocks a one-time bonus. Your
                      commission rate is set per referral and doesn&apos;t change
                      with tier.
                    </div>
                  </div>
                </div>
              </div>
              <div className="card">
                <h2>Need a hand?</h2>
                <p className="cap">
                  Questions about a referral or a payout? We&apos;re here.
                </p>
                <button
                  className="btn"
                  style={{ width: "100%", justifyContent: "center" }}
                  onClick={() => toast.success("Opening email to your manager…")}
                >
                  <Ic name="i-mail" /> Contact your PSM manager
                </button>
              </div>
            </div>
          </div>
        </div>

        <nav className="bottombar">
          {BOTTOM.map((b) => (
            <button
              key={b.v + b.label}
              className={`bb${view === b.v ? " on" : ""}`}
              onClick={() => go(b.v)}
            >
              <span className="bbic">
                <Ic name={b.icon} />
              </span>
              {b.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Payout modal */}
      {payOpen && (
        <div className="modal">
          <div className="mback" onClick={() => setPayOpen(false)} />
          <div className="mcard">
            <div className="mhead">
              <h2>Request payout</h2>
              <button
                className="iconbtn"
                onClick={() => setPayOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="cap">
              Your balance: <b>{eur(all.totals.earnings_eur)}</b> in EUR +{" "}
              <b>{usd(all.totals.earnings_usd)}</b> in USD. Our team processes
              payouts manually.
            </p>
            <div className="mlabel">Payout currency</div>
            <div className="seg2">
              <button
                className={showEurUsd === "EUR" ? "on" : ""}
                onClick={() => setShowEurUsd("EUR")}
              >
                EUR €
              </button>
              <button
                className={showEurUsd === "USD" ? "on" : ""}
                onClick={() => setShowEurUsd("USD")}
              >
                USD $
              </button>
            </div>
            <button
              className="btn gold"
              style={{
                width: "100%",
                justifyContent: "center",
                marginTop: 12,
              }}
              onClick={() => {
                setPayOpen(false);
                toast.success("Payout requested — our team will process it.");
              }}
            >
              <Ic name="i-download" /> Request payout
            </button>
            <p className="mnote">Paid to your account within 7 days.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function NotifToggle({
  label,
  desc,
  def,
}: {
  label: string;
  desc: string;
  def?: boolean;
}) {
  const [on, setOn] = useState(!!def);
  return (
    <div className="toggle-row">
      <div>
        <div className="t">{label}</div>
        <div className="d">{desc}</div>
      </div>
      <button
        className={`sw${on ? " on" : ""}`}
        onClick={() => setOn((v) => !v)}
        aria-label={label}
      />
    </div>
  );
}
