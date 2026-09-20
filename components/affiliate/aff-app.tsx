"use client";

import PrivacyControls from "@/components/profile/privacy-controls";

import { copyText } from "@/lib/copy-text";
import { jakarta } from "@/lib/fonts";
import { signOutCompletely } from "@/lib/auth/sign-out";
import { useAppContext } from "@/context/app-provider";
import { csvSafe } from "@/lib/csv-safe";
import useAffiliateStats from "@/hooks/use-affiliate-stats";
import useUsdToEur from "@/hooks/use-usd-to-eur";
import useNotifications from "@/components/notifications/use-notifications";
import { getNotificationCopy } from "@/components/notifications/notification-utils";
import { getURL } from "@/lib/utils";
import { Parser } from "json2csv";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import { toast } from "sonner";
import { AFF_CSS } from "./aff-shell-css";
import { AffIcons, Ic } from "./aff-icons";
import PsmAvatar from "@/components/ui/psm-avatar";

// Support inbox for the "contact us" actions. Change here if it differs.
const SUPPORT_EMAIL = "contact@primescalemedia.com";

type View = "dash" | "refs" | "pay" | "notif" | "set" | "help";
const TITLES: Record<View, string> = {
  dash: "Dashboard",
  refs: "My Referrals",
  pay: "Wallet",
  notif: "Notifications",
  set: "Settings",
  help: "Get Help",
};

// Scaler ladder (chosen over bronze/silver/gold — sounds stronger). The `key`
// stays the original so the medal color classes (.thmedal.bronze/.silver/.plat)
// keep working; only the display name changes. Top tier = Legend.
const TIERS = [
  { key: "bronze", name: "Starter", min: 0 },
  { key: "silver", name: "Riser", min: 250 },
  { key: "gold", name: "Scaler", min: 1000 },
  { key: "plat", name: "Legend", min: 2500 },
];

