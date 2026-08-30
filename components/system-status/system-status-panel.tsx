"use client";

import Link from "next/link";
import { useSystemStatus } from "./use-system-status";
import { useAppVersion } from "@/hooks/use-app-version";
import { useMaintenanceStatus } from "@/hooks/use-maintenance-status";
import { AlertOctagon, Users, ScrollText, Wallet, Building, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import WalletRecoveryDialog from "@/components/wallets/wallet-recovery-dialog";

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
      href: "/admins",
    },
    {
      key: "audit-24h",
      label: "Audit events (24h)",
      value: status.data?.auditEvents24h,
      icon: ScrollText,
      href: "/audit",
    },
    {
      key: "pending-wallet",
      label: "Wallet topups pending",
      value: status.data?.pendingWalletTopups,
      icon: Wallet,
      href: "/wallet-topups",
      alert: (status.data?.pendingWalletTopups ?? 0) > 0,
    },
    {
      key: "pending-topups",
      label: "Top-ups pending",
      value: status.data?.pendingTopUps,
      icon: Coins,
      href: "/top-ups",
      alert: (status.data?.pendingTopUps ?? 0) > 0,
    },
    {
      key: "pending-ad-reqs",
      label: "Ad-account requests pending",
      value: status.data?.pendingAdRequests,
      icon: Building,
      href: "/ad-account-requests",
      alert: (status.data?.pendingAdRequests ?? 0) > 0,
    },
  ];

  return (
    <section className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold leading-none">System status</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Refreshes every minute.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          {maintenance && (
            <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
              <AlertOctagon className="h-3 w-3" />
              Maintenance mode
            </span>
          )}
          {outdated && (
            <span className="inline-flex items-center gap-1 text-blue-600">
              New version available
            </span>
          )}
          <span className="font-mono text-muted-foreground">
            v{bootVersion ?? "…"}
          </span>
        </div>
      </div>

      <div className="flex justify-end">
        <WalletRecoveryDialog />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const val = tile.value ?? (status.isLoading ? "…" : 0);
          return (
            <Link
              key={tile.key}
              href={tile.href}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-3 hover:bg-accent transition-colors",
                tile.alert && "border-amber-500 bg-amber-50 dark:bg-amber-950/20",
              )}
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="h-4 w-4" />
                <span className="text-xs">{tile.label}</span>
              </div>
              <p
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  tile.alert && "text-amber-700 dark:text-amber-500",
                )}
              >
                {val}
              </p>
            </Link>
          );
        })}
      </div>

      {status.isError && (
        <p className="text-xs text-destructive">
          Failed to load system status:{" "}
          {status.error instanceof Error
            ? status.error.message
            : "unknown error"}
        </p>
      )}
    </section>
  );
}
