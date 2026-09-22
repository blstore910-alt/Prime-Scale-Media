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
import { openWhatsapp } from "@/lib/whatsapp";
import WhatsappIcon from "@/components/psm/whatsapp-icon";
import PsmAvatar from "@/components/ui/psm-avatar";
import { downloadCsv } from "@/lib/download-blob";
import { isCustomerVisibleType } from "@/lib/notification-catalog";

// Support inbox for the "contact us" actions. Change here if it differs.
// Every "contact us" action is WhatsApp now -- see lib/whatsapp.ts.

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
/**
 * Both legs, or the one that exists.
 *
 * The advertiser-as-affiliate view has had this since it was written
 * (adv-app's twoLeg). This shell did not, so five figures printed the
 * EUR leg only -- including "Your commission", which is the headline of
 * My Referrals and the one number an affiliate opens the page for.
 *
 * An affiliate paid entirely in USD therefore read "Your commission
 * EUR 0.00", "+EUR 0.00" in Recent commission, and "USD 1,400.00" in
 * the commission wallet -- three answers on one screen. Their own CSV
 * export carries both columns, so the file contradicted the page it
 * came from.
 *
 * Never added: EUR + USD is not a euro figure and there is no rate here.
 */
const twoLeg = (e: number, u: number): string => {
  const eNum = Number(e) || 0;
  const uNum = Number(u) || 0;
  if (eNum && uNum) return `${eur(eNum)} · ${usd(uNum)}`;
  if (uNum) return usd(uNum);
  return eur(eNum);
};
/** Whole units, for the hero headline only — never for a payable. */
const eurWhole = (n: number) =>
  "€" + Math.round(Number(n) || 0).toLocaleString("en-US");