// TWO DECIMALS. Math.round here meant the payout modal printed "still
// owed to you: EUR 1,250" and the button beside it mailed a request for
// EUR 1,249.55 — the handler defines its own exact() with a comment
// about "45 cents of invented money inside a payment instruction", and
// then the sentence above it rounded anyway. The advertiser app removed
// the same rounding from its balances for the same reason.
const money2 = (sym: string, n: number) =>
  sym +
  (Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const eur = (n: number) => money2("€", n);
const usd = (n: number) => money2("$", n);
/** Whole units, for the hero headline only — never for a payable. */
const eurWhole = (n: number) =>
  "€" + Math.round(Number(n) || 0).toLocaleString("en-US");

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

type RangeKey = "all" | "month" | "week" | "year";
const RANGE_LABELS: Record<RangeKey, string> = {
  all: "All time",
  month: "This month",
  week: "This week",
  year: "This year",
};
function rangeFromTo(k: RangeKey): { from?: string } {
  if (k === "all") return {};
  const d = new Date();
  if (k === "month") d.setDate(1);
  else if (k === "week") d.setDate(d.getDate() - d.getDay());
  else {
    d.setMonth(0);
    d.setDate(1);
  }
  return {
    from: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`,
  };
}

export default function AffiliateApp() {
  const { profile } = useAppContext();
  const [view, setView] = useState<View>("refs");
  const [navOpen, setNavOpen] = useState(false);
  const [showEurUsd, setShowEurUsd] = useState<"EUR" | "USD">("EUR");
  const [payOpen, setPayOpen] = useState(false);
  const payCardRef = useModalA11y<HTMLDivElement>(payOpen, () =>
    setPayOpen(false),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const name = (profile?.full_name as string) ?? "Affiliate";

  // Real referral book (all-time) + this-month slice for the topbar pill.
  const all = useAffiliateStats();
  const month = useAffiliateStats({ from: monthStartIso() });
  const {
    notifications: notifs,
    markAsRead,
    markAllAsRead,
    // "You're all caught up" over a read that FAILED is the worst kind of
    // reassurance: these carry commission and payout updates. The hook
    // exports isError for exactly this.
    isError: notifsError,
  } = useNotifications();

  const lifetimeEur = all.totals.earnings_eur;
  const monthEur = month.totals.earnings_eur;
  const lifetimeUsd = all.totals.earnings_usd;
  const monthUsd = month.totals.earnings_usd;
  const referredCount = all.rows.length;
  const activeCount = all.rows.filter((r) => Number(r.topup_count) > 0).length;

  // My Referrals date-range filter (the "All time" dropdown). Default "all"
  // dedupes with the all-time query above, so it adds no extra fetch.
  const [refsRange, setRefsRange] = useState<RangeKey>("all");
  const [rangeOpen, setRangeOpen] = useState(false);
  // Payout details. These were six uncontrolled inputs and the button sent a
  // hard-coded empty template, so everything typed — including the IBAN — was
  // silently thrown away. Held in state and interpolated into the mail body.
  const [payout, setPayout] = useState({
    holder: "",
    accountType: "",
    taxId: "",
    address: "",
    iban: "",
    bic: "",
  });
  const refs = useAffiliateStats(rangeFromTo(refsRange));
  const refsReferred = refs.rows.length;
  const refsActive = refs.rows.filter((r) => Number(r.topup_count) > 0).length;
  // The referral TABLE reports its own failure; the summary tiles above it
  // did not, so a failed read printed a commission of 0 directly above a
  // sentence saying the read failed.
  const refsUnavailable = refs.isError || refs.isLoading;

  // Tier progression counts BOTH currencies — a USD-paid affiliate was
  // otherwise stuck at Starter with €0 — but they are CONVERTED now rather
  // than added. `lifetimeEur + lifetimeUsd` is not a euro figure, and the
  // gap to the next tier was printed with a euro sign anyway: an affiliate
  // on $1,000 and €0 was shown a tier they had not reached and told
  // "€1,500 more".
  // The earnings read failed, or has not landed yet. Either way the totals
  // below are 0 because there is nothing to add up — not because nothing was
  // earned — so every screen that states a figure has to say so instead.
  const statsUnavailable = all.isError || all.isLoading;
  // The MONTH figures come from a second, separate query, and nothing
  // consulted its state — so the topbar pill, the stat card and the
  // earnings summary all printed "this month €0" identically whether the
  // affiliate earned nothing, the read had not landed, or it failed.
  const monthUnavailable = month.isError || month.isLoading;
  // A figure we cannot vouch for is a dash. An affiliate who has earned
  // money must never be shown a zero because a read failed — and must
  // never be DEMOTED by one either, which is what the tier track did.
  const dash = "—";

  // Without a rate the two cannot be put on one scale, and guessing parity
  // is the same bug wearing a confident face. The ladder then counts euros
  // only and SAYS so, rather than quietly inflating itself with dollars.
  const { rate: usdToEur } = useUsdToEur();
  const tierBlind = lifetimeUsd > 0 && !usdToEur;
  const lifetimeCombined = lifetimeEur + (usdToEur ? lifetimeUsd * usdToEur : 0);
  const tierIndex = useMemo(() => {
    let idx = 0;
    TIERS.forEach((t, i) => {
      if (lifetimeCombined >= t.min) idx = i;
    });
    return idx;
  }, [lifetimeCombined]);
  // TIERS[0] IS ALSO WHAT ZERO LOOKS LIKE.
  //
  // lifetimeCombined is 0 while the stats are loading OR have failed, so
  // tierIndex lands on 0 and every unguarded print said "Starter". A
  // Legend partner opening the app on a dropped read was demoted on the
  // sidebar, the toolbar pill and the account menu at once — while the
  // tier card itself correctly showed a dash. Everything that prints the
  // tier now asks statsUnavailable first.
  const tier = TIERS[tierIndex];
  const nextTier = TIERS[tierIndex + 1];
  const tierPct = nextTier
    ? Math.min(
        100,
        Math.round(
          ((lifetimeCombined - tier.min) / (nextTier.min - tier.min)) * 100,
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

  const router = useRouter();
  const logout = async () => {
    // Clears the session AND the httpOnly profile_id cookie — see
    // lib/auth/sign-out.ts for why the second half matters.
    await signOutCompletely();
    router.push("/auth/login");
  };

  // Close the account menu on outside-click / Escape.
  // Escape closes the navigation drawer, like every other overlay in the
  // shell. It was the one that ignored it, and it covers most of the screen.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Escape also closes the sign-out confirmation.
  useEffect(() => {
    if (!signOutOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSignOutOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [signOutOpen]);

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
      if (!(await copyText(referralLink))) throw new Error("copy refused");
      toast.success("Referral link copied.");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  const shareMessage = () =>
    `Join Prime Scale Media with my referral link: ${referralLink}`;

  const shareWhatsApp = () => {
    if (!referralLink) {
      toast.error("Your referral link isn't set up yet.");
      return;
    }
    window.open(
      `https://wa.me/?text=${encodeURIComponent(shareMessage())}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const shareEmail = () => {
    if (!referralLink) {
      toast.error("Your referral link isn't set up yet.");
      return;
    }
    const subject = encodeURIComponent("Join Prime Scale Media");
    const body = encodeURIComponent(shareMessage());
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const shareQr = async () => {
    // No QR renderer is bundled, so rather than fake a QR that never
    // appears, copy the link so it can be pasted into any QR generator.
    if (!referralLink) {
      toast.error("Your referral link isn't set up yet.");
      return;
    }
    try {
      if (!(await copyText(referralLink))) throw new Error("copy refused");
      toast.success("Link copied — paste it into any QR generator.");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  const exportReferrals = () => {
    if (!refs.rows.length) {
      toast.info("Nothing to export for this range.");
      return;
    }
    try {
      const flat = refs.rows.map((r) => ({
        Advertiser: csvSafe(r.referred_advertiser_name ?? ""),
        Code: csvSafe(r.referred_advertiser_code ?? ""),
        "Spend USD": Number(r.spend_usd) || 0,
        "Spend EUR": Number(r.spend_eur) || 0,
        "Top-ups": r.topup_count,
        "Earnings USD": Number(r.earnings_usd) || 0,
        "Earnings EUR": Number(r.earnings_eur) || 0,
      }));
      const csv = new Parser().parse(flat);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "my_referrals.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Export failed", {
        description: e instanceof Error ? e.message : undefined,
      });
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
          <div className="avatar">
            <PsmAvatar
              seed={profile?.id ?? name}
              name={name}
              email={profile?.email}
              role="affiliate"
              size={34}
            />
          </div>
          <div className="who">
            {name}
            <small>{statsUnavailable ? "Partner" : `${tier.name} partner`}</small>
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
                <b>{monthUnavailable ? dash : eur(monthEur)}</b>
              </span>
            </button>
            <span className="tdiv" />
            <button
              className="tool tier2"
              onClick={() => go("refs")}
              title="Your tier"
            >
              <Ic name="i-trophy" /> {statsUnavailable ? dash : tier.name}
            </button>
            <span className="tdiv" />
            <button
              className="tool ic-btn"
              onClick={() => go("notif")}
              aria-label="Notifications"
            >
              <Ic name="i-bell" />
              {notifs.filter((n) => !n.is_read).length > 0 && (
                <span className="badge-n">
                  {notifs.filter((n) => !n.is_read).length}
                </span>
              )}
            </button>
            <div className="usermenu" ref={menuRef}>
              <button
                className="tool ava-btn"
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title="Account"
              >
                <span className="avatar">
            <PsmAvatar
              seed={profile?.id ?? name}
              name={name}
              email={profile?.email}
              role="affiliate"
              size={34}
            />
          </span>
                <Ic name="i-chev" />
              </button>
              {menuOpen && (
                <div className="umenu" role="menu">
                  <div className="umenu-hd">
                    {/* The avatar comes with you into the menu, so the panel
                        is visibly the tile it opened from. */}
                    <span className="umenu-av">
                      {/* THE SAME PICTURE AS EVERYWHERE ELSE.
                          This tile still drew initials while the
                          sidebar and the toolbar a few pixels away
                          drew the generated avatar — so one person
                          had three different faces on one screen,
                          which is the exact thing a deterministic
                          avatar exists to prevent. */}
                      <PsmAvatar
                        seed={profile?.id ?? name}
                        name={name}
                        email={profile?.email}
                        role="affiliate"
                        size={34}
                      />
                    </span>
                    <span className="umenu-who">
                      <span className="nm">{name}</span>
                      <span className="sub">{statsUnavailable ? "Partner" : `${tier.name} partner`}</span>
                    </span>
                  </div>
                  <button
                    className="umenu-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      go("set");
                    }}
                  >
                    <Ic name="i-user" /> Profile
                  </button>
                  <button
                    className="umenu-item danger"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setSignOutOpen(true);
                    }}
                  >
                    <LogoutGlyph /> Sign out
                  </button>
                </div>
              )}
            </div>
            <button
              className="tool ic-btn"
              onClick={() => setSignOutOpen(true)}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogoutGlyph />
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
                {/* When the stats read fails, `rows` is [] and every total
                    reduces to 0 — so this hero told an affiliate they had
                    earned nothing, referred nobody and had nobody active,
                    and the tier calculation below demoted them to Starter.
                    All from a dropped connection. That is the single worst
                    screen in the app to be confidently wrong on, because it
                    is the one an affiliate opens to see what they are owed. */}
                {statsUnavailable ? (
                  <>
                    <h1 className="jackpot">
                      <span className="cur">€</span>—
                    </h1>
                    <p className="eyebrow" style={{ opacity: 0.9 }}>
                      We couldn&apos;t load your earnings just now. This is NOT
                      a zero — pull down to retry.
                    </p>
                  </>
                ) : (
                  <>
                    <h1 className="jackpot" onClick={() => go("pay")}>
                      <span className="cur">€</span>
                      {/* Whole units here and only here: this is the
                          lifetime headline, not a figure anyone acts on. */}
                      {eurWhole(lifetimeEur).replace("€", "")}
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
                  </>
                )}
              </div>
            </section>
            <div className="stats">
              <div className="stat" onClick={() => go("pay")}>
                <div className="k">
                  <Ic name="i-trophy" /> Lifetime
                </div>
                <div className="v gold">
                  {statsUnavailable ? (
                    dash
                  ) : (
                    <>
                      {eur(lifetimeEur)}
                      {lifetimeUsd > 0 && (
                        <span style={{ fontSize: ".6em", opacity: 0.8 }}>
                          {" "}
                          · {usd(lifetimeUsd)}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="stat" onClick={() => go("pay")}>
                <div className="k">
                  <Ic name="i-trend" /> This month
                </div>
                <div className="v win">
                  {monthUnavailable ? (
                    dash
                  ) : (
                    <>
                      {eur(monthEur)}
                      {monthUsd > 0 && (
                        <span style={{ fontSize: ".6em", opacity: 0.8 }}>
                          {" "}
                          · {usd(monthUsd)}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="stat" onClick={() => go("refs")}>
                <div className="k">
                  <Ic name="i-users" /> Referred
                </div>
                <div className="v blue">
                  {statsUnavailable ? dash : referredCount}
                </div>
              </div>
              <div className="stat" onClick={() => go("refs")}>
                <div className="k">
                  <Ic name="i-trend" /> Spend driven
                </div>
                <div className="v gold">
                  {statsUnavailable ? dash : eur(all.totals.spend_eur)}
                </div>
              </div>
            </div>
            <div className="invite">
              <h2>
                <Ic name="i-gift" /> Share your link
              </h2>
              <p className="cap">
                {/* ── ONE MECHANISM, NOT THREE ────────────────────────
                    The only accrual in the database fires on a WALLET
                    top-up and pays a percentage of it. There is no
                    one-time accrual and no monthly-fee accrual anywhere;
                    a referral set to either of those earns nothing, for
                    ever, with no error. The admin-side helper says this
                    plainly to the admin. The affiliate's own screen said
                    the opposite. */}
                Advertisers who join through your link are linked to you. You
                earn a percentage of every wallet top-up they make. The rate
                is agreed per referral.
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
                <button className="btn ghost" onClick={shareWhatsApp}>
                  <Ic name="i-msg" /> WhatsApp
                </button>
                <button className="btn ghost" onClick={shareEmail}>
                  <Ic name="i-mail" /> Email
                </button>
                <button className="btn ghost" onClick={shareQr}>
                  <Ic name="i-qr" /> Copy for QR
                </button>
              </div>
            </div>
          </div>

          {/* MY REFERRALS */}
          <div className={`view${view === "refs" ? " on" : ""}`}>
            <div className="filterbar">
              <div className="ddwrap">
                <button
                  className={`dd${rangeOpen ? " open" : ""}`}
                  onClick={() => setRangeOpen((o) => !o)}
                >
                  <Ic name="i-calendar" /> {RANGE_LABELS[refsRange]}{" "}
                  <Ic name="i-chev" className="ic ddchev" />
                </button>
                {rangeOpen && (
                  <div className="ddmenu">
                    {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
                      <button
                        key={k}
                        className={k === refsRange ? "on" : ""}
                        onClick={() => {
                          setRefsRange(k);
                          setRangeOpen(false);
                        }}
                      >
                        {RANGE_LABELS[k]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="dd expbtn" onClick={exportReferrals}>
                <Ic name="i-download" /> Export (current range)
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
                <div className="n">
                  {refsUnavailable ? dash : refsReferred}
                </div>
              </div>
              <div className="c">
                <div className="l">
                  <span className="ci t">
                    <Ic name="i-trend" />
                  </span>{" "}
                  Active
                </div>
                <div className="n">
                  {refsUnavailable ? dash : refsActive}{" "}
                  <span
                    style={{
                      fontWeight: 500,
                      color: "var(--faint)",
                      fontSize: ".8rem",
                    }}
                  >
                    of {refsReferred}
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
                <div className="n">
                  {refsUnavailable ? dash : eur(refs.totals.spend_eur)}
                </div>
              </div>
              <div className="c">
                <div className="l">
                  <span className="ci g">
                    <Ic name="i-trophy" />
                  </span>{" "}
                  Your commission
                </div>
                {/* The only one of the four tiles not guarded, so a
                    failed read printed a confident green EUR 0 for "Your
                    commission" beside three dashes. The one figure on this
                    row an affiliate actually opens the page for. */}
                <div className="n win">
                  {refsUnavailable ? dash : eur(refs.totals.earnings_eur)}
                </div>
              </div>
            </div>

            <div className="grid">
              <div className="card" style={{ padding: "18px 20px" }}>
                <div className="prog-head">
                  <h2>Earnings summary</h2>
                  {/* monthEur is a SEPARATE query from the rest of this
                      card, so it needs its own guard — the topbar already
                      uses monthUnavailable and this did not, which meant the
                      one case where only the month read failed printed a
                      confident EUR 0 / mo. */}
                  <b style={{ color: "var(--win)" }}>
                    {monthUnavailable ? dash : eur(monthEur)} / mo
                  </b>
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
                        {statsUnavailable
                          ? "We couldn't read your referrals"
                          : `Across ${referredCount} referrals`}
                      </div>
                    </div>
                    <span className="amt">
                      {statsUnavailable ? dash : eur(lifetimeEur)}
                    </span>
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
                      {statsUnavailable ? dash : eur(all.totals.spend_eur)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="prog-head">
                  <h2>Your tier</h2>
                  {/* Not a tier number we cannot vouch for. On a failed
                      read lifetimeCombined is 0, which puts the medal back
                      to Starter, resets the track to 0% and tells the
                      affiliate how much MORE they need to reach a tier they
                      may already be past. The hero above was fixed for this
                      exact demotion; the tier card was not. */}
                  <span className="ratepill">
                    {statsUnavailable
                      ? "Checking…"
                      : `Tier ${tierIndex + 1} / ${TIERS.length}`}
                  </span>
                </div>
                <div className="tierhero">
                  {/* The label beside it is guarded; the colour was not,
                      so the medal went bronze under the words "Your tier"
                      and told the same lie in the one channel that reads
                      fastest. `unknown` has no colour rule, so it falls to
                      the neutral default. */}
                  <div className={`thmedal ${statsUnavailable ? "unknown" : tier.key}`}>
                    <Ic name="i-medal" />
                  </div>
                  <div className="thinfo">
                    <div className="thname">
                      {statsUnavailable ? "Your tier" : tier.name}
                    </div>
                    <div className="thsub">
                      {statsUnavailable
                        ? "We couldn't read your earnings just now — this is not a reset."
                        : `You're a ${tier.name} partner`}
                    </div>
                  </div>
                </div>
                {/* The card contradicted itself: the line above says "we
                    couldn't read your earnings just now — this is not a
                    reset", and then a bar sat at 0% under a sentence saying
                    how much more was needed, both computed from the
                    earnings that had just been disclaimed. When the figure
                    is unknown the progress is unknown too. */}
                {statsUnavailable ? null : (
                  <>
                    <div className="track">
                      <div className="fill" style={{ width: `${tierPct}%` }} />
                    </div>
                    <p className="tiernote">
                      {/* When the USD side could not be converted the ladder
                          is counting euros only, and saying so is the
                          difference between a motivating target and a wrong
                          one. */}
                      {tierBlind ? (
                        <>
                          Your USD earnings aren&apos;t counted here yet — we
                          couldn&apos;t read today&apos;s rate. This shows
                          your EUR progress only.
                        </>
                      ) : nextTier ? (
                        <>
                          {eur(nextTier.min - lifetimeCombined)} more in
                          lifetime earnings to reach{" "}
                          <b className="gold">{nextTier.name}</b>.
                        </>
                      ) : (
                        <>
                          You&apos;ve reached the top tier —{" "}
                          <b className="plat">{tier.name}</b>. 🎉
                        </>
                      )}
                    </p>
                  </>
                )}
                <p className="tierlegend">
                  Your <b>lifetime earnings</b> move you up the tiers. Your
                  commission rate stays whatever was agreed per referral.
                </p>
              </div>
            </div>

            <div className="refhead">
              <h2>
                Your referrals{" "}
                <span className="muted2">· {refsActive} active</span>
              </h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {refs.rows.length ? (
                refs.rows.map((r) => (
                  <div className="rrow" key={r.referred_advertiser_id}>
                    {/* Track list lives in aff-shell-css.ts, NOT inline: an
                        inline declaration outranks the ≤900px media query, so
                        the phone layout never applied and the Commission
                        column was clipped off the right edge of every phone —
                        on the affiliate's default screen. */}
                    <div className="rhead">
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
              ) : refs.isLoading ? (
                <div className="card">
                  <p className="cap" style={{ margin: 0 }}>
                    Loading your referrals…
                  </p>
                </div>
              ) : refs.isError ? (
                <div className="card">
                  <p className="cap" style={{ margin: 0 }}>
                    Couldn&apos;t load your referrals.{" "}
                    <button
                      type="button"
                      className="lnk"
                      style={{
                        background: "none",
                        border: 0,
                        padding: 0,
                        cursor: "pointer",
                      }}
                      onClick={() => refs.refetch()}
                    >
                      Retry
                    </button>
                  </p>
                </div>
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
                  {/* Guarded like every other tier print on this screen.
                      tierIndex falls to 0 whenever lifetimeCombined is 0,
                      which is true while the earnings query is loading AND
                      when it has failed — so a Legend partner opened their
                      wallet and the badge beside their real balance read
                      "Starter", while the header badge and the tier card,
                      reading the same state, correctly said "Checking…".
                      A demotion is not something to render on a guess. */}
                  <span className="btag ghost2">
                    <Ic name="i-trophy" /> {statsUnavailable ? "—" : tier.name}
                  </span>
                </div>
                {/* ── STILL OWED, NOT EARNED EVER ────────────────────
                    This card is headed "Commission wallet" and printed
                    LIFETIME GROSS — so an affiliate paid EUR 600 of EUR
                    1,000 read EUR 1,000.00 here and EUR 400.00 in the
                    payout modal one tap away, with neither figure
                    derivable from the other on screen. A wallet says
                    what is in it. The hook already computes `payable`
                    for exactly this and it was used only in the modal;
                    lifetime keeps its own line underneath. */}
                <div className="l">Still owed to you</div>
                <div className="bpots">
                  {/* The button below is already disabled when the balance
                      is unknown, for exactly this reason — but the two
                      figures it is disabled ABOUT were printed as a
                      confident EUR 0 and $0. */}
                  <div className="bpot">
                    <span className="pl">EUR</span>
                    <b>{statsUnavailable ? dash : eur(all.payable.eur)}</b>
                    <small className="pn">
                      {statsUnavailable
                        ? ""
                        : `${eur(all.totals.earnings_eur)} earned in total`}
                    </small>
                  </div>
                  <div className="bpot">
                    <span className="pl">USD</span>
                    <b>{statsUnavailable ? dash : usd(all.payable.usd)}</b>
                    <small className="pn">
                      {statsUnavailable
                        ? ""
                        : `${usd(all.totals.earnings_usd)} earned in total`}
                    </small>
                  </div>
                </div>
                <div className="sub">
                  Payouts are processed manually by the PSM team — request one
                  and we settle it to your account.
                </div>
                <div className="bactions">
                  {/* Disabled while the balance is unknown. The payout mail
                      is composed from these totals, so with a failed read it
                      would have sent a request for €0 — a message that
                      cannot be acted on and looks, to whoever receives it,
                      like the affiliate is owed nothing. */}
                  <button
                    className="btn gold"
                    // A EUR 0.00 request cannot be acted on and reads, to
                    // whoever receives it, like the affiliate is owed
                    // nothing — which the comment above already says. The
                    // button was guarded on the stats being readable and
                    // not on there being anything to ask for.
                    disabled={
                      statsUnavailable ||
                      (all.payable.eur <= 0 && all.payable.usd <= 0)
                    }
                    title={
                      statsUnavailable
                        ? "Your balance couldn't be loaded — reload before requesting a payout."
                        : all.payable.eur <= 0 && all.payable.usd <= 0
                          ? "Nothing outstanding to request yet"
                          : "Request a payout"
                    }
                    onClick={() => setPayOpen(true)}
                  >
                    <Ic name="i-download" /> Request payout
                  </button>
                  {/* Same reason as the note on the request button: no
                      timer exists anywhere in the code. */}
                  <span className="payin">
                    <Ic name="i-clock" /> Paid by hand
                  </span>
                </div>
              </div>
              <div className="card">
                <h2>How payouts work</h2>
                <p className="cap">
                  Your wallet holds the commission you&apos;ve earned.
                  Requesting a payout sends us an email; we check the
                  balance, confirm the details with you and pay it out by
                  hand. Payouts are always manual — nothing leaves
                  automatically.
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
                      {/* No invoice is created. There is no commission
                          invoice type, no cron that raises one, and
                          settlement is an admin marking the commission
                          paid. The pill and the paragraph above were
                          corrected; this list, sixty lines down, still
                          described a process that does not exist. */}
                      <b>2. We check it</b>
                      <div
                        className="d"
                        style={{ color: "var(--faint)", fontSize: ".84rem" }}
                      >
                        We confirm the balance and the payment details with
                        you.
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
                        We pay it to your account by hand. Nothing in the
                        app moves it automatically.
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
              ) : statsUnavailable ? (
                /* NOT "no commission yet" — the list is empty because the
                   read failed, and on an affiliate's own screen that
                   sentence means "you have earned nothing". */
                <p className="cap" style={{ margin: "8px 0 0" }}>
                  We couldn&apos;t read your commission just now. This is not
                  a zero — reload to try again.
                </p>
              ) : (
                <p className="cap" style={{ margin: "8px 0 0" }}>
                  No commission yet.
                </p>
              )}
            </div>
          </div>

          {/* NOTIFICATIONS */}
          <div className={`view${view === "notif" ? " on" : ""}`}>
            {/* No <h2> here — the topbar already shows "Notifications"
                (TITLES.notif); a section heading would duplicate it. */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                minHeight: 4,
              }}
            >
              {notifs.some((n) => !n.is_read) && (
                <button
                  className="btn ghost sm"
                  onClick={() => markAllAsRead.mutate()}
                >
                  Mark all read
                </button>
              )}
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              {notifs.length ? (
                notifs.map((n) => {
                  const copy = getNotificationCopy(n);
                  return (
                    <div
                      key={n.id}
                      className={`nrow${n.is_read ? "" : " unread"}`}
                      style={{ cursor: n.is_read ? "default" : "pointer" }}
                      onClick={() => !n.is_read && markAsRead.mutate(n.id)}
                    >
                      <span className="nic blue">
                        <Ic name="i-bell" />
                      </span>
                      <div>
                        <div className="t">{copy.title}</div>
                        <div className="d">{copy.description}</div>
                      </div>
                      <span className="tm">
                        {new Date(n.created_at).toLocaleDateString()}
                      </span>
                      {!n.is_read && <span className="undot" />}
                    </div>
                  );
                })
              ) : (
                <div className="nrow">
                  <span className="nic blue">
                    <Ic name="i-bell" />
                  </span>
                  <div>
                    <div className="t">
                      {notifsError
                        ? "We couldn't load your notifications"
                        : "You're all caught up"}
                    </div>
                    <div className="d">
                      {notifsError
                        ? "This is not an empty list — reload to try again."
                        : "New referrals, commission and payout updates will appear here."}
                    </div>
                  </div>
                </div>
              )}
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
                    <input defaultValue={name} disabled />
                  </div>
                  <div className="field">
                    <label>Email</label>
                    <input defaultValue={profile?.email ?? ""} disabled />
                  </div>
                  <div className="field">
                    {/* IT DOES NOT CHANGE A DISPLAYED FIGURE. Every earnings
                        number on this app shows EUR and USD separately;
                        this choice is read in exactly one place — the
                        currency of the payout request. So it is named after
                        what it does. A control that says one thing and does
                        another is worse than no control. */}
                    <label>Request payouts in</label>
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
                </div>
              </div>
              <div className="card">
                <h2>Notification preferences</h2>
                {/* THESE ALERTS ARE NOT SENT YET. There is a real
                    per-type preference system in this app
                    (notification_preferences + the push route), but its
                    catalog has no affiliate entries and nothing emits
                    them — so wiring these switches to the server would be
                    exactly as fake as the localStorage they write to now,
                    with a more convincing face on it.
                    The choice is kept for when the alerts exist; the
                    sentence says that plainly instead of implying four
                    working switches. */}
                <p className="cap">
                  Choose what pings you. These alerts aren&apos;t being sent
                  yet — your choices are saved for when they are.
                </p>
                <NotifToggle label="New referral joined" desc="When someone signs up via your link" storeKey="new-referral" def />
                <NotifToggle label="Commission earned" desc="When a referral tops up" storeKey="commission" def />
                <NotifToggle label="Payout status" desc="When a payout is requested or paid" storeKey="payout" def />
                <NotifToggle label="Tier changes" desc="When you reach a new tier" storeKey="tier" />
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
                <label htmlFor="po-holder">Business / account holder</label>
                <input
                  id="po-holder"
                  value={payout.holder}
                  onChange={(e) =>
                    setPayout({ ...payout, holder: e.target.value })
                  }
                  placeholder="Your company or name"
                />
              </div>
              <div className="frow">
                <div className="field">
                  <label htmlFor="po-type">Account type</label>
                  <input
                    id="po-type"
                    value={payout.accountType}
                    onChange={(e) =>
                      setPayout({ ...payout, accountType: e.target.value })
                    }
                    placeholder="Business / Personal"
                  />
                </div>
                <div className="field">
                  <label htmlFor="po-tax">VAT / Tax ID</label>
                  <input
                    id="po-tax"
                    className="mono"
                    value={payout.taxId}
                    onChange={(e) =>
                      setPayout({ ...payout, taxId: e.target.value })
                    }
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="po-addr">Billing address</label>
                <input
                  id="po-addr"
                  value={payout.address}
                  onChange={(e) =>
                    setPayout({ ...payout, address: e.target.value })
                  }
                  placeholder="Street, city, country"
                />
              </div>
              <div className="subhead2">
                <Ic name="i-wallet" /> EUR bank (SEPA)
              </div>
              <div className="frow">
                <div className="field">
                  <label htmlFor="po-iban">IBAN</label>
                  <input
                    id="po-iban"
                    className="mono"
                    value={payout.iban}
                    onChange={(e) =>
                      setPayout({ ...payout, iban: e.target.value })
                    }
                    placeholder="NL00 BANK 0000 0000 00"
                  />
                </div>
                <div className="field">
                  <label htmlFor="po-bic">BIC / SWIFT</label>
                  <input
                    id="po-bic"
                    className="mono"
                    value={payout.bic}
                    onChange={(e) =>
                      setPayout({ ...payout, bic: e.target.value })
                    }
                    placeholder="BANKNL2A"
                  />
                </div>
              </div>
              <button
                className="btn sm"
                onClick={() => {
                  const line = (label: string, v: string) =>
                    `${label}: ${v.trim() || "—"}`;
                  window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                    "Payout details setup",
                  )}&body=${encodeURIComponent(
                    [
                      "Hi PSM team, here are my payout details:",
                      "",
                      line("Account holder", payout.holder),
                      line("Account type", payout.accountType),
                      line("IBAN", payout.iban),
                      line("BIC / SWIFT", payout.bic),
                      line("Billing address", payout.address),
                      line("VAT / Tax ID", payout.taxId),
                    ].join("\n"),
                  )}`;
                }}
              >
                Email payout details to set up
              </button>
              <p className="cap" style={{ marginTop: 8 }}>
                This opens an email with what you typed above — nothing is
                stored until we confirm it.
              </p>
            </div>
            {/* -- GDPR, WHERE THE CUSTOMER CAN ACTUALLY REACH IT ------
                These two controls - download my data (art. 20) and
                request erasure (art. 17) - were mounted on /profile and
                nowhere else, and /profile now bounces every customer to
                their own shell. So the right to export and the right to
                be forgotten were both unreachable for the only people
                who have them, while /help still told them to go to
                Profile. Same component, mounted where they land. */}
            <div className="card">
              <h2>Your data</h2>
              <p className="cap" style={{ margin: "0 0 12px" }}>
                Take a copy of everything we hold about you, sign out
                everywhere, or ask us to delete your account.
              </p>
              <PrivacyControls />
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
                      they&apos;re linked to you, and you earn a percentage of
                      every wallet top-up they make. The rate is agreed per
                      referral.
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
                      Tiers track your <b>total lifetime earnings</b> (Starter →
                      Riser → Scaler → Legend). Your commission rate is set per
                      referral and doesn&apos;t change with tier.
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
                  onClick={() => {
                    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                      "Affiliate question",
                    )}`;
                  }}
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
          {/* Escape closes it, Tab stays inside it, and focus goes back to
              the button that opened it. Without those three a dialog is a
              box drawn on top of a page that is still fully usable behind
              it. */}
          <div
            className="mcard"
            ref={payCardRef}
            role="dialog"
            aria-modal="true"
            aria-label="Request payout"
            tabIndex={-1}
          >
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
              {/* WHAT IS STILL OWED, not what was ever earned.
                  This read earnings_*, which is lifetime gross — so an
                  affiliate already paid EUR 500 saw EUR 500 here and the
                  email below asked for it a second time, indistinguishable
                  from a first request on both sides. The RPC has reported
                  unpaid_* since migration 20260918160000 and nothing had
                  ever read it. Where the RPC does not report it the figure
                  falls back to lifetime and says so, rather than implying
                  a precision it does not have. */}
              {all.payable.isLifetime ? "Earned to date" : "Still owed to you"}:{" "}
              <b>{eur(all.payable.eur)}</b> in EUR +{" "}
              <b>{usd(all.payable.usd)}</b> in USD.{" "}
              {all.payable.isLifetime
                ? "That is everything you have earned, not what is outstanding — we'll confirm the exact figure."
                : "Our team processes payouts manually."}
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
                // Payouts are processed manually — actually deliver the
                // request to the team (a prefilled email) instead of a
                // toast that persists nothing and notifies nobody.
                // Two decimals, NOT the rounding helper the hero uses.
                // eur()/usd() are Math.round for display — fine on a big
                // number, not fine in a sentence somebody pays from:
                // €1,249.55 became "€1,250", which is 45 cents of invented
                // money inside a payment instruction.
                const exact = (n: number) =>
                  (Number(n) || 0).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  });
                // The outstanding figure, matching the line above. Asking
                // for lifetime gross means asking for money already paid.
                const amount =
                  showEurUsd === "EUR"
                    ? `€${exact(all.payable.eur)}`
                    : `$${exact(all.payable.usd)}`;
                const subject = encodeURIComponent(
                  `Payout request — ${amount} (${showEurUsd})`,
                );
                const body = encodeURIComponent(
                  `Hi PSM team,\n\nI'd like to request a payout of ${amount} in ${showEurUsd}.\n\n` +
                    `Affiliate: ${name}${profile?.email ? ` (${profile.email})` : ""}\n` +
                    // Which basis the figure came from, so whoever reads
                    // it knows whether to check it against the ledger
                    // before paying.
                    `Basis: ${
                      all.payable.isLifetime
                        ? "lifetime earned - outstanding figure unavailable, please verify"
                        : "outstanding, already net of anything paid"
                    }\n\nThank you.`,
                );
                window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
                setPayOpen(false);
                toast.success("Opening your email to send the payout request.");
              }}
            >
              <Ic name="i-download" /> Request payout
            </button>
            {/* SAY WHAT ACTUALLY HAPPENS. The button's entire effect is
                window.location.href = mailto:… — it opens an email. It
                writes no record, creates no invoice and starts no clock,
                and on a desktop with no mail handler the navigation is
                silent. "Paid to your account within 7 days" is a promise
                nothing in this codebase keeps, printed directly under the
                control that is supposed to keep it. */}
            <p className="mnote">
              This opens an email to us. We reply with the payout details
              once we have checked the balance.
            </p>
          </div>
        </div>
      )}

      {/* Sign-out confirmation */}
      {signOutOpen && (
        <div className="modal">
          <div className="mback" onClick={() => setSignOutOpen(false)} />
          <div className="mcard" style={{ width: "min(400px,100%)" }}>
            <div className="mhead">
              <h2>Sign out?</h2>
              <button
                className="iconbtn"
                onClick={() => setSignOutOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="cap">You&apos;ll need to log in again.</p>
            <div className="mfoot">
              <button
                className="btn ghost"
                onClick={() => setSignOutOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn"
                onClick={() => {
                  setSignOutOpen(false);
                  logout();
                }}
              >
                <LogoutGlyph /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Small logout glyph reused by the account menu + sign-out modal.
function LogoutGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  );
}

function NotifToggle({
  label,
  desc,
  storeKey,
  def,
}: {
  label: string;
  desc: string;
  storeKey: string;
  def?: boolean;
}) {
  // Affiliates have no server-side notification types yet, so the choice
  // is remembered per-device rather than lost on reload.
  const [on, setOn] = useState(!!def);
  useEffect(() => {
    try {
      const v = localStorage.getItem(`aff-notif-${storeKey}`);
      if (v !== null) setOn(v === "1");
    } catch {}
  }, [storeKey]);
  const toggle = () =>
    setOn((v) => {
      const next = !v;
      try {
        localStorage.setItem(`aff-notif-${storeKey}`, next ? "1" : "0");
      } catch {}
      return next;
    });
  return (
    <div className="toggle-row">
      <div>
        <div className="t">{label}</div>
        <div className="d">{desc}</div>
      </div>
      <button
        className={`sw${on ? " on" : ""}`}
        onClick={toggle}
        aria-label={label}
      />
    </div>
  );
}
