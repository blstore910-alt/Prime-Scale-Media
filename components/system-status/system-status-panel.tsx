"use client";

import Link from "next/link";
import { useSystemStatus } from "./use-system-status";
import { useAppVersion } from "@/hooks/use-app-version";
import { useMaintenanceStatus } from "@/hooks/use-maintenance-status";
import { AlertOctagon, Users, ScrollText, Wallet, Building, Coins } from "lucide-react";
import WalletRecoveryDialog from "@/components/wallets/wallet-recovery-dialog";

// Mockup-only classes (metric tiles + panel chrome), scoped under .psm-sys so
// they never leak. The admin shell injects the design tokens on .psmapp; we
// reuse those (--panel, --line, --primary-tint, --win, --warn, --txt-2,
// --faint, --shadow-sm/-shadow …) and only add the one tint the shell omits.
// Rule bodies mirror the approved super-admin mockup's .metric / .ci tiles.
const SYS_CSS = `
.psm-sys{--purple-tint:#f3e8ff}
.psm-sys .syshead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.psm-sys .syssub{color:var(--txt-2);font-size:.82rem;margin:5px 0 0}
.psm-sys .sysmeta{display:flex;flex-direction:column;align-items:flex-end;gap:6px;font-size:.78rem}
.psm-sys .sysmeta .badge svg{width:13px;height:13px}
.psm-sys .ver{font-family:ui-monospace,Menlo,monospace;color:var(--faint)}

.psm-sys .sgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.psm-sys .metric{display:block;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 15px;box-shadow:var(--shadow-sm);transition:transform .15s,box-shadow .15s,border-color .15s}
.psm-sys .metric:hover{transform:translateY(-2px);box-shadow:var(--shadow);border-color:var(--primary)}
.psm-sys .metric .k{display:flex;align-items:center;gap:8px;font-size:.72rem;font-weight:600;color:var(--faint);min-height:2.4em}
.psm-sys .metric .v{font-family:var(--hd);font-weight:800;font-size:1.6rem;margin-top:8px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.psm-sys .metric.alert{border-color:var(--warn);background:var(--warn-soft)}
.psm-sys .metric.alert .k{color:#9a7420}
.psm-sys .metric.alert .v{color:#8a5a00}

.psm-sys .ci{width:26px;height:26px;border-radius:8px;display:inline-grid;place-items:center;flex:0 0 auto}
.psm-sys .ci svg{width:15px;height:15px}
.psm-sys .ci.b{background:var(--primary-tint);color:var(--primary-600)}
.psm-sys .ci.t{background:#d7f4f8;color:var(--teal)}
.psm-sys .ci.g{background:var(--gold-soft);color:#a9740b}
.psm-sys .ci.p{background:var(--purple-tint);color:var(--purple)}
.psm-sys .metric.alert .ci{background:#fff;color:var(--warn)}

.psm-sys .sysact{display:flex;justify-content:flex-end;margin-top:14px}
.psm-sys .syserr{color:var(--danger);font-size:.8rem;margin-top:10px}

@media (max-width:900px){.psm-sys .sgrid{grid-template-columns:repeat(2,1fr)}}
@media (max-width:520px){.psm-sys .sgrid{grid-template-columns:1fr}}
`;

/**
 * Super-admin operational panel. Refreshes every 60 seconds via
 * useSystemStatus. Answers the three questions an operator asks first:
 *   1. Is anything requiring my attention right now? (pending queues)
 *   2. Are people using the app? (active admins, audit throughput)
 *   3. What version + mode are we in? (version, maintenance)
 */
export default function SystemStatusPanel() {
  const status = useSystemStatus();
  const { bootVersion, outdated } = useAppVersion();
  const { maintenance } = useMaintenanceStatus();

  const tiles = [
    {
      key: "active-admins",
      label: "Active admins (24h)",
      value: status.data?.activeAdmins24h,
      icon: Users,
      ci: "b",
      href: "/admins",
    },
    {
      key: "audit-24h",
      label: "Audit events (24h)",
      value: status.data?.auditEvents24h,
      icon: ScrollText,
      ci: "p",
      href: "/audit",
    },
    {
      key: "pending-wallet",
      label: "Wallet topups pending",
      value: status.data?.pendingWalletTopups,
      icon: Wallet,
      ci: "t",
      href: "/wallet-topups",
      alert: (status.data?.pendingWalletTopups ?? 0) > 0,
    },
    {
      key: "pending-topups",
      label: "Top-ups pending",
      value: status.data?.pendingTopUps,
      icon: Coins,
      ci: "g",
      href: "/top-ups",
      alert: (status.data?.pendingTopUps ?? 0) > 0,
    },
    {
      key: "pending-ad-reqs",
      label: "Ad-account requests pending",
      value: status.data?.pendingAdRequests,
      icon: Building,
      ci: "b",
      href: "/ad-account-requests",
      alert: (status.data?.pendingAdRequests ?? 0) > 0,
    },
  ];

  return (
    <section className="psm-sys card">
      <style>{SYS_CSS}</style>

      <div className="syshead">
        <div>
          <h2>System status</h2>
          <p className="syssub">Refreshes every minute.</p>
        </div>
        <div className="sysmeta">
          {maintenance && (
            <span className="badge pend">
              <AlertOctagon />
              Maintenance mode
            </span>
          )}
          {outdated && <span className="badge info">New version available</span>}
          <span className="ver">v{bootVersion ?? "…"}</span>
        </div>
      </div>

      <div className="sgrid">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const val = tile.value ?? (status.isLoading ? "…" : 0);
          return (
            <Link
              key={tile.key}
              href={tile.href}
              className={`metric${tile.alert ? " alert" : ""}`}
            >
              <div className="k">
                <span className={`ci ${tile.ci}`}>
                  <Icon />
                </span>
                {tile.label}
              </div>
              <div className="v">{val}</div>
            </Link>
          );
        })}
      </div>

      <div className="sysact">
        <WalletRecoveryDialog />
      </div>

      {status.isError && (
        <p className="syserr">
          Failed to load system status:{" "}
          {status.error instanceof Error
            ? status.error.message
            : "unknown error"}
        </p>
      )}
    </section>
  );
}
