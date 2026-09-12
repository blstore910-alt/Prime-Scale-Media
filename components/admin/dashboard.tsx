"use client";

import { DashboardStatsCards } from "@/components/dashboard-stats-cards";
import RateLimitsView from "@/components/system-status/rate-limits-view";
import SystemStatusPanel from "@/components/system-status/system-status-panel";
import { useAppContext } from "@/context/app-provider";
import { usePendingCounts } from "@/hooks/use-pending-counts";
import {
  ArrowRight,
  CheckCircle2,
  Coins,
  Download,
  FileText,
  Gift,
  Receipt,
  RefreshCw,
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
.psm-dash{--purple-tint:#f3e8ff;display:flex;flex-direction:column;gap:16px}

.psm-dash .attn{display:flex;align-items:center;gap:13px;background:linear-gradient(135deg,var(--primary-tint),var(--purple-tint));border:1px solid #d9e2ff;border-radius:16px;padding:14px 16px;flex-wrap:wrap}
.psm-dash .attn .ai{width:38px;height:38px;border-radius:10px;background:#fff;display:grid;place-items:center;color:var(--primary-600);flex:0 0 auto}
.psm-dash .attn .ai svg{width:19px;height:19px}
.psm-dash .attn b{font-weight:800;font-family:var(--hd);font-size:1.02rem}
.psm-dash .attn .sub{color:var(--muted);font-size:.86rem;margin-top:2px}
.psm-dash .attn .cta{margin-left:auto;color:#fff}
.psm-dash .attn.ok{background:linear-gradient(135deg,var(--win-soft),#eafaf3);border-color:#bfe9d6}
.psm-dash .attn.ok .ai{color:var(--win)}

.psm-dash .qgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:12px}
.psm-dash .qcard{display:flex;align-items:center;gap:13px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:15px 16px;box-shadow:var(--shadow-sm);cursor:pointer;transition:.15s}
.psm-dash .qcard:hover{border-color:var(--primary);transform:translateY(-2px)}
.psm-dash .qcard .qi{width:42px;height:42px;border-radius:11px;display:grid;place-items:center;flex:0 0 auto}
.psm-dash .qcard .qi svg{width:18px;height:18px}
.psm-dash .qcard .qn{font-family:var(--hd);font-weight:800;font-size:1.15rem;line-height:1.1}
.psm-dash .qcard .qn.lbl{font-size:.98rem}
.psm-dash .qcard .ql{color:var(--muted);font-size:.84rem;margin-top:2px}
.psm-dash .qcard .go{margin-left:auto;color:var(--faint);width:18px;height:18px;flex:0 0 auto}

/* colored icon tiles — the shell defines b/t/g/p; we re-state them so the
   dashboard block is self-contained (identical values, no conflict). */
.psm-dash .ci.b{background:var(--primary-tint);color:var(--primary-600)}
.psm-dash .ci.t{background:#d7f4f8;color:var(--teal)}
.psm-dash .ci.g{background:var(--gold-soft);color:#a9740b}
.psm-dash .ci.p{background:var(--purple-tint);color:var(--purple)}

.psm-dash .sysgrid{display:flex;flex-direction:column;gap:16px}
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
        <button className="btn grad" onClick={() => dispatch("open-invite-user")}>
          <UserPlus /> New invite
        </button>
      </div>

      {/* Needs-your-action hero (mockup .attn) — real pending counts. */}
      {needsAction > 0 ? (
        <div className="attn">
          <span className="ai">
            <Zap />
          </span>
          <div>
            <b>
              {needsAction} {needsAction === 1 ? "item needs" : "items need"} action
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
      ) : (
        <div className="attn ok">
          <span className="ai">
            <CheckCircle2 />
          </span>
          <div>
            <b>You&apos;re all caught up</b>
            <div className="sub">
              No wallet topups, ad-account topups, or account requests are waiting.
            </div>
          </div>
        </div>
      )}

      <h2>Queues</h2>
      <div className="qgrid">
        {queues.map((q) => {
          const Icon = q.icon;
          const hasCount = typeof q.count === "number";
          return (
            <Link key={q.href} href={q.href} className="qcard">
              <span className={`qi ci ${q.ci}`}>
                <Icon />
              </span>
              {hasCount ? (
                <div>
                  <div className="qn">{q.count}</div>
                  <div className="ql">{q.label}</div>
                </div>
              ) : (
                <div>
                  <div className="qn lbl">{q.label}</div>
                </div>
              )}
              <ArrowRight className="go" />
            </Link>
          );
        })}
      </div>

      {/* Real profit + activity metrics with the period toggle. The wired
          DashboardStatsCards carries its own admin/super-admin gating. */}
      <h2>Profit &amp; activity</h2>
      <DashboardStatsCards />

      {/* Super-admin-only operational panels (unchanged wiring). */}
      {isSuperAdmin && (
        <>
          <h2>System</h2>
          <div className="sysgrid">
            <SystemStatusPanel />
            <RateLimitsView />
          </div>
        </>
      )}
    </div>
  );
}
