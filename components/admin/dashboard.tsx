"use client";

import { DashboardStatsCards } from "@/components/dashboard-stats-cards";
import RateLimitsView from "@/components/system-status/rate-limits-view";
import SystemStatusPanel from "@/components/system-status/system-status-panel";
import { useAppContext } from "@/context/app-provider";
import { usePendingCounts } from "@/hooks/use-pending-counts";
import {
  ArrowRight,
  CheckCircle2,
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
  count?: number;
  label: string;
};

// Dashboard-only classes ported verbatim from the approved mockup, scoped
// under .psm-dash so they can never leak to other pages. The shell already
// defines the design tokens (--primary, --panel, --line, --win, --purple,
// --navy*, --brand, --primary-tint, --muted, --faint, --shadow-sm …) on
// .psmapp — we reuse those and only fill the one tint the shell omits.
// Motion is covered by the shell's global prefers-reduced-motion rule
// (`.psmapp *{animation/transition:none}`), which our elements inherit.
const DASH_CSS = `
.psm-dash{--purple-tint:#f3e8ff;display:flex;flex-direction:column;gap:12px}

/* Needs-action hero and the New invite button share one row: hero grows,
   invite stays its natural (compact) size on the right. */
.psm-dash .attnrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.psm-dash .attnrow>.attn{flex:1 1 340px}
.psm-dash .attnrow>.invite{flex:0 0 auto}

.psm-dash .attn{display:flex;align-items:center;gap:11px;background:linear-gradient(135deg,var(--primary-tint),var(--purple-tint));border:1px solid #d9e2ff;border-radius:14px;padding:11px 14px;flex-wrap:wrap}
.psm-dash .attn .ai{width:34px;height:34px;border-radius:10px;background:#fff;display:grid;place-items:center;color:var(--primary-600);flex:0 0 auto}
.psm-dash .attn .ai svg{width:18px;height:18px}
.psm-dash .attn b{font-weight:800;font-family:var(--hd);font-size:1rem}
.psm-dash .attn .sub{color:var(--muted);font-size:.84rem;margin-top:1px}
.psm-dash .attn .cta{margin-left:auto;color:#fff}
/* "All caught up" is a compact one-liner: small check icon INLINE with the
   headline and its sub-line, not a tall block with the icon floating above. */
.psm-dash .attn.ok{background:linear-gradient(135deg,var(--win-soft),#eafaf3);border-color:#bfe9d6;padding:8px 13px;gap:9px}
.psm-dash .attn.ok .ai{width:26px;height:26px;border-radius:8px;color:var(--win)}
.psm-dash .attn.ok .ai svg{width:15px;height:15px}
.psm-dash .attn.ok b{font-size:.92rem}
.psm-dash .attn.ok .sub{margin-top:0}

.psm-dash .qgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(240px,100%),1fr));gap:10px}
.psm-dash .qcard{display:flex;align-items:center;gap:11px;background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:12px 14px;box-shadow:var(--shadow-sm);cursor:pointer;transition:.15s}
.psm-dash .qcard:hover{border-color:var(--primary);transform:translateY(-2px)}
.psm-dash .qcard .qi{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;flex:0 0 auto}
.psm-dash .qcard .qi svg{width:17px;height:17px}
.psm-dash .qcard .ql{flex:1;min-width:0;font-family:var(--hd);font-weight:700;font-size:.92rem;line-height:1.25;color:var(--ink)}
.psm-dash .qcard .qbadge{flex:0 0 auto;min-width:24px;height:24px;padding:0 8px;border-radius:99px;display:grid;place-items:center;background:var(--primary);color:#fff;font-family:var(--hd);font-weight:800;font-size:.78rem;font-variant-numeric:tabular-nums;box-shadow:0 6px 14px -8px rgba(58,111,255,.9)}
/* An unreadable count is not zero. It renders as a muted dash, never as a
   number, so "nothing to do" can only ever mean nothing to do. */
.psm-dash .qcard .qbadge.zero{background:var(--panel-2);color:var(--muted);box-shadow:none;border:1px solid var(--line)}
.psm-dash .qcard .qbadge.unknown{background:var(--panel-2);color:var(--faint);box-shadow:none;border:1px solid var(--line-2)}
.psm-dash .qcard .go{margin-left:auto;color:var(--faint);width:17px;height:17px;flex:0 0 auto}

/* Profit & activity — one cohesive section: header + hero + control + metrics.
   A top hairline bounds the section; header carries title + honest subtitle. */
.psm-dash .pa{display:flex;flex-direction:column;gap:12px;border-top:1px solid var(--line);padding-top:15px}
.psm-dash .pa-head{display:flex;flex-direction:column;gap:2px}
.psm-dash .pa-head .pa-sub{color:var(--muted);font-size:.86rem;margin:0}

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
.psm-dash .sysbox .sys-ic{width:32px;height:32px;border-radius:9px;background:var(--panel-2);color:var(--muted);display:grid;place-items:center;flex:0 0 auto}
.psm-dash .sysbox .sys-ic svg{width:17px;height:17px}
.psm-dash .sysbox .sys-hint{color:var(--faint);font-family:var(--bd);font-weight:600;font-size:.8rem}
.psm-dash .sysbox .sys-chev{margin-left:auto;color:var(--faint);width:18px;height:18px;transition:transform .18s}
.psm-dash .sysbox[open] .sys-chev{transform:rotate(180deg)}
.psm-dash .sysgrid{display:flex;flex-direction:column;gap:12px;padding:0 15px 15px}
`;