const usdWhole = (n: number) =>
  "$" + Math.round(Number(n) || 0).toLocaleString("en-US");

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

  // ── THE URL DECIDES THE FIRST VIEW ────────────────────────────────
  //
  // This app read no search param at all, so the three redirects that
  // exist to send an affiliate to their own Help, Notifications or
  // Profile -- customer-shell-redirect sends ?view=help / notif /
  // settings -- all landed on My Referrals, and those three views were
  // unreachable by any link.
  //
  // window.location rather than useSearchParams, for the reason the
  // advertiser shell gives: useSearchParams drags a Suspense
  // requirement into a page that does not otherwise need one.
  //
  // Object.hasOwn, NOT `in`: the `in` operator walks the prototype
  // chain, so ?view=__proto__ would make TITLES[view] evaluate to
  // Object.prototype, which React refuses to render.
  //
  // "settings" is what the redirect sends and "set" is what this app
  // calls the view, so that one is mapped rather than matched.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const wanted = new URLSearchParams(window.location.search).get("view");
    if (!wanted) return;
    if (wanted === "settings") {
      setView("set");
      return;
    }
    if (Object.hasOwn(TITLES, wanted)) setView(wanted as View);
    // Mount only. Later changes come from go(), which owns the URL.
  }, []);
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
    notifications: rawNotifs,
    markAsRead,
    markAllAsRead,
    // "You're all caught up" over a read that FAILED is the worst kind of
    // reassurance: these carry commission and payout updates. The hook
    // exports isError for exactly this.
    isError: notifsError,
    // ── AND "ALL CAUGHT UP" OVER A READ STILL IN FLIGHT ─────────────
    //
    // The rule above was applied to isError only, so the LOADING state
    // and the genuinely-empty state rendered identically: the moment
    // the screen opened it said "You're all caught up. New referrals,
    // commission and payout updates will appear here." over a list that
    // had not arrived. The hook returns isLoading too.
    isLoading: notifsLoading,
    // Counted server-side so the badge stays honest past the 50-row cap.
    unreadCount,
    countError: notifsCountError,
  } = useNotifications();
  // ── A SECOND LINE OF DEFENCE, WHERE IT IS DRAWN ───────────────────
  //
  // getNotificationCopy prints payload.summary verbatim for
  // supplier_pool_changed, and its own comment gives the format as
  // "... · seamx-9001: active → suspended" -- the supplier's name and
  // their account ids. It is rendered by both customer shells, and the
  // push route switches on `type` alone. Until now the ONLY thing
  // keeping that off a customer's screen was the two insert sites
  // picking their recipients correctly; one mis-addressed row put it
  // here and, because the GDPR export copies notifications.payload out
  // whole, into their download as well.
  const notifs = (rawNotifs ?? []).filter((n) =>
    isCustomerVisibleType((n as { type?: string | null })?.type),
  );


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
  // And when the account has no advertiser row the RPC answers with an
  // empty list and no error (see portalInert below) -- F1 folded that into
  // the Dashboard figures and missed this screen, which printed
  // "Referrals 0 · EUR 0,00 commission" and "No referrals yet".
  const refsUnavailable =
    refs.isError || refs.isLoading || !profile?.advertiser?.[0]?.id;

  // Tier progression counts BOTH currencies — a USD-paid affiliate was
  // otherwise stuck at Starter with €0 — but they are CONVERTED now rather
  // than added. `lifetimeEur + lifetimeUsd` is not a euro figure, and the
  // gap to the next tier was printed with a euro sign anyway: an affiliate
  // on $1,000 and €0 was shown a tier they had not reached and told
  // "€1,500 more".
  // The earnings read failed, or has not landed yet. Either way the totals
  // below are 0 because there is nothing to add up — not because nothing was
  // earned — so every screen that states a figure has to say so instead.
  // ── AND A THIRD REASON THE TOTALS ARE 0: THE RPC CANNOT ANSWER ───
  //
  // Measured on production 2026-09-21: two real profiles hold role
  // `affiliate`, and a role-`affiliate` profile never gets an
  // `advertisers` row (the wallet bootstrap returns early for any role
  // but `advertiser`). `affiliate_referral_stats` resolves the caller
  // with `select a.id from advertisers where a.user_id = auth.uid()`
  // and returns with NO rows and NO error when that misses.
  //
  // So every guard below saw a successful, empty read and printed a
  // confident zero: €0 lifetime, 0 referred, "No referrals yet", "No
  // commission yet", and a Request-payout button disabled with
  // "Nothing outstanding to request yet". None of it was true — the
  // question was never asked. A dash and a sentence, not six zeros.
  const portalInert = !profile?.advertiser?.[0]?.id;
  const statsUnavailable = all.isError || all.isLoading || portalInert;
  // The MONTH figures come from a second, separate query, and nothing
  // consulted its state — so the topbar pill, the stat card and the
  // earnings summary all printed "this month €0" identically whether the
  // affiliate earned nothing, the read had not landed, or it failed.
  const monthUnavailable = month.isError || month.isLoading || portalInert;
  // A figure we cannot vouch for is a dash. An affiliate who has earned
  // money must never be shown a zero because a read failed — and must
  // never be DEMOTED by one either, which is what the tier track did.
  const dash = "—";

  // Without a rate the two cannot be put on one scale, and guessing parity
  // is the same bug wearing a confident face. The ladder then counts euros
  // only and SAYS so, rather than quietly inflating itself with dollars.
  const {
    rate: usdToEur,
    isLoading: rateLoading,
    isError: rateError,
  } = useUsdToEur();
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
  // ── AND THE RATE IS A SECOND INPUT TO THE SAME NUMBER ────────────
  //
  // statsUnavailable guards every tier surface, and it only watches the
  // stats query. The rate is the other half: useUsdToEur returns null
  // both while it is loading AND when there is no active rate row for
  // the tenant, so lifetimeCombined counts euros only and tierIndex
  // falls to 0. An affiliate earning in dollars was printed "Starter"
  // on the sidebar, the toolbar pill, the account menu, the wallet
  // badge and the tier card at once — the exact demotion the comment
  // above says must never be rendered on a guess.
  const tierUnknown = statsUnavailable || tierBlind;
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
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
      // ── AND KEEP THE URL HONEST ─────────────────────────────────
      //
      // Without this the address bar says My Referrals whatever you
      // are looking at, so a reload throws the view away and the page
      // cannot be linked to or bookmarked. replaceState, not push: the
      // in-app views are not browser history, and the advertiser shell
      // made the same choice for the same reason.
      const url = new URL(window.location.href);
      url.searchParams.set("view", v);
      window.history.replaceState(null, "", url.toString());
    }
  };

  const copyLink = async () => {
    if (!referralLink) {
      toast.error("Your referral link isn't set up yet", {
        description:
          "Your affiliate account isn't linked to a customer record yet — ask us to finish setting it up.",
      });
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
      toast.error("Your referral link isn't set up yet", {
        description:
          "Your affiliate account isn't linked to a customer record yet — ask us to finish setting it up.",
      });
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
    // ── "NOTHING TO EXPORT" OVER A READ THAT FAILED ─────────────────
    //
    // refs.rows is empty for three different reasons and this treated
    // them as one. An affiliate whose referral read was refused pressed
    // Export and was told they have nothing -- about their own
    // customers, on the file they hand a bookkeeper.
    if (portalInert) {
      toast.error("Your account isn't finished yet, so there is nothing we can export", {
        description: "This is not an empty list. Contact us and we'll complete it.",
      });
      return;
    }
    if (refs.isError) {
      toast.error("We couldn't read your referrals, so there is nothing to export yet", {
        description: "This is not an empty list. Reload and try again.",
      });
      return;
    }
    if (refs.isLoading) {
      toast.info("Still loading your referrals — try again in a moment.");
      return;
    }
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
      // downloadCsv adds the BOM too: this file goes to an affiliate's
      // own bookkeeper, and without it a name with an accent opens as
      // mojibake in a European Windows Excel.
      downloadCsv(csv, "my_referrals.csv");
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
        {/* The mark goes home -- the same promise it makes in the other
            two shells. */}
        <button
          type="button"
          className="logo"
          onClick={() => go("dash")}
          aria-label="Go to the dashboard"
          style={{ border: 0, background: "none", cursor: "pointer", textAlign: "left", width: "100%", font: "inherit", color: "inherit" }}
        >
          <span className="mark">
            <Ic name="i-rocket" />
          </span>
          <span className="name">
            Prime Scale Media<small>Affiliate portal</small>
          </span>
        </button>
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
            <small>{tierUnknown ? "Partner" : `${tier.name} partner`}</small>
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
            <button
              type="button"
              className="mark"
              onClick={() => go("dash")}
              aria-label="Go to the dashboard"
              title="Dashboard"
              style={{ border: 0, padding: 0, cursor: "pointer" }}
            >
              <Ic name="i-rocket" />
            </button>
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
                {/* twoLeg, NOT eur(). This pill is rendered on all six
                    views, and it was the one total on the screen that did
                    not go through the helper written to stop exactly this:
                    an affiliate whose referrals all fund in dollars read
                    "This month €0.00" here while the earnings card two
                    scrolls down read "+$1,000.00". Two answers, one page. */}
                <b>{monthUnavailable ? dash : twoLeg(monthEur, monthUsd)}</b>
              </span>
            </button>
            <span className="tdiv" />
            <button
              className="tool tier2"
              onClick={() => go("refs")}
              title="Your tier"
            >
              <Ic name="i-trophy" /> {tierUnknown ? dash : tier.name}
            </button>
            <span className="tdiv" />
            <button
              className="tool ic-btn"
              onClick={() => go("notif")}
              aria-label="Notifications"
            >
              <Ic name="i-bell" />
              {/* Server-counted, like the advertiser shell: counting off
                  the list undercounts past its 50-row cap, and a failed
                  count used to remove the badge entirely, which reads as
                  "nothing new". */}
              {notifsCountError ? (
                <span
                  className="badge-n unknown"
                  title="We couldn't check for new notifications — this is not a zero."
                  aria-label="Unread count unavailable"
                />
              ) : unreadCount > 0 ? (
                <span className="badge-n">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
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
                      <span className="sub">{tierUnknown ? "Partner" : `${tier.name} partner`}</span>
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
            {/* ── SAY IT ONCE, AT THE TOP ────────────────────────────
                Without this the dashes below are just as silent as the
                zeros were: an affiliate sees a screen full of "—" and
                has no idea whether it is a bad connection, a quiet
                month, or an account that was never finished. */}
            {portalInert && (
              <div className="notice warn" style={{ marginBottom: 14 }}>
                <b>Your affiliate account isn&apos;t finished yet.</b>
                <span>
                  It isn&apos;t linked to a customer record, so we
                  can&apos;t show your referrals, your earnings or your
                  link. Nothing is lost — ask us to finish it and
                  everything appears here.
                </span>
              </div>
            )}
            <section className="hero">
              <div className="ribbon" />
              <div className="glow" />
              {/* Coins, rising. Decoration only — aria-hidden, and it
                  stops dead under prefers-reduced-motion. */}
              <div className="coins" aria-hidden="true">
                <span>€</span>
                <span>$</span>
                <span>€</span>
                <span>$</span>
                <span>€</span>
                <span>$</span>
                <span>€</span>
                <span>$</span>
              </div>
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
                    {/* ── BOTH LEGS, OR THE HEADLINE IS A LIE ───────
                        This printed the EUR half under the eyebrow
                        "Your total earnings" while the tier badge two
                        inches above it is computed from EUR **plus**
                        converted USD. An affiliate paid entirely in
                        dollars read "Your total earnings €0" beside
                        "Scaler" in their own toolbar, with the stat
                        tile directly below showing €0.00 · $1,400.00.
                        One card grid, three answers to one question.

                        Whole units stay — this is the headline, not a
                        figure anyone acts on — and the dollar leg is
                        printed beside it when there is one. */}
                    <h1 className="jackpot" onClick={() => go("pay")}>
                      <span className="cur">€</span>
                      {eurWhole(lifetimeEur).replace("€", "")}
                      {lifetimeUsd > 0 ? (
                        <span className="jackpot-usd">
                          {" · $"}
                          {usdWhole(lifetimeUsd).replace("$", "")}
                        </span>
                      ) : null}
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
                    {/* The one month figure with no guard: it sits in
                        the !statsUnavailable branch, so it rendered
                        whenever the ALL-TIME query succeeded. If the
                        month query alone failed or was in flight, this
                        said "+€0.00 this month" in green while the
                        toolbar forty pixels above said "—". Every other
                        month figure on the screen checks
                        monthUnavailable; this call site was missed. */}
                    <span className="rise-pill" onClick={() => go("pay")}>
                      <Ic name="i-trend" />{" "}
                      {monthUnavailable
                        ? "this month — not loaded"
                        : `+${eur(monthEur)}${
                            monthUsd > 0 ? ` · +${usd(monthUsd)}` : ""
                          } this month`}
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
                      {twoLeg(lifetimeEur, lifetimeUsd)}
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
                  {statsUnavailable
                    ? dash
                    : twoLeg(all.totals.spend_eur, all.totals.spend_usd)}
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
                {/* Not "a percentage of every wallet top-up". Commission
                    is not one shape -- some referrals pay on what the
                    advertiser spends, some a monthly amount, some a
                    one-off at the start. Naming top-ups promises the one
                    arrangement this affiliate may not be on, and it is
                    the sentence they will quote back. The terms are per
                    referral, which is what to say. */}
                Advertisers who join through your link are linked to you, and
                you earn from what they do with us. Your terms are agreed per
                referral.
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
                    {/* refsActive one line up is guarded and this was
                        not, so a failed read printed "— of 0": a dash
                        admitting the read failed, beside a confident
                        zero from the same read. */}
                    of {refsUnavailable ? dash : refsReferred}
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
                  {refsUnavailable
                    ? dash
                    : twoLeg(refs.totals.spend_eur, refs.totals.spend_usd)}
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
                  {refsUnavailable
                    ? dash
                    : twoLeg(refs.totals.earnings_eur, refs.totals.earnings_usd)}
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
                    {monthUnavailable ? dash : twoLeg(monthEur, monthUsd)} / mo
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
                      {statsUnavailable ? dash : twoLeg(lifetimeEur, lifetimeUsd)}
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
                      {statsUnavailable
                        ? dash
                        : twoLeg(all.totals.spend_eur, all.totals.spend_usd)}
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
                  <div className={`thmedal ${tierUnknown ? "unknown" : tier.key}`}>
                    <Ic name="i-medal" />
                  </div>
                  <div className="thinfo">
                    <div className="thname">
                      {tierUnknown ? "Your tier" : tier.name}
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
                          Your USD earnings aren&apos;t counted here yet
                          {rateError
                            ? " — we couldn't read today's rate"
                            : rateLoading
                              ? " — we're still reading today's rate"
                              : " — there is no rate set today"}
                          . This shows your EUR progress only.
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
                {/* The one figure on this screen that was not guarded
                    by refsUnavailable -- so a failed read printed
                    "· 0 active" over a list that says it could not be
                    loaded, two lines below. */}
                <span className="muted2">
                  · {refsUnavailable ? dash : refsActive} active
                </span>
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
                          {String(r.link_status ?? "active") === "pending" ? (
                            <span
                              className="badge pending"
                              style={{ marginLeft: 8 }}
                              title="We check every new referral. What they do in the meantime counts once it is approved."
                            >
                              Waiting for approval
                            </span>
                          ) : null}
                        </div>
                        <div className="code">
                          {r.referred_advertiser_code || "—"}
                        </div>
                      </div>
                      <div className="col">
                        <div className="lbl">Top-ups</div>
                        <div className="num">{r.topup_count}</div>
                      </div>
                      {/* ── BOTH LEGS, LIKE EVERY OTHER TILE ─────────
                          These two printed the EUR figure only. An
                          affiliate paid entirely in USD read "$1,400.00
                          still owed" on the Wallet card and "€0.00" for
                          the same referral here, six inches apart --
                          and the CSV they export carries both columns,
                          so the file contradicted the screen it came
                          from. A leg that is zero stays off, so a
                          single-currency affiliate sees one figure. */}
                      <div className="col">
                        <div className="lbl">Spend</div>
                        <div className="num">
                          {Number(r.spend_eur) > 0 || Number(r.spend_usd) <= 0
                            ? eur(r.spend_eur)
                            : null}
                          {Number(r.spend_usd) > 0 ? (
                            <span
                              style={
                                Number(r.spend_eur) > 0
                                  ? { display: "block", opacity: 0.75 }
                                  : undefined
                              }
                            >
                              {usd(r.spend_usd)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="col comm">
                        <div className="lbl">Commission</div>
                        <div className="num win">
                          {Number(r.earnings_eur) > 0 ||
                          Number(r.earnings_usd) <= 0
                            ? eur(r.earnings_eur)
                            : null}
                          {Number(r.earnings_usd) > 0 ? (
                            <span
                              style={
                                Number(r.earnings_eur) > 0
                                  ? { display: "block", opacity: 0.75 }
                                  : undefined
                              }
                            >
                              {usd(r.earnings_usd)}
                            </span>
                          ) : null}
                        </div>
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
              ) : portalInert ? (
                <div className="card">
                  <p className="cap" style={{ margin: 0 }}>
                    Your account isn&apos;t finished yet, so we can&apos;t
                    show your referrals. This is not an empty list — contact
                    us and we&apos;ll complete it.
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
                    <Ic name="i-trophy" /> {tierUnknown ? "—" : tier.name}
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
                        {String(r.link_status ?? "active") === "pending" ? (
                          <span className="badge pending" style={{ marginLeft: 8 }}>
                            Waiting for approval
                          </span>
                        ) : null}
                      </div>
                      <div style={{ color: "var(--faint)", fontSize: ".83rem" }}>
                        {r.topup_count} top-ups ·{" "}
                        {twoLeg(r.spend_eur, r.spend_usd)} spend
                      </div>
                    </div>
                    <span className="amt">
                      +{twoLeg(r.earnings_eur, r.earnings_usd)}
                    </span>
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
                      {/* Title and time share the top line; the message
                          gets the whole width underneath. Beside the
                          text, the time reserved a third of the row on a
                          phone and squeezed the message into a column
                          half the width of the card. */}
                      <div className="ntxt">
                        <div className="nhead">
                          <div className="t">{copy.title}</div>
                          <span className="tm">
                            {new Date(n.created_at).toLocaleDateString()}
                          </span>
                          {!n.is_read && <span className="undot" />}
                        </div>
                        <div className="d">{copy.description}</div>
                      </div>
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
                        : notifsLoading
                          ? "Loading your notifications…"
                          : "You're all caught up"}
                    </div>
                    <div className="d">
                      {notifsError
                        ? "This is not an empty list — reload to try again."
                        : notifsLoading
                          ? "One moment."
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
                  openWhatsapp(
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
                  );
                }}
              >
                <WhatsappIcon /> Send payout details on WhatsApp
              </button>
              <p className="cap" style={{ marginTop: 8 }}>
                This opens WhatsApp with what you typed above — nothing is
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
                Sign out everywhere, or ask us to delete your account.
              </p>
              {/* heading={false}: this card already has one. The component
                  printed a second, "Privacy", with a sentence saying
                  nearly the same thing as the one above it. */}
              <PrivacyControls heading={false} />
            </div>
            {/* ── AND WHAT HAPPENED ON THEIR ACCOUNT: NOT YET ─────
                This card used to sit here and it could never hold
                anything. The only read policy on audit_events is the
                tenant OWNER, and RLS filters rather than refuses, so
                the list came back empty with no error and printed
                "Nothing here yet. Your changes will show up as you
                use the app." to a customer whose account had plenty
                of history. The question is a real one -- it is the
                first thing somebody asks when a figure surprises
                them -- but answering it needs its own narrowed view,
                because audit_events rows carry old_data/new_data and
                those hold supplier figures. Written up rather than
                faked. */}
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
                      they&apos;re linked to you, and you earn from what they do
                      with us — the terms are agreed per referral, so check
                      yours above.
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
                  onClick={() =>
                    openWhatsapp("Hi PSM, I have a question about my affiliate account.")
                  }
                >
                  <WhatsappIcon /> Message us on WhatsApp
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
                const subject = `Payout request — ${amount} (${showEurUsd})`;
                const body = (
                  `Hi PSM team,\n\nI'd like to request a payout of ${amount} in ${showEurUsd}.\n\n` +
                    `Affiliate: ${name}${profile?.email ? ` (${profile.email})` : ""}\n` +
                    // Which basis the figure came from, so whoever reads
                    // it knows whether to check it against the ledger
                    // before paying.
                    `Basis: ${
                      all.payable.isLifetime
                        ? "lifetime earned - outstanding figure unavailable, please verify"
                        : "outstanding, already net of anything paid"
                    }\n\nThank you.`
                );
                openWhatsapp(`${subject}\n\n${body}`);
                setPayOpen(false);
                toast.success("Opening WhatsApp to send the payout request.");
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
