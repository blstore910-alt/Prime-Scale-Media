"use client";

import { DashboardStatsCards } from "@/components/dashboard-stats-cards";
import RateLimitsView from "@/components/system-status/rate-limits-view";
import SystemStatusPanel from "@/components/system-status/system-status-panel";
import { useAppContext } from "@/context/app-provider";
import { usePendingCounts } from "@/hooks/use-pending-counts";
import {
  ArrowRight,
  ChevronDown,
  Coins,
  Download,
  FileText,
  Gift,
  Receipt,
  RefreshCw,
  Server,
  Upload,
  UserPlus,
  Wallet,
  Zap,
} from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Queue = {
  href: string;
  icon: LucideIcon;
  ci: string;
  /** null = unknown (not read). Distinct from 0. */
  count?: number | null;
  label: string;
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
/* The loading skeleton: the same card, with its contents as quiet blocks.
   Same height and same count as the real thing, so nothing below it moves
   when the answer arrives — the point is ONE transition instead of badges
   appearing, numbers changing and tints flipping one after another. */
.psm-dash .qcard.qskel{cursor:default;pointer-events:none}
.psm-dash .qcard.qskel .qi{background:var(--line);box-shadow:none}
.psm-dash .qcard.qskel .ql{height:12px;border-radius:6px;background:var(--line);flex:1 1 auto;max-width:180px}
.psm-dash .qcard.qskel .qbadge{width:26px;height:20px;background:var(--line);color:transparent;border:0}
.psm-dash .qcard.qskel .qi,
.psm-dash .qcard.qskel .ql,
.psm-dash .qcard.qskel .qbadge{animation:qpulse 1.1s ease-in-out infinite}
@keyframes qpulse{0%,100%{opacity:.55}50%{opacity:.95}}
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
.psm-dash .qcard:has(.qbadge:not(.zero)){border-color:#cfe0ff;background:linear-gradient(180deg,#fff,var(--primary-tint))}
.psm-dash .qcard:has(.qbadge:not(.zero))::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--primary)}
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
  const { isSuperAdmin, dispatch } = useAppContext();
  const pending = usePendingCounts();

  const queues: Queue[] = [
    {
      href: "/wallet-topups",
      icon: Upload,
      ci: "b",
      count: pending.walletTopups,
      label: "Wallet topups to verify",
    },
    {
      href: "/ad-account-requests",
      icon: FileText,
      ci: "p",
      count: pending.adAccountRequests,
      label: "Ad-account requests",
    },
    {
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
      href: "/withdrawals",
      icon: Download,
      ci: "g",
      count: pending.withdrawals,
      label: "Withdrawal requests",
    },
    { href: "/invoices", icon: Receipt, ci: "g", label: "Invoices" },
    { href: "/subscriptions", icon: RefreshCw, ci: "b", label: "Subscriptions" },
    { href: "/wallets", icon: Wallet, ci: "t", label: "Wallets" },
    { href: "/promotions", icon: Gift, ci: "p", label: "Promotions" },
  ];

  return (
    <div className="psmview psm-dash">
      <style>{DASH_CSS}</style>

      {/* The invite moved up here. It used to sit on its own row under the
          banner, which cost a full line of a phone screen for one button,
          and the subtitle was long enough to wrap to two — so the header
          alone ate ~150px before a single queue was visible. */}
      <div className="phead">
        <div className="ptxt">
          <h1>Dashboard</h1>
          <p>What needs your action right now.</p>
        </div>
        <button
          className="btn grad sm invite"
          onClick={() => dispatch("open-invite-user")}
        >
          <UserPlus /> <span className="ilab">New invite</span>
        </button>
      </div>

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
        {pending.isLoading
          ? queues.map((q) => (
              <div key={q.href} className="qcard qskel" aria-hidden="true">
                <span className="qi ci" />
                <span className="ql" />
                <span className="qbadge" />
              </div>
            ))
          : [...queues].sort((a, b) => {
            const weight = (c: number | null | undefined) =>
              c === undefined ? 0 : c === null ? 2 : c > 0 ? 2 : 1;
            return weight(b.count) - weight(a.count);
          })
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
            <Link key={q.href} href={q.href} className="qcard">
              <span className={`qi ci ${q.ci}`}>
                <Icon />
              </span>
              <span className="ql">{q.label}</span>
              {hasCount ? (
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
        <div className="pa-head">
          <h2>Profit &amp; activity</h2>
          <p className="pa-sub">Revenue, fees and growth at a glance.</p>
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
