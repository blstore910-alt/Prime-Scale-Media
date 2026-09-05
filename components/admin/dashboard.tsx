"use client";

import { DashboardStatsCards } from "@/components/dashboard-stats-cards";
import RateLimitsView from "@/components/system-status/rate-limits-view";
import SystemStatusPanel from "@/components/system-status/system-status-panel";
import { useAppContext } from "@/context/app-provider";
import { usePendingCounts } from "@/hooks/use-pending-counts";
import {
  ArrowRight,
  Coins,
  Download,
  FileText,
  Gift,
  Receipt,
  RefreshCw,
  Upload,
  UserPlus,
  Wallet,
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

export default function AdminDashboard() {
  const { isSuperAdmin, dispatch } = useAppContext();
  const pending = usePendingCounts();

  const needsAction =
    pending.walletTopups + pending.topUps + pending.adAccountRequests;

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
    <>
      <div
        className="psmview"
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        <div className="phead">
          <div>
            <h1>Dashboard</h1>
            <p>Your operations at a glance — what needs action right now.</p>
          </div>
          <button
            className="btn"
            onClick={() => dispatch("open-invite-user")}
          >
            <UserPlus /> New invite
          </button>
        </div>

        {/* Needs-your-action hero */}
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 18,
            padding: 22,
            color: "#fff",
            background:
              "linear-gradient(135deg,#04050E,#0c1230 55%,#151d3f)",
            boxShadow: "0 22px 46px -26px rgba(20,30,80,.8)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: ".72rem",
              fontWeight: 700,
              letterSpacing: ".05em",
              textTransform: "uppercase",
              opacity: 0.85,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#63f0c1",
                display: "inline-block",
              }}
            />
            Needs your action
          </div>
          <div
            style={{
              fontFamily: "var(--font-jakarta)",
              fontWeight: 800,
              fontSize: "2.6rem",
              lineHeight: 1,
              margin: "8px 0 14px",
            }}
          >
            {needsAction}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
              gap: 10,
            }}
          >
            {[
              { l: "Topups to verify", n: pending.walletTopups },
              { l: "Ad-account topups", n: pending.topUps },
              { l: "Account requests", n: pending.adAccountRequests },
            ].map((b) => (
              <div
                key={b.l}
                style={{
                  background: "rgba(255,255,255,.1)",
                  border: "1px solid rgba(255,255,255,.18)",
                  borderRadius: 12,
                  padding: "11px 13px",
                }}
              >
                <span style={{ fontSize: ".72rem", opacity: 0.8 }}>{b.l}</span>
                <b
                  style={{
                    display: "block",
                    fontFamily: "var(--font-jakarta)",
                    fontSize: "1.3rem",
                    marginTop: 3,
                  }}
                >
                  {b.n}
                </b>
              </div>
            ))}
          </div>
        </div>

        <h2>Queues</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))",
            gap: 12,
          }}
        >
          {queues.map((q) => {
            const Icon = q.icon;
            return (
              <Link
                key={q.href}
                href={q.href}
                className="card"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 16,
                }}
              >
                <span
                  className={`ci ${q.ci}`}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    display: "grid",
                    placeItems: "center",
                    flex: "0 0 auto",
                  }}
                >
                  <Icon style={{ width: 18, height: 18 }} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-jakarta)",
                      fontWeight: 800,
                      fontSize: "1.2rem",
                    }}
                  >
                    {typeof q.count === "number" ? q.count : "→"}
                  </div>
                  <div style={{ color: "var(--faint)", fontSize: ".82rem" }}>
                    {q.label}
                  </div>
                </div>
                <ArrowRight
                  style={{ marginLeft: "auto", color: "var(--faint)" }}
                />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Real throughput + super-admin ops panels (existing components). */}
      <div style={{ marginTop: 18 }}>
        {isSuperAdmin && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <SystemStatusPanel />
            <RateLimitsView />
          </div>
        )}
        <DashboardStatsCards />
      </div>
    </>
  );
}