export default function AdminDashboard() {
  const { isSuperAdmin, dispatch } = useAppContext();
  const pending = usePendingCounts();

  const needsAction =
    pending.walletTopups + pending.topUps + pending.adAccountRequests;

  // Jump the "needs action" CTA to the most urgent non-empty queue.
  const primaryQueue =
    pending.walletTopups > 0
      ? "/wallet-topups"
      : pending.adAccountRequests > 0
        ? "/ad-account-requests"
        : pending.topUps > 0
          ? "/top-ups"
          : null;

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
    { href: "/withdrawals", icon: Download, ci: "g", label: "Withdrawal requests" },
    { href: "/invoices", icon: Receipt, ci: "g", label: "Invoices" },
    { href: "/subscriptions", icon: RefreshCw, ci: "b", label: "Subscriptions" },
    { href: "/wallets", icon: Wallet, ci: "t", label: "Wallets" },
    { href: "/promotions", icon: Gift, ci: "p", label: "Promotions" },
  ];

  return (
    <div className="psmview psm-dash">
      <style>{DASH_CSS}</style>

      <div className="phead">
        <div>
          <h1>Dashboard</h1>
          <p>Your operations at a glance — what needs action right now.</p>
        </div>
      </div>

      {/* Needs-your-action hero (mockup .attn) + New invite share one row —
          real pending counts; the invite is a normal, compact button. */}
      <div className="attnrow">
        {needsAction > 0 ? (
          <div className="attn">
            <span className="ai">
              <Zap />
            </span>
            <div>
              <b>
                {needsAction} {needsAction === 1 ? "item needs" : "items need"}{" "}
                action
              </b>
              <div className="sub">
                {pending.walletTopups} wallet topups · {pending.topUps} ad-account
                topups · {pending.adAccountRequests} account requests
              </div>
            </div>
            {primaryQueue && (
              <Link className="btn sm cta" href={primaryQueue}>
                Open queue <ArrowRight />
              </Link>
            )}
          </div>
        ) : pending.isError ? (
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
        ) : (
          <div className="attn ok">
            <span className="ai">
              <CheckCircle2 />
            </span>
            <b>You&apos;re all caught up</b>
            <span className="sub">
              No wallet topups, ad-account topups, or account requests are waiting.
            </span>
          </div>
        )}
        <button
          className="btn grad sm invite"
          onClick={() => dispatch("open-invite-user")}
        >
          <UserPlus /> New invite
        </button>
      </div>

      <h2>Queues</h2>
      <div className="qgrid">
        {queues.map((q) => {
          const Icon = q.icon;
          const hasCount = typeof q.count === "number";
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
                pending.isError ? (
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
