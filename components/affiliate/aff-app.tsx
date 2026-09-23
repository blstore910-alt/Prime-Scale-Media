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
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { AFF_CSS } from "./aff-shell-css";
// ── THE ADVERTISER'S AFFILIATE SCREEN, ON THE AFFILIATE'S OWN PORTAL ──
//
// The owner, 23-09: "deze is mooi van advertiser dit ook toepassen bij
// affiliate". The Referrals tab an advertiser-as-affiliate sees had a
// round of work this portal never got -- the dark earnings card, the
// period picker that every figure under it obeys, the four lit stats,
// the quiet link, one line per referral, and every commission behind
// them. It is the same data and the same RPCs, so it is the same
// components rather than a second copy that drifts.
import RangePicker, {
  rangeCaption,
  rangeDates,
  type AffRange,
} from "@/components/advertiser/range-picker";
import AffiliateCommissionsCard from "@/components/advertiser/affiliate-commissions-card";
import PayoutCard from "@/components/advertiser/payout-card";
import { saveMyPayoutDetails } from "@/actions/payout-details-actions";
import { AffIcons, Ic } from "./aff-icons";
import { openWhatsapp } from "@/lib/whatsapp";
import WhatsappIcon from "@/components/psm/whatsapp-icon";
import AdvertiseTooCard from "./advertise-too-card";
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
// The owner, 23-09: "eerste tier 1000 eur, tweede 3000, laatste 10k /
// of bedenk 3 tiers tot 10k". Three rungs to climb, the top one at
// 10,000 -- Starter is where everybody starts, not something to reach.
const TIERS = [
  { key: "bronze", name: "Starter", min: 0 },
  { key: "silver", name: "Riser", min: 1000 },
  { key: "gold", name: "Scaler", min: 3000 },
  { key: "plat", name: "Legend", min: 10000 },
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
    // isPending too: "You're all caught up" over a read that never ran
    // is the same lie as a zero, and these carry the reason a payout
    // was sent back.
    isPending: notifsPending,
    // Counted server-side so the badge stays honest past the 50-row cap.
    unreadCount,
    countError: notifsCountError,
    // ── AND 0 UNREAD IS NOT "WE NEVER ASKED" ────────────────────────
    //
    // The badge is simply absent at 0, and the count query reports
    // isLoading FALSE while it is switched off (no userId yet) or
    // paused offline — so an unread "your payout was sent back" read as
    // "nothing new". The grey ring already exists for exactly this
    // sentence; the not-asked case skipped it.
    countPending: notifsCountPending,
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
  // This month, not all time. The owner, 23-09: "standaard op this
  // month". What somebody opens this screen for is what is happening
  // now; all time is one tap away and never moves.
  const [affRange, setAffRange] = useState<AffRange>({ key: "month" });
  // Five referrals, then the rest on one tap -- and a referral picked
  // here narrows the commission list below to that one customer.
  const [refsAll, setRefsAll] = useState(false);
  const [refFocus, setRefFocus] = useState<string | null>(null);
  // Payout details. These were six uncontrolled inputs and the button sent a
  // hard-coded empty template, so everything typed — including the IBAN — was
  // silently thrown away. Held in state and interpolated into the mail body.
  const [savingPayout, setSavingPayout] = useState(false);
  // What the server has. Held beside the form so the card can say
  // "not saved yet" instead of leaving somebody guessing whether their
  // IBAN went anywhere -- which is the exact doubt the WhatsApp button
  // used to create.
  const [payoutSaved, setPayoutSaved] = useState<Record<
    string,
    string
  > | null>(null);
  const [payout, setPayout] = useState({
    holder: "",
    accountType: "",
    taxId: "",
    address: "",
    iban: "",
    bic: "",
  });
  const affPeriod = rangeDates(affRange);
  const refs = useAffiliateStats({
    from: affPeriod.from ?? undefined,
    to: affPeriod.to ?? undefined,
  });
  // The referral TABLE reports its own failure; the summary tiles above it
  // did not, so a failed read printed a commission of 0 directly above a
  // sentence saying the read failed.
  // And when the account has no advertiser row the RPC answers with an
  // empty list and no error (see portalInert below) -- F1 folded that into
  // the Dashboard figures and missed this screen, which printed
  // "Referrals 0 · EUR 0,00 commission" and "No referrals yet".
  const refsUnavailable =
    refs.isError || refs.isPending || !profile?.advertiser?.[0]?.id;
  // The previous period's figures stay on screen while the new ones load
  // (placeholderData). Dimmed, so last month's commission is never read
  // as this month's.
  const refsStale = refs.isPlaceholderData || (refs.isFetching && !refs.isPending);

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
  // isPending, not isLoading: react-query v5 reports isLoading FALSE for a
  // query that is switched off, and every figure under it printed 0,00.
  const statsUnavailable = all.isError || all.isPending || portalInert;
  // What they have asked for lives in PayoutCard, which holds its own
  // read SCOPED to this advertiser id. The copy that used to sit here
  // passed no scope, so its cache key was ["affiliate-payouts",""] --
  // the same key for every identity in the browser, which inside the
  // 5-minute gcTime can show one person another's open request.
  // The MONTH figures come from a second, separate query, and nothing
  // consulted its state — so the topbar pill, the stat card and the
  // earnings summary all printed "this month €0" identically whether the
  // affiliate earned nothing, the read had not landed, or it failed.
  const monthUnavailable = month.isError || month.isPending || portalInert;
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

  // WHICHEVER THEY EARNED MOST IN GOES FIRST. An affiliate paid in
  // dollars should not read every figure as a euro with a dollar
  // footnote. Euros and dollars are never added -- the second leg is its
  // own line under the first, a size smaller.
  const affLeadUsd = Number(all.totals.earnings_usd) > Number(all.totals.earnings_eur);
  const legs = (
    e: number | string | null | undefined,
    u: number | string | null | undefined,
  ) => {
    const eNum = Number(e) || 0;
    const uNum = Number(u) || 0;
    if (eNum && uNum)
      return affLeadUsd ? (
        <>
          {usd(uNum)}
          <span className="v2">{eur(eNum)}</span>
        </>
      ) : (
        <>
          {eur(eNum)}
          <span className="v2">{usd(uNum)}</span>
        </>
      );
    if (uNum && !eNum) return <>{usd(uNum)}</>;
    return <>{eur(eNum)}</>;
  };

  const tenantSlug = profile?.tenant?.slug;
  // Has the form moved away from what the server holds? Six fields and
  // a saved copy, compared field by field -- so the card can say "not
  // saved yet" rather than leaving somebody to wonder whether their
  // IBAN went anywhere.
  const payoutDirty =
    !!payoutSaved &&
    (Object.keys(payout) as (keyof typeof payout)[]).some(
      (k) => (payout[k] ?? "") !== (payoutSaved[k] ?? ""),
    );
  // ── WHAT THE SERVER ALREADY HAS ───────────────────────────────────
  //
  // Asked for, and dropped on error: plak 78 adds the column and code
  // ships in minutes, so the two are never in step (CLAUDE.md). Until it
  // lands the card simply opens empty instead of the screen breaking.
  const savedDetails = useQuery({
    queryKey: ["my-payout-details", profile?.advertiser?.[0]?.id ?? ""],
    enabled: !!profile?.advertiser?.[0]?.id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertisers")
        .select("payout_details")
        .eq("id", profile!.advertiser![0]!.id)
        .maybeSingle();
      if (error) {
        if (/payout_details/i.test(String(error.message))) return null;
        throw error;
      }
      return ((data as { payout_details?: Record<string, string> | null } | null)
        ?.payout_details ?? null) as Record<string, string> | null;
    },
  });

  // Seed the form once, when they arrive. Not on every render: somebody
  // halfway through typing must not have it pulled out from under them.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || savedDetails.isPending) return;
    const d = savedDetails.data;
    if (d && Object.keys(d).length) {
      seeded.current = true;
      setPayout((prev) => ({ ...prev, ...d }));
      setPayoutSaved(d);
    } else if (savedDetails.isSuccess) {
      seeded.current = true;
    }
  }, [savedDetails.data, savedDetails.isPending, savedDetails.isSuccess]);

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
    // isPending, not isLoading: a query that is switched off or paused
    // reports isLoading FALSE, and the guard below then toasted
    // "Nothing to export for this range" about a read that never ran.
    if (refs.isPending) {
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
          {/* ONE SHAPE LANGUAGE ACROSS THE BAR. The advertiser and admin
              bars were brought to this a while ago and this one was
              missed: a loose hamburger and a loose brand tile beside a
              grouped pill on the right, so the bar read as three
              unrelated things. Same .toolbar on both ends — two matched
              clusters. The left one only exists on the phone; on desktop
              the sidebar already carries the logo. */}
          <div className="toolbar tb-left">
            <button
              className="tool ic-btn ham"
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
            </div>
          </div>
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
              {notifsCountError || notifsCountPending ? (
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
            {/* Duplicates the one inside the account menu — so on a
                phone, where the bar is tight, it steps aside. */}
            <button
              className="tool ic-btn so-btn"
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
            <div className="hello">
              <h1>
                {/* THE WHOLE NAME WHEN IT FITS. Taking the first word
                    always is how "the affiliateking" became "Welcome
                    back, the" on production — a first word is only a
                    first NAME when somebody filled the field in that
                    way. So: the name as given while it fits on the
                    line, and only a long one gets shortened. */}
                Welcome back,{" "}
                <b>
                  {(() => {
                    const n = name.trim();
                    if (!n) return "there";
                    return n.length <= 20 ? n : n.split(/\s+/)[0];
                  })()}
                </b>
              </h1>
              <p>Here&apos;s what your referrals have brought in.</p>
            </div>
            {/* ── THE EARNINGS CARD ───────────────────────────────────
                Same card as the advertiser's Affiliate program screen, to
                the pixel: dark ground, a slow ribbon, gold light, coins
                rising, and the figure itself lit. Decoration is
                aria-hidden, never clickable, and dead still under reduced
                motion. A figure we could not read is a dash and a
                sentence, never a zero -- this is the one screen an
                affiliate opens to see what they are owed. */}
            <section className="xhero">
              <div className="xh-ribbon" aria-hidden="true" />
              <div className="xh-glow" aria-hidden="true" />
              <div className="xh-coins" aria-hidden="true">
                <span>€</span>
                <span>$</span>
                <span>€</span>
                <span>$</span>
                <span>€</span>
                <span>$</span>
                <span>€</span>
                <span>$</span>
              </div>
              <div className="xh-in">
                <p className="xh-eyebrow">
                  <Ic name="i-gift" /> Your total earnings
                </p>
                {statsUnavailable ? (
                  <>
                    <h1 className="xh-amt">
                      <span className="cur">€</span>—
                    </h1>
                    <p className="xh-sub">
                      {all.isError
                        ? "We couldn't load your earnings just now. This is NOT a zero \u2014 reload to try again."
                        : portalInert
                          ? "Your affiliate account isn't finished yet \u2014 we're on it."
                          : "Counting your earnings\u2026"}
                    </p>
                  </>
                ) : (
                  <>
                    {(() => {
                      // Both legs, to the cent. The bigger one leads; a
                      // currency with nothing in it is left out, never
                      // printed as a 0. Euros and dollars are never added:
                      // a second currency is its own line, lit the same way.
                      const e = Number(lifetimeEur) || 0;
                      const u = Number(lifetimeUsd) || 0;
                      const usdFirst = u > 0 && (e === 0 || affLeadUsd);
                      const lead = usdFirst ? usd(u) : eur(e);
                      const second = usdFirst ? (e > 0 ? eur(e) : null) : u > 0 ? usd(u) : null;
                      return (
                        <>
                          <h1 className="xh-amt">
                            <span className="cur">{lead.charAt(0)}</span>
                            {lead.slice(1)}
                          </h1>
                          {second ? (
                            <p className="xh-amt xh-amt2">
                              <span className="cur">{second.charAt(0)}</span>
                              {second.slice(1)}
                            </p>
                          ) : null}
                        </>
                      );
                    })()}
                    <div className="xh-tiles">
                      <button type="button" className="xh-t" onClick={() => go("refs")}>
                        <span className="v">{referredCount}</span>
                        <span className="l">Referred</span>
                      </button>
                      <button type="button" className="xh-t win" onClick={() => go("refs")}>
                        <span className="v">{activeCount}</span>
                        <span className="l">Active</span>
                      </button>
                    </div>
                    {/* The one month figure with no guard used to sit in
                        this branch, so it rendered whenever the ALL-TIME
                        query succeeded and said "+€0.00 this month" in
                        green while the toolbar forty pixels above said
                        "—". */}
                    <span className="xh-pill">
                      <Ic name="i-trend" />{" "}
                      {monthUnavailable
                        ? "this month \u2014 not loaded"
                        : `+${twoLeg(monthEur, monthUsd)} this month`}
                    </span>
                  </>
                )}
              </div>
            </section>
            <div className="stats xstats">
              <div className="stat g-gold" onClick={() => go("pay")}>
                <div className="k">
                  <span className="ci g">
                    <Ic name="i-trophy" />
                  </span>{" "}
                  Lifetime
                </div>
                {/* This printed twoLeg() AND a second dollar span under
                    it, so a USD affiliate read "$1,400.00 · $1,400.00"
                    — $2,800 to anyone glancing at it. One helper, one
                    answer, like every other tile. */}
                <div className="v gold">
                  {statsUnavailable ? dash : legs(lifetimeEur, lifetimeUsd)}
                </div>
              </div>
              <div className="stat g-win" onClick={() => go("pay")}>
                <div className="k">
                  <span className="ci t">
                    <Ic name="i-trend" />
                  </span>{" "}
                  This month
                </div>
                {/* Same fault, mirrored: eur() was printed unconditionally,
                    so a USD-only affiliate read "€0.00 · $500.00" here
                    while the toolbar pill said "$500.00". */}
                <div className="v win">
                  {monthUnavailable ? dash : legs(monthEur, monthUsd)}
                </div>
              </div>
              <div className="stat g-blue" onClick={() => go("refs")}>
                <div className="k">
                  <span className="ci b">
                    <Ic name="i-users" />
                  </span>{" "}
                  Referred
                </div>
                <div className="v blue">
                  {statsUnavailable ? dash : referredCount}
                </div>
              </div>
              <div className="stat g-purple" onClick={() => go("refs")}>
                <div className="k">
                  <span className="ci p">
                    <Ic name="i-chart" />
                  </span>{" "}
                  Spend driven
                </div>
                <div className="v">
                  {statsUnavailable
                    ? dash
                    : legs(all.totals.spend_eur, all.totals.spend_usd)}
                </div>
              </div>
            </div>
            {/* The other half of an affiliate account: advertising too. */}
            <AdvertiseTooCard advertiserId={profile?.advertiser?.[0]?.id} />
          </div>

          {/* MY REFERRALS */}
          <div className={`view${view === "refs" ? " on" : ""}`}>
            <div className="phead">
              <h1>Affiliate program</h1>
              <p>Everyone you brought in, and what they earned you.</p>
            </div>
            <section className="tierx">
              <div className="tx-ribbon" aria-hidden="true" />
              <div className="tx-glow" aria-hidden="true" />
              <div className="tx-in">
                <div className="tx-head">
                  <p className="tx-eyebrow">
                    <Ic name="i-medal" /> Your tier
                  </p>
                  {/* Not a tier number we cannot vouch for. On a failed
                      read lifetimeCombined is 0, which puts the medal back
                      to Starter, resets the track to 0% and tells the
                      affiliate how much MORE they need to reach a tier they
                      may already be past. */}
                  <span className="tx-pill">
                    {statsUnavailable
                      ? "Checking\u2026"
                      : tierUnknown
                        ? `Tier \u2014 / ${TIERS.length}`
                        : `Tier ${tierIndex + 1} / ${TIERS.length}`}
                  </span>
                </div>

                <div className="tx-medalwrap">
                  {/* The ring IS the progress: a conic sweep around the
                      medal, so the thing you look at is the thing that
                      moves. It is not drawn at all when the figure behind
                      it is unknown. */}
                  <div
                    className={`tx-ring${statsUnavailable || tierUnknown ? " blind" : ""}`}
                    style={
                      statsUnavailable || tierUnknown
                        ? undefined
                        : ({ ["--p" as string]: `${tierPct}%` } as React.CSSProperties)
                    }
                  >
                    <div className={`tx-medal ${tierUnknown ? "unknown" : tier.key}`}>
                      <Ic name="i-medal" />
                    </div>
                  </div>
                  <div className="tx-who">
                  <div className="tx-name">
                    {tierUnknown ? "\u2014" : tier.name}
                  </div>
                  <div className="tx-sub">
                    {statsUnavailable
                      ? "We couldn't read your earnings just now \u2014 this is not a reset."
                      : tierBlind
                        ? "Your USD earnings can't be converted today, so we can't place your tier yet."
                        : `You're a ${tier.name} partner`}
                  </div>
                  </div>
                </div>

                {/* THE LADDER. Four rungs, the one you are on lit, the
                    ones behind you ticked. A single bar said how far,
                    never where. */}
                <div className="tx-ladder">
                  {TIERS.map((t, i) => {
                    const state = tierUnknown
                      ? ""
                      : i < tierIndex
                        ? " done"
                        : i === tierIndex
                          ? " on"
                          : "";
                    return (
                      <div className={`tx-rung${state}`} key={t.key}>
                        <span className="tx-dot">
                          {!tierUnknown && i < tierIndex ? (
                            <Ic name="i-check" />
                          ) : null}
                        </span>
                        <span className="tx-rname">{t.name}</span>
                        <span className="tx-rmin">
                          {t.min === 0 ? "start" : eur(t.min)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* The card contradicted itself: "we couldn't read your
                    earnings" and then a bar at 0% under a sentence saying
                    how much more was needed, both computed from the
                    earnings that had just been disclaimed. */}
                {statsUnavailable ? null : (
                  <p className="tx-note">
                    {tierBlind ? (
                      <>
                        Your USD earnings aren&apos;t counted here yet
                        {rateError
                          ? " \u2014 we couldn't read today's rate"
                          : rateLoading
                            ? " \u2014 we're still reading today's rate"
                            : " \u2014 there is no rate set today"}
                        . This shows your EUR progress only.
                      </>
                    ) : nextTier ? (
                      <>
                        <b>{eur(nextTier.min - lifetimeCombined)}</b> more in
                        lifetime earnings to reach{" "}
                        <b className="gold">{nextTier.name}</b>.
                      </>
                    ) : (
                      <>
                        You&apos;ve reached the top tier {"\u2014"}{" "}
                        <b className="gold">{tier.name}</b>. {"\ud83c\udf89"}
                      </>
                    )}
                  </p>
                )}
                <p className="tx-legend">
                  Your <b>lifetime earnings</b> move you up the tiers. Your
                  commission rate stays whatever was agreed per referral.
                </p>
              </div>
            </section>

            {/* ── ONE PERIOD FOR EVERY FIGURE UNDER IT ──────────────
                The four stats, every referral's row, and the commission
                list with its totals all read this one control, so a
                number and the list it sums always cover the same days.
                The earnings card on the Dashboard stays all-time. */}
            <RangePicker
              value={affRange}
              onChange={(next) => setAffRange(next)}
              busy={refs.isFetching && !refs.isPending}
              onExport={exportReferrals}
            />

            {/* Dimmed while the new period is on its way, so last
                period's figures are never read as this one's. */}
            <div className={`stats xstats${refsStale ? " busy" : ""}`}>
              <div className="stat g-blue">
                <div className="k">
                  <span className="ci b">
                    <Ic name="i-trend" />
                  </span>{" "}
                  Earned
                </div>
                <div className="v win">
                  {refsUnavailable
                    ? dash
                    : legs(refs.totals.earnings_eur, refs.totals.earnings_usd)}
                </div>
              </div>
              <div className="stat g-gold">
                <div className="k">
                  <span className="ci g">
                    <Ic name="i-wallet" />
                  </span>{" "}
                  {/* "To be paid" over an affiliate's own earnings reads
                      as though a CUSTOMER still owes it. What is pending
                      is our payout to them. */}
                  Awaiting payout
                </div>
                <div className="v gold">
                  {refsUnavailable ? dash : legs(refs.payable.eur, refs.payable.usd)}
                </div>
              </div>
              <div className="stat g-win">
                <div className="k">
                  <span className="ci t">
                    <Ic name="i-check" />
                  </span>{" "}
                  Paid out
                </div>
                <div className="v">
                  {/* Nothing referred is nothing paid: with no rows there
                      is no "unpaid" column to read, and a dash there reads
                      as "we don't know" beside three honest zeros. */}
                  {refsUnavailable ||
                  (refs.payable.isLifetime && refs.rows.length > 0)
                    ? dash
                    : legs(
                        Math.max(
                          0,
                          Math.round(
                            ((Number(refs.totals.earnings_eur) || 0) -
                              (Number(refs.totals.unpaid_eur) || 0)) *
                              100,
                          ) / 100,
                        ),
                        Math.max(
                          0,
                          Math.round(
                            ((Number(refs.totals.earnings_usd) || 0) -
                              (Number(refs.totals.unpaid_usd) || 0)) *
                              100,
                          ) / 100,
                        ),
                      )}
                </div>
              </div>
              <div className="stat g-purple">
                <div className="k">
                  <span className="ci p">
                    <Ic name="i-chart" />
                  </span>{" "}
                  Spend driven
                </div>
                <div className="v">
                  {refsUnavailable
                    ? dash
                    : legs(refs.totals.spend_eur, refs.totals.spend_usd)}
                </div>
              </div>
            </div>

            {/* The link, quiet: a tool, not the headline. The owner,
                22-09: "first the casino card and the stats, then the link
                \u2014 the link can be much more subtle". */}
            <div className="card xshare">
              <div className="xs-top">
                <span className="ci b">
                  <Ic name="i-gift" />
                </span>
                <div style={{ minWidth: 0 }}>
                  <h2>Your referral link</h2>
                  {/* Not "a percentage of every wallet top-up".
                      Commission is not one shape \u2014 some referrals pay on
                      what the advertiser spends, some a monthly amount,
                      some a one-off at the start. Naming top-ups promises
                      the one arrangement this affiliate may not be on. */}
                  <p className="cap">
                    Anyone who signs up through it is yours, and stays
                    yours. Your terms are agreed per referral.
                  </p>
                </div>
              </div>
              {referralLink ? (
                <>
                  <div className="xs-link mono" title={referralLink}>
                    {referralLink}
                  </div>
                  <div className="xs-acts">
                    <button className="btn sm" onClick={copyLink}>
                      <Ic name="i-copy" /> Copy link
                    </button>
                    <button className="btn ghost sm wa" onClick={shareWhatsApp}>
                      <WhatsappIcon /> WhatsApp
                    </button>
                    {/* Email and QR are gone: a mailto: on a machine
                        with no mail client does nothing at all and
                        cannot be detected, and "Copy for QR" copies the
                        same string Copy link already copied. Two
                        buttons, one of them silent. The owner: "email
                        en qr button hoeft niet, onnodig". */}
                  </div>
                </>
              ) : (
                <p className="cap" style={{ margin: "10px 0 0" }}>
                  {portalInert
                    ? "Your affiliate account isn't finished yet, so we couldn't build your link. Nothing is lost \u2014 ask us to finish it."
                    : "We couldn't build your referral link just now \u2014 reload, and tell us if it stays away."}
                </p>
              )}
            </div>
            {/* ── ONE LINE PER REFERRAL ───────────────────────────────
                A phone showed four label/value pairs per referral, a
                screen tall for two of them. One line of name, one line of
                detail, the money on the right \u2014 and the whole row opens
                every commission behind it. */}
            <div
              className={`card xlist${refsStale ? " busy" : ""}`}
              id="aff-refs"
            >
              <div className="xl-head">
                <h2>
                  <Ic name="i-user" /> Your referrals
                </h2>
                {!refsUnavailable ? (
                  <span className="xl-count">{refs.rows.length}</span>
                ) : null}
              </div>
              {refs.rows.length ? (
                (refsAll ? refs.rows : refs.rows.slice(0, 5)).map((r) => {
                  const waiting = String(r.link_status ?? "active") === "pending";
                  const topups = Number(r.topup_count) || 0;
                  return (
                    <button
                      type="button"
                      className="xrow"
                      key={r.referred_advertiser_id}
                      onClick={() => {
                        setRefFocus(r.referred_advertiser_code || null);
                        document
                          .getElementById("aff-commissions")
                          ?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      title="Show every commission from this referral"
                    >
                      <span className="av">
                        {initials(r.referred_advertiser_name)}
                      </span>
                      <span className="mid">
                        <span className="nm">
                          <span className="t">
                            {r.referred_advertiser_name || "Advertiser"}
                          </span>
                          {waiting ? (
                            <span
                              className="badge pend xs"
                              title="We check every new referral. What they do in the meantime counts once it is approved."
                            >
                              Waiting for approval
                            </span>
                          ) : null}
                        </span>
                        <span className="sm">
                          {[
                            r.referred_advertiser_code,
                            `${topups} top-up${topups === 1 ? "" : "s"}`,
                            `${twoLeg(r.spend_eur, r.spend_usd)} spend`,
                          ]
                            .filter(Boolean)
                            .join(" \u00b7 ")}
                        </span>
                      </span>
                      <span className="rt">
                        <span className="amt">
                          {legs(r.earnings_eur, r.earnings_usd)}
                        </span>
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="xl-empty">
                  {/* isPending, not isLoading: react-query reports
                      isLoading FALSE for a query that is switched off or
                      paused, so an offline phone fell all the way through
                      to "No referrals yet" under four dashes. */}
                  {refs.isError
                    ? "We couldn't read your referrals just now \u2014 this is not a zero. Reload to try again."
                    : refs.isPending
                      ? "Loading your referrals\u2026"
                      : portalInert
                        ? "Your account isn't finished yet, so we can't show your referrals. This is not an empty list \u2014 contact us and we'll complete it."
                        : "No referrals yet \u2014 share your link and they appear here."}
                </p>
              )}
              {refs.rows.length > 5 ? (
                <button className="xl-more" onClick={() => setRefsAll((v) => !v)}>
                  {refsAll ? "Show fewer" : `View all ${refs.rows.length}`}
                  <Ic name="i-chev" />
                </button>
              ) : null}
            </div>

            {/* ── AND EVERY COMMISSION BEHIND THOSE TOTALS ────────────
                The same card the advertiser's Affiliate program screen
                carries: every single commission, its kind, its date and
                its state, so any figure above can be traced to its rows
                instead of believed. */}
            <div id="aff-commissions" className="aff-stack">
              <AffiliateCommissionsCard
                enabled={!portalInert}
                focusCode={refFocus}
                onClearFocus={() => setRefFocus(null)}
                from={affPeriod.from}
                to={affPeriod.to}
                periodLabel={rangeCaption(affRange)}
                leadCurrency={affLeadUsd ? "USD" : "EUR"}
              />
            </div>
          </div>

          {/* WALLET */}
          <div className={`view${view === "pay" ? " on" : ""}`}>
            <div className="phead">
              <h1>Wallet</h1>
              <p>What you have earned, and asking to be paid it.</p>
            </div>
            {portalInert && (
              <div className="notice warn" style={{ marginBottom: 14 }}>
                <b>Your affiliate account isn&apos;t finished yet.</b>
                <span>
                  It isn&apos;t linked to a customer record, so we can&apos;t
                  read your balance or your payouts. Nothing is lost — ask
                  us to finish it and everything appears here.
                </span>
              </div>
            )}
            {/* WHAT IS ACTUALLY IN IT. The two figures went out with
                the old blue card when PayoutCard came in, so this screen
                asked to be paid without ever saying how much there was. */}
            <section className="wal">
              <div className="wal-ribbon" aria-hidden="true" />
              <div className="wal-in">
                <div className="wal-head">
                  <p className="wal-eyebrow">
                    <Ic name="i-wallet" />{" "}
                    {all.payable.isLifetime ? "Earned to date" : "Still owed to you"}
                  </p>
                  <span className="wal-tier">
                    {tierUnknown ? "\u2014" : tier.name}
                  </span>
                </div>
                <div className="wal-pots">
                  {(["EUR", "USD"] as const).map((c) => {
                    const owed =
                      c === "EUR"
                        ? Number(all.payable.eur) || 0
                        : Number(all.payable.usd) || 0;
                    const lifetime =
                      c === "EUR"
                        ? Number(all.totals.earnings_eur) || 0
                        : Number(all.totals.earnings_usd) || 0;
                    return (
                      <div
                        key={c}
                        className={`wal-pot${!statsUnavailable && owed > 0 ? " on" : ""}`}
                      >
                        <span className="l">{c}</span>
                        <span className="v">
                          {statsUnavailable
                            ? dash
                            : c === "EUR"
                              ? eur(owed)
                              : usd(owed)}
                        </span>
                        {/* The button below is already disabled when the
                            balance is unknown \u2014 and the two figures it is
                            disabled ABOUT used to print as a confident 0. */}
                        <span className="n">
                          {statsUnavailable
                            ? "we couldn't read this"
                            : `${c === "EUR" ? eur(lifetime) : usd(lifetime)} earned in total`}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="wal-sub">
                  {statsUnavailable
                    ? "We couldn't read your balance just now \u2014 this is not a zero. Reload to try again."
                    : all.payable.isLifetime
                      ? "That is everything you have earned, not what is still outstanding \u2014 we'll confirm the exact figure when you ask."
                      : "Paid by hand, always. Nothing leaves automatically, and we confirm every transfer here with its reference."}
                </p>
              </div>
            </section>

            <div className="aff-stack">
              <PayoutCard
                enabled={!portalInert}
                scope={profile?.advertiser?.[0]?.id ?? null}
                // Every new request starts from what they saved under
                // Settings, instead of six empty boxes and an IBAN typed
                // out again.
                defaults={savedDetails.data ?? null}
                owedEur={Number(all.payable.eur) || 0}
                owedUsd={Number(all.payable.usd) || 0}
                owedUnknown={
                  statsUnavailable ||
                  (all.payable.isLifetime && all.rows.length > 0)
                }
              />
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
                        : notifsLoading || notifsPending
                          ? "Loading your notifications…"
                          : "You're all caught up"}
                    </div>
                    <div className="d">
                      {notifsError
                        ? "This is not an empty list — reload to try again."
                        : notifsLoading || notifsPending
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
                  <p className="cap" style={{ margin: "2px 0 0" }}>
                    Your name and email are on your account record — they go
                    on your payouts, so we change them with you.{" "}
                    <button
                      type="button"
                      style={{
                        background: "none",
                        border: 0,
                        padding: 0,
                        cursor: "pointer",
                        color: "var(--primary-600)",
                        font: "inherit",
                        fontWeight: 700,
                      }}
                      onClick={() =>
                        openWhatsapp(
                          "Hi PSM, please change the name or email on my affiliate account.",
                        )
                      }
                    >
                      Message us
                    </button>
                  </p>
                  {/* THE CURRENCY PICKER THAT NO LONGER DID ANYTHING.
                      "Request payouts in EUR / USD" set a default for a
                      question the payout dialog now asks per request —
                      which currencies to be paid, and whether to convert
                      them into one. The owner: "wat hebben we nog aan
                      deze knop". Nothing. */}
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
Where your payouts go. Saved on your account, and filled in
                for you every time you ask to be paid.
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
              {/* ── SAVED, NOT SENT ────────────────────────────────
                  This was a button that opened WhatsApp with what you
                  typed in it, under a line admitting nothing was stored.
                  So six fields including an IBAN lived in useState, a
                  reload threw them away, and the payout dialog under
                  Wallet asked for the same six again. The owner: "hij
                  moet gewoon hier kunnen opslaan als standaard voor new
                  requests." */}
              <div className="pd-actions">
                <button
                  className="btn"
                  disabled={savingPayout || portalInert}
                  title={
                    portalInert
                      ? "Your affiliate account isn't finished yet, so there is nowhere to keep these."
                      : undefined
                  }
                  onClick={async () => {
                    setSavingPayout(true);
                    try {
                      const res = await saveMyPayoutDetails(payout);
                      if (!res.ok) {
                        toast.error("Couldn't save your payout details", {
                          description: res.error,
                        });
                        return;
                      }
                      setPayoutSaved(payout);
                      toast.success("Saved", {
                        description:
                          "Every new payout request starts with these.",
                      });
                    } finally {
                      setSavingPayout(false);
                    }
                  }}
                >
                  <Ic name="i-check" />{" "}
                  {savingPayout ? "Saving\u2026" : "Save as my default"}
                </button>
                {payoutDirty ? (
                  <span className="pd-dirty">Not saved yet</span>
                ) : payoutSaved ? (
                  <span className="pd-ok">
                    <Ic name="i-check" /> Saved
                  </span>
                ) : null}
              </div>
              <p className="cap" style={{ marginTop: 8 }}>
                {portalInert
                  ? "Your affiliate account isn't finished yet, so there is nowhere to keep these. Ask us to finish it."
                  : "Kept on your account and filled in for you on every payout request. You can still change them per request."}
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

      {/* THE OLD PAYOUT DIALOG IS GONE. It asked for one currency,
          sent one request, kept its six bank fields in plain useState so
          a reload threw the IBAN away, closed on a click outside while
          the RPC was still in flight, and toasted success over a
          window.open that a popup blocker had silently refused. The card
          on the Wallet screen carries all of that properly: both
          currencies, a conversion preview, the 200 floor stated before
          the button is pressed, every earlier payout with its reference,
          and a way to withdraw one nobody has answered yet. */}
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
