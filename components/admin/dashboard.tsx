"use client";

import { DashboardStatsCards } from "@/components/dashboard-stats-cards";
import RateLimitsView from "@/components/system-status/rate-limits-view";
import SystemStatusPanel from "@/components/system-status/system-status-panel";
import { useAppContext } from "@/context/app-provider";
import { usePendingCounts } from "@/hooks/use-pending-counts";
import { useAffiliatesWaiting } from "@/hooks/use-affiliates-waiting";
import {
  ArrowRight,
  ChevronDown,
  Coins,
  Download,
  FileText,
  Gift,
  Landmark,
  Percent,
  Receipt,
  RefreshCw,
  Server,
  Upload,
  UserPlus,
  Wallet,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { dailyQuote } from "@/lib/pure-daily-quote";
import { dstBehind } from "@/lib/pure-dst-behind";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";

type Queue = {
  /**
   * Unique per card, and NOT the href.
   *
   * Two cards point at /wallet-topups -- the queue itself and the bank
   * deposits beside it -- so keying on href gave React two children with
   * the same key. It was latent until the list started changing order
   * between "still counting" and "counted": on that re-order React
   * reused the wrong node, and the owner got "Wallet topups to verify"
   * twice, one of them stuck on its loading placeholder.
   */
  key: string;
  href: string;
  icon: LucideIcon;
  ci: string;
  /** null = unknown (not read). Distinct from 0. */
  count?: number | null;
  label: string;
  /**
   * A standing check rather than a queue somebody is waiting in.
   * It never outranks real work, however big its number is.
   */
  soft?: boolean;
};

// Dashboard-only classes ported verbatim from the approved mockup, scoped
// under .psm-dash so they can never leak to other pages. The shell already
// defines the design tokens (--primary, --panel, --line, --win, --purple,
// --navy*, --brand, --primary-tint, --txt-2, --faint, --shadow-sm …) on
// .psmapp — we reuse those and only fill the one tint the shell omits.
// Motion is covered by the shell's global prefers-reduced-motion rule
// (`.psmapp *{animation/transition:none}`), which our elements inherit.
const DASH_CSS = `
.psm-dash{--purple-tint:#f3e8ff;display:flex;flex-direction:column;gap:12px}

/* Title row: heading + subtitle on the left, invite pinned right. The text
   column must be allowed to shrink (min-width:0) or the long subtitle sets
   the column's floor and pushes the button onto its own wrapped line —
   which is the layout this replaced. */
.psm-dash .phead{align-items:center;flex-wrap:nowrap;gap:10px}
.psm-dash .phead .ptxt{flex:1 1 auto;min-width:0}
.psm-dash .phead .invite{flex:0 0 auto;white-space:nowrap}

.psm-dash .attnrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.psm-dash .attnrow>.attn{flex:1 1 340px}

.psm-dash .attn{display:flex;align-items:center;gap:11px;background:linear-gradient(135deg,var(--primary-tint),var(--purple-tint));border:1px solid #d9e2ff;border-radius:14px;padding:11px 14px;flex-wrap:wrap}
.psm-dash .attn .ai{width:34px;height:34px;border-radius:10px;background:#fff;display:grid;place-items:center;color:var(--primary-600);flex:0 0 auto}
.psm-dash .attn .ai svg{width:18px;height:18px}
.psm-dash .attn b{font-weight:800;font-family:var(--hd);font-size:1rem}
.psm-dash .attn .sub{color:var(--txt-2);font-size:.84rem;margin-top:1px}
.psm-dash .attn .cta{margin-left:auto;color:#fff}
/* "All caught up" is a compact one-liner: small check icon INLINE with the
   headline and its sub-line, not a tall block with the icon floating above. */
.psm-dash .attn.ok{background:linear-gradient(135deg,var(--win-soft),#eafaf3);border-color:#bfe9d6;padding:8px 13px;gap:9px}
.psm-dash .attn.ok .ai{width:26px;height:26px;border-radius:8px;color:var(--win)}
.psm-dash .attn.ok .ai svg{width:15px;height:15px}
.psm-dash .attn.ok b{font-size:.92rem}
.psm-dash .attn.ok .sub{margin-top:0}

.psm-dash .qgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(240px,100%),1fr));gap:10px}
.psm-dash .qcard{display:flex;align-items:center;gap:11px;background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:12px 14px;box-shadow:var(--shadow-sm);cursor:pointer;transition:.15s;position:relative;overflow:hidden}
/* The badge, while the count is still coming. The card itself renders
   straight away now -- only this is unknown, so only this waits. Same
   size as the real badge so the row does not move when the number
   lands. */
/* ── AND WHILE IT LOADS, THE CARD IS EMPTY, NOT BUSY ───────────
   The owner, 28-09, with a before and after screenshot: "SS1 is laden,
   SS2 is geladen -- maak lader mooier, dus echt empty, anders is
   raar."

   He was looking at the selector above: :has(.qbadge:not(.zero)) is
   how a queue with work earns its blue edge -- and the loading badge
   is EMPTY, so it carries no .zero and matched too. Every card in
   the list lit up as though somebody were waiting on it, and then
   half of them dropped to 0 and went grey. The loading state said the
   opposite of what it found.

   So .skel is excluded from that rule, and the whole row is drawn
   quiet while we do not know: muted icon, muted title, a soft block
   where the number will be. Nothing moves when the count lands. */
.psm-dash .qcard .qbadge.skel{width:26px;height:20px;background:var(--line);
  color:transparent;border:0;box-shadow:none;
  animation:qpulse 1.1s ease-in-out infinite}
.psm-dash .qcard:has(.qbadge.skel) .qi{opacity:.45;filter:saturate(.35)}
.psm-dash .qcard:has(.qbadge.skel) .ql{opacity:.5}
.psm-dash .qcard:has(.qbadge.skel) .go{opacity:.3}
@keyframes qpulse{0%,100%{opacity:.5}50%{opacity:.9}}
@media (prefers-reduced-motion:reduce){
  .psm-dash .qcard .qbadge.skel{animation:none}
}
@media (prefers-reduced-motion:reduce){
  .psm-dash .qcard.qskel .qi,
  .psm-dash .qcard.qskel .ql,
  .psm-dash .qcard.qskel .qbadge{animation:none}
}
.psm-dash .qcard:hover{border-color:var(--primary);transform:translateY(-2px)}
/* A queue with work in it looks different from an empty one BEFORE you read
   the number: a coloured edge down the side and a title at full strength. An
   empty queue keeps its place and goes quiet. This screen is scanned for
   "who is waiting on me", and the answer should be visible from across a
   desk, not counted. */
.psm-dash .qcard:has(.qbadge:not(.zero):not(.skel)){border-color:#cfe0ff;background:linear-gradient(180deg,#fff,var(--primary-tint))}
.psm-dash .qcard:has(.qbadge:not(.zero):not(.skel))::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--primary)}
.psm-dash .qcard:has(.qbadge.unknown)::before{background:var(--faint)}
/* A queue with nothing in it AND a queue that carries no count at all are
   both just links — neither is telling you to do anything. They were styled
   differently, so the cards saying the least ended up the loudest on the
   screen. Same quiet treatment for both. */
.psm-dash .qcard:has(.qbadge.zero) .ql,
.psm-dash .qcard:not(:has(.qbadge)) .ql{color:var(--txt-2);font-weight:600}
.psm-dash .qcard:has(.qbadge.zero) .qi,
.psm-dash .qcard:not(:has(.qbadge)) .qi{opacity:.55}
.psm-dash .qcard .qi{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;flex:0 0 auto}
.psm-dash .qcard .qi svg{width:17px;height:17px}
.psm-dash .qcard .ql{flex:1;min-width:0;font-family:var(--hd);font-weight:700;font-size:.92rem;line-height:1.25;color:var(--ink)}
.psm-dash .qcard .qbadge{flex:0 0 auto;min-width:24px;height:24px;padding:0 8px;border-radius:99px;display:grid;place-items:center;background:var(--primary);color:#fff;font-family:var(--hd);font-weight:800;font-size:.78rem;font-variant-numeric:tabular-nums;box-shadow:0 6px 14px -8px rgba(58,111,255,.9)}
/* An unreadable count is not zero. It renders as a muted dash, never as a
   number, so "nothing to do" can only ever mean nothing to do. */
.psm-dash .qcard .qbadge.zero{background:var(--panel-2);color:var(--txt-2);box-shadow:none;border:1px solid var(--line)}
.psm-dash .qcard .qbadge.unknown{background:var(--panel-2);color:var(--faint);box-shadow:none;border:1px solid var(--line-2)}
.psm-dash .qcard .go{margin-left:auto;color:var(--faint);width:17px;height:17px;flex:0 0 auto}

/* Profit & activity — one cohesive section: header + hero + control + metrics.
   A top hairline bounds the section; header carries title + honest subtitle. */
/* Said once, at the top, when a guard sent them back here. */
/* The greeting. The name carries the weight; the line under it is quiet
   on purpose -- it is there to be noticed once, not to be read again. */
.psm-dash .phead .ptxt h1 b{font-weight:800;color:var(--primary-600)}
.psm-dash .phead .ptxt p{max-width:52ch}

.psm-dash .denied{display:flex;align-items:flex-start;gap:4px 10px;flex-wrap:wrap;
  border:1px solid var(--line);border-left:3px solid var(--primary);border-radius:12px;
  background:var(--primary-tint);padding:11px 13px;font-size:.86rem;color:var(--ink)}
.psm-dash .denied b{font-weight:800}
.psm-dash .denied span{flex:1 1 100%;color:var(--txt-2);line-height:1.45}
.psm-dash .denied button{margin-left:auto;border:0;background:none;cursor:pointer;
  color:var(--faint);font-size:.95rem;line-height:1;padding:2px 4px}
.psm-dash .denied button:hover{color:var(--ink)}

.psm-dash .pa{display:flex;flex-direction:column;gap:12px;border-top:1px solid var(--line);padding-top:15px}
.psm-dash .pa-head{display:flex;flex-direction:column;gap:2px}
.psm-dash .pa-head .pa-sub{color:var(--txt-2);font-size:.86rem;margin:0}

/* colored icon tiles — the shell defines b/t/g/p; we re-state them so the
   dashboard block is self-contained (identical values, no conflict). */
.psm-dash .ci.b{background:var(--primary-tint);color:var(--primary-600)}
.psm-dash .ci.t{background:#d7f4f8;color:var(--teal)}
.psm-dash .ci.g{background:var(--gold-soft);color:#a9740b}
.psm-dash .ci.p{background:var(--purple-tint);color:var(--purple)}

/* Super-admin diagnostics live in a de-emphasized, collapsed-by-default
   "System" section at the very bottom. */
.psm-dash .sysbox{border:1px solid var(--line);border-radius:14px;background:var(--panel);box-shadow:var(--shadow-sm);overflow:hidden}
.psm-dash .sysbox>summary{display:flex;align-items:center;gap:11px;padding:12px 15px;cursor:pointer;list-style:none;font-family:var(--hd);font-weight:800;font-size:1rem;color:var(--ink)}
.psm-dash .sysbox>summary::-webkit-details-marker{display:none}
.psm-dash .sysbox>summary:hover{background:var(--panel-2)}
.psm-dash .sysbox .sys-ic{width:32px;height:32px;border-radius:9px;background:var(--panel-2);color:var(--txt-2);display:grid;place-items:center;flex:0 0 auto}
.psm-dash .sysbox .sys-ic svg{width:17px;height:17px}
.psm-dash .sysbox .sys-hint{color:var(--faint);font-family:var(--bd);font-weight:600;font-size:.8rem}
.psm-dash .sysbox .sys-chev{margin-left:auto;color:var(--faint);width:18px;height:18px;transition:transform .18s}
.psm-dash .sysbox[open] .sys-chev{transform:rotate(180deg)}
.psm-dash .sysgrid{display:flex;flex-direction:column;gap:12px;padding:0 15px 15px}
`;

export default function AdminDashboard() {
  const { isSuperAdmin, dispatch, profile } = useAppContext();

  // ── WHY YOU ARE SUDDENLY BACK HERE ────────────────────────────────
  //
  // requireSuperAdmin used to redirect to /dashboard and say nothing.
  // Walked on production 27-09 with the tenant's first employee admin:
  // /settings/plans, /settings/finance, /affiliates, /admins and
  // /reconciliation all bounced in silence. Nothing leaked -- and the
  // person is simply somewhere else now, with no idea why.
  //
  // It matters because the app SENDS them there: the verify dialog tells
  // an admin with no supplier fee to go to Settings, and the guard
  // bounces them off it without a word.
  //
  // window.location rather than useSearchParams: that hook drags a
  // Suspense boundary behind it, which is one of the few things only
  // `next build` catches (CLAUDE.md), and this is a one-shot notice that
  // does not need to survive anything.
  // The name as given, shortened only when it would not fit -- the same
  // rule the affiliate portal uses, and for the same reason: taking the
  // first word always turned "the affiliateking" into "Welcome back,
  // the" on production. A first word is only a first NAME when somebody
  // filled the field in that way.
  const firstName = (() => {
    const n = (profile?.full_name ?? "").trim();
    if (!n) return null;
    return n.length <= 18 ? n : n.split(/\s+/)[0];
  })();
  // Seeded on the profile, so two admins on the same day read different
  // lines, and it moves at midnight in their own clock.
  //
  // Two sets. The owner, 27-09: "super admin moet entrepreneur quotes,
  // wij zijn de founders van PSM. Admins zijn meeste customer service en
  // client success manager." Two different jobs and two different tired
  // -- the desk is tired of other people's problems, a founder is tired
  // of decisions nobody else can make.
  const quote = dailyQuote(
    profile?.id ?? null,
    undefined,
    isSuperAdmin ? "owner" : "desk",
  );

  const [denied, setDenied] = useState(false);
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get("denied") !== "owner") return;
      setDenied(true);
      // Take it back out, so a reload or a shared link does not repeat it.
      p.delete("denied");
      const q = p.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (q ? `?${q}` : ""),
      );
    } catch {
      // No URL to read is simply no notice.
    }
  }, []);
  const pending = usePendingCounts();
  // Owner-only: approving an affiliate or a referral is the owner's call.
  const affWaiting = useAffiliatesWaiting(profile?.tenant_id, !!isSuperAdmin);

  // ── DST, ON THE SCREEN PEOPLE ACTUALLY OPEN ──────────────────────
  //
  // The owner, 27-09: "op home scherm moet nog een grid voor admin DST
  // to fill in of iets."
  //
  // DST is typed in by hand, one week per customer, and nothing schedules
  // or chases it -- so a missed week is invisible until somebody happens
  // to open /dst. Which nobody does, because there is no reason to.
  // Here it is a queue like the others: a number, and it is gone again
  // the moment it is zero.
  //
  // Same reading and the same threshold as the DST screen itself
  // (lib/pure-dst-behind.ts), so the two can never disagree.
  const dstRows = useQuery({
    queryKey: ["dst-behind", profile?.tenant_id ?? ""],
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("dst_charges")
        .select("advertiser_id, period_start, period_end")
        .eq("tenant_id", profile!.tenant_id!)
        .order("period_end", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  // isPending, not isLoading: gated on the tenant, so a query that never
  // ran would otherwise report a confident zero weeks behind.
  const dstBehindCount = dstRows.isPending
    ? undefined
    : dstRows.isError
      ? null
      : dstBehind(dstRows.data ?? []).length;

  const queues: Queue[] = [
    // Only when somebody is actually behind. A card that says 0 every
    // day is a card people stop reading.
    ...(dstBehindCount === undefined || dstBehindCount === 0
      ? []
      : [
          {
            key: "dst",
            href: "/dst",
            icon: Landmark,
            ci: "g",
            count: dstBehindCount,
            label: "DST weeks to enter",
          } as Queue,
        ]),
    // ── A PRICE IS THE OWNER'S TO ANSWER ──────────────────────────
    //
    // Only shown to the owner, and only when somebody is actually
    // waiting: an employee admin cannot decide one, so a card they can
    // only look at is a card that teaches them to ignore cards.
    ...(isSuperAdmin && (pending.feeChangeRequests ?? 0) > 0
      ? [
          {
            key: "fee-changes",
            href: "/fee-changes",
            icon: Percent,
            ci: "p",
            count: pending.feeChangeRequests,
            label: "Fee changes to approve",
          } as Queue,
        ]
      : []),
    {
      key: "wallet-topups",
      href: "/wallet-topups",
      icon: Upload,
      ci: "b",
      count: pending.walletTopups,
      label: "Wallet topups to verify",
    },
    {
      // Its own card, because it is its own thing: money that arrived in
      // the bank and nobody has claimed. It used to be added into the
      // card above, which then read 5 on a tenant with no top-ups
      // waiting at all.
      //
      // ── AND IT IS NOT THE JOB ─────────────────────────────────────
      //
      // The owner, 27-09: "bank deposits to match lijkt mij lelijk op
      // homescreen, onnodig? want we hebben toch wallet topups to
      // verify, daar gaat het om toch?"
      //
      // Right, and the numbers say so. Of 336 deposits in the feed
      // exactly ONE has ever matched a top-up -- correctly, because the
      // references on the rest are the OLD system's client codes
      // (docs/WISE_SETUP.md). So 59 of them sat at the top of this
      // screen under a blue badge, above five queues reading 0, and the
      // loudest number an admin saw on opening the app was the one
      // thing that was not their work.
      //
      // Not removed, because money arriving with NO claim is real: a
      // customer paid and nobody noticed. That is a standing check, not
      // a queue -- so `soft`, and a label that says what it is.
      key: "bank-deposits",
      href: "/wallet-topups",
      icon: Landmark,
      ci: "t",
      count: pending.bankDeposits,
      label: "Bank money not yet placed",
      soft: true,
    },
    {
      key: "requests",
      href: "/ad-account-requests",
      icon: FileText,
      ci: "p",
      count: pending.adAccountRequests,
      label: "Ad-account requests",
    },
    {
      key: "ad-topups",
      href: "/top-ups",
      icon: Coins,
      ci: "t",
      count: pending.topUps,
      label: "Ad-account topups to verify",
    },
    // Money going OUT is the one queue a customer is actively waiting on,
    // and it was the only unmetered card in a section headed "what needs
    // your action right now". Its count spans all three tables the
    // /withdrawals screen shows.
    {
      key: "withdrawals",
      href: "/withdrawals",
      icon: Download,
      ci: "g",
      count: pending.withdrawals,
      label: "Withdrawal requests",
    },
    // ── MONEY ALREADY OWED TO US ──────────────────────────────────
    //
    // The owner, 28-09, on his own home screen: "op homescreen
    // admin/super admin niet echt zien waarbij we past due invoices
    // zien ofzo." Six queues about work coming IN, and nothing about
    // an invoice that has gone past its date. Measured that day: six
    // unpaid invoices on this tenant, all six with a due date, all six
    // past it -- and the only way to find them was to open /invoices
    // and pick Overdue from a filter.
    //
    // `soft`, like the bank deposits: it is a standing check rather
    // than a queue somebody empties, and it should not shout over the
    // queues that are somebody's actual shift. The link lands on
    // /invoices, where the Overdue filter is.
    {
      key: "overdue-invoices",
      href: "/invoices?status=overdue",
      icon: Receipt,
      ci: "r",
      count: pending.overdueInvoices,
      label: "Invoices past their due date",
      soft: true,
    },
    // Applications, "advertise too" requests and referrals waiting for
    // approval -- the exact rows of "Waiting for you" on /affiliates.
    ...(isSuperAdmin
      ? [
          {
            key: "affiliates",
            href: "/affiliates",
            icon: Gift,
            ci: "p",
            count: affWaiting.isPending ? null : affWaiting.data?.decisions ?? null,
            label: "Affiliates waiting for you",
          },
          // ── AN AFFILIATE WAITING FOR HIS MONEY ──────────────────
          //
          // Its own card, not added into the one above. That one is
          // decisions -- approve an application, approve a referral --
          // and this one is a bank transfer. The owner, 28-09, with
          // payout #4 sitting in the queue and nothing on his home
          // screen saying so: "bij super admin zie ik niks in wachtrij
          // qua job bijv affiliate payout pending ofzo".
          //
          // Owner only, like the queue itself: the policy on
          // affiliate_payouts has no admin branch, so an employee admin
          // would read 0 here whatever is waiting -- and a 0 that means
          // "you may not see this" is worse than no card.
          {
            key: "affiliate-payouts",
            href: "/affiliates?tab=payouts",
            icon: Download,
            ci: "t",
            count: affWaiting.isPending ? null : affWaiting.data?.payouts ?? null,
            label: "Affiliate payouts to pay",
          },
        ]
      : []),
    { key: "invoices", href: "/invoices", icon: Receipt, ci: "g", label: "Invoices" },
    { key: "subscriptions", href: "/subscriptions", icon: RefreshCw, ci: "b", label: "Subscriptions" },
    { key: "wallets", href: "/wallets", icon: Wallet, ci: "t", label: "Wallets" },

  ];

  return (
    <div className="psmview psm-dash">
      <style>{DASH_CSS}</style>

      {/* The invite moved up here. It used to sit on its own row under the
          banner, which cost a full line of a phone screen for one button,
          and the subtitle was long enough to wrap to two — so the header
          alone ate ~150px before a single queue was visible. */}
      <div className="phead">
        {/* ── WHO IS READING, AND ONE KIND LINE ────────────────────
            The owner, 27-09: "op home dashboard ook leuk en netjes
            Welcome Back en naam enz + miss een super mooie nette lieve
            aardige quote van de dag, elke admin moet een andere. Het
            zijn 100% vrouwelijke medewerkers bij ons momenteel die
            customer service doen, soms zijn ze vermoeid."

            "Dashboard / What needs your action right now" is a filing
            cabinet greeting somebody opens forty times a day.

            The quote is per person per day -- see lib/pure-daily-quote.ts
            for why the lines are warm but not written at women. It is
            only drawn when we know who is reading; a kind sentence
            addressed to nobody is worse than none. */}
        <div className="ptxt">
          <h1>
            {firstName ? (
              <>
                Welcome back, <b>{firstName}</b>
              </>
            ) : (
              "Dashboard"
            )}
          </h1>
          <p>{quote ?? "What needs your action right now."}</p>
        </div>
        {/* ── OWNER ONLY, LIKE EVERYTHING ELSE ABOUT INVITES ──────
            /invites is requireSuperAdmin and the sidebar entry is
            inside the isSuperAdmin block -- but this button had no
            gate at all and the API route behind it is apiRequireAdmin.
            So an employee admin could send a real invitation, creating
            a tenant member on acceptance, with pricing fields silently
            dropped server-side -- and then had no screen on which to
            see it, cancel it or resend it. /invites redirects them
            away and the sidebar entry is hidden.
            Either they get the list or they lose the button; the list
            is a pricing surface, so they lose the button. */}
        {isSuperAdmin ? (
          <button
            className="btn grad sm invite"
            onClick={() => dispatch("open-invite-user")}
          >
            <UserPlus /> <span className="ilab">New invite</span>
          </button>
        ) : null}
      </div>

      {denied ? (
        <div className="denied" role="status">
          <b>That screen is the account owner&rsquo;s.</b>
          <span>
            Prices, exchange rates, commission terms, the other admins and
            the books are theirs to change. Ask them, and everything else
            here stays yours.
          </span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDenied(false)}
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* The "N items need action" hero is GONE. It restated, in a sentence,
          exactly what the queue cards below show as badges — and those cards
          now sort work-first, so the answer to "who is waiting on me" is
          already the first thing on the screen. A banner that repeats the
          next row is a row of nothing, and it will only get emptier as
          standing actions arrive. The failed read still speaks: "we could
          not read the counts" is not something any card can say. */}
      <div className="attnrow">
        {pending.isError ? (
          /* Never claim "all caught up" off a failed read. The counts are
             unknown, not zero, and this banner is the one place an admin
             decides whether anyone is waiting on their money. */
          <div className="attn">
            <span className="ai">
              <Zap />
            </span>
            <div>
              <b>Couldn&apos;t load the queues</b>
              <div className="sub">
                This is NOT an empty queue — the counts could not be read.
                Reload, and open each queue to check.
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <h2>Queues</h2>
      <div className="qgrid">
        {/* Queues with work come FIRST. A fixed order is fine on a screen you
            read top to bottom, but this one is scanned for "who is waiting on
            me", and that answer should not be in position four. An unreadable
            count sorts with the work rather than with the empties: it might
            be work, and treating "unknown" as "nothing" is the mistake this
            whole screen is careful about elsewhere. Ties keep their declared
            order, so the layout does not shuffle on every refetch. */}
        {/* NOT WHILE IT IS STILL COUNTING. Sorting work-first is right, but
            the counts arrive a second after the page does — so the cards
            rendered in declared order, then visibly rearranged themselves
            under the cursor. A list that reorders after you have started
            reading it is worse than one that is briefly in the wrong order,
            and worse still if you were already reaching for a card.
            Declared order until the answer is known, then sorted once. */}
        {/* A SKELETON WHILE IT COUNTS, not the real cards with provisional
            values in them. Rendering the cards first and letting the counts
            arrive a second later meant the badges appeared, the numbers
            changed and the tints flipped from quiet grey to brand colour —
            a screen that rearranges its own colours while you are reading
            it. One transition, from obviously-loading to done, is calmer
            and more honest than three small ones that each look like a bug.

            The skeleton has the same number of rows at the same height, so
            nothing below it moves when the real cards replace it. */}
        {/* ── THE LABELS DO NOT WAIT FOR THE COUNTS ────────────────
            The owner, 27-09, on a refresh: "bij refresh blijft die queue
            heel lang laden."

            usePendingCounts is ONE query that Promise.alls eight counts,
            so every card waited for the slowest -- and the skeleton hid
            the icons and the labels too. For those seconds an admin
            could not see which queues exist, let alone click into one.
            The DST card rendered straight away because it has its own
            read, which is exactly what made the wait visible.

            The reasoning for one transition still holds, and it was
            about the BADGE: a number appearing and a tint flipping from
            grey to brand while you read is worse than a single change.
            So the badge keeps its placeholder; the card around it does
            not. You can read and click immediately, and the only thing
            that moves is the one thing that was genuinely unknown.

            The sort has to wait too -- ordering by counts we do not have
            would shuffle the cards under the reader's finger the moment
            they land. Declared order until then. */}
        {(pending.isPending
          ? queues
          : [...queues].sort((a, b) => {
            // A soft card is a standing check, not somebody waiting, so
            // it sorts below every real queue -- including the empty
            // ones. Its 59 legacy deposits were pushing five queues that
            // actually need a person off the top of the screen.
            const weight = (q: Queue) => {
              if (q.soft) return 0;
              const c = q.count;
              return c === undefined ? 1 : c === null ? 3 : c > 0 ? 3 : 2;
            };
            return weight(b) - weight(a);
          })
        )
          .map((q) => {
          const Icon = q.icon;
          // A queue that declares a count still has one when it is null —
          // null means "we could not read it", and that must render as the
          // dash, not vanish into a card that looks like it never had a badge.
          const hasCount = q.count !== undefined;
          return (
            /* One structure for all five. Two of them carried no count and
               were built differently — a different element, a different
               size, a different height — which is the first thing the eye
               catches in a row of cards. The count moves to a badge on the
               right: present only when there is work, so the screen reads
               as "what needs me" at a glance instead of three large zeros
               repeating what the banner above already says. */
            <Link key={q.key} href={q.href} className="qcard">
              <span className={`qi ci ${q.ci}`}>
                <Icon />
              </span>
              <span className="ql">{q.label}</span>
              {pending.isPending ? (
                /* Still counting. A quiet block, the same size as the
                   badge, so nothing moves when the number lands. */
                <span className="qbadge skel" aria-hidden="true" />
              ) : hasCount ? (
                /* Per-queue, deliberately: pending.isError is true when ANY
                   of the three failed, so testing it here would put a dash on
                   two queues whose counts came back perfectly well. */
                q.count === null ? (
                  <span className="qbadge unknown" title="Could not read the count">
                    —
                  </span>
                ) : (
                  /* The number is ALWAYS shown — zero is information too, and
                     an absent badge would be indistinguishable from a queue
                     that has no count at all. Zero recedes into a quiet chip;
                     anything above it takes the brand colour so real work is
                     what your eye lands on. */
                  <span
                    className={`qbadge${(q.count as number) === 0 ? " zero" : ""}`}
                  >
                    {q.count}
                  </span>
                )
              ) : null}
              <ArrowRight className="go" />
            </Link>
          );
          })}
      </div>

      {/* Real profit + activity metrics with the period toggle, grouped as one
          cohesive section. The wired DashboardStatsCards carries its own
          admin/super-admin gating and renders the hero + control + metrics. */}
      <section className="pa">
        {/* ── THE HEADING HAS TO MATCH WHAT IS UNDER IT ───────────
            "Profit & activity / Revenue, fees and growth at a glance"
            went to everybody. An employee admin has no profit tile, no
            fee tile and no commission tile under it -- those three are
            apiRequireOwner at the source and were taken off this grid
            on purpose. So the first thing they read was a promise of
            three figures the app will not show them, over a panel
            already correctly labelled "Activity".

            The owner, 27-09: "medewerker admin mag geen profit zien,
            alleen wel aantal topups en totaal topups, en wallet topups,
            exchanges ook, en subscriptions ook, en extra ad accounts
            ook." That is exactly what the grid carries; only the words
            above it disagreed. */}
        <div className="pa-head">
          <h2>{isSuperAdmin ? "Profit & activity" : "Activity"}</h2>
          <p className="pa-sub">
            {isSuperAdmin
              ? "Revenue, fees and growth at a glance."
              : "Top-ups, exchanges and subscriptions at a glance."}
          </p>
        </div>
        <DashboardStatsCards />
      </section>

      {/* Super-admin-only diagnostics — de-emphasized in a collapsed-by-default
          "System" section at the bottom. Wiring is unchanged; the panels stay
          fully functional once expanded. */}
      {isSuperAdmin && (
        <details className="sysbox">
          <summary>
            <span className="sys-ic">
              <Server />
            </span>
            <span>System</span>
            <span className="sys-hint">Status &amp; rate limits</span>
            <ChevronDown className="sys-chev" />
          </summary>
          <div className="sysgrid">
            <SystemStatusPanel />
            <RateLimitsView />
          </div>
        </details>
      )}
    </div>
  );
}
