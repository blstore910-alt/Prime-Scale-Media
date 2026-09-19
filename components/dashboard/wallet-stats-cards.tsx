"use client";

import { ArrowLeftRight, Wallet } from "lucide-react";

import { useStatsDataset } from "@/hooks/use-stats-batch";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DashboardDateRange,
  DashboardPeriod,
} from "@/lib/dashboard-period";
import { formatCurrency } from "@/lib/utils";

// ── MONEY IN, AND MONEY MOVED BETWEEN CURRENCIES ─────────────────────
//
// The dashboard's "Topups" tile has always meant top_ups — a wallet
// paying an ad account. The wallet top-up an admin verifies against a
// bank slip, and the EUR/USD conversions customers make, were on no
// tile at all, so the screen that says how the business is doing said
// nothing about the money coming in.
//
// Both figures ride one dataset (/api/stats/wallet), so the pair costs
// the dashboard nothing extra.

type WalletStatsResponse = {
  range: { from: string; to: string };
  topups: { count: number; eur_amount: number; usd_amount: number };
  exchanges: { count: number; eur_amount: number; usd_amount: number };
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.floor(value));
}

/** One tile. Same shape as every other card in the grid. */
function Tile({
  label,
  title,
  tint,
  icon,
  count,
  usd,
  eur,
  quiet,
  isLoading,
  isError,
  failedLabel,
}: {
  label: string;
  title: string;
  tint: string;
  icon: React.ReactNode;
  count: number;
  usd: number;
  eur: number;
  quiet: string;
  isLoading: boolean;
  isError: boolean;
  failedLabel: string;
}) {
  const head = (
    <CardDescription className="psm-cardlbl">
      <span className={`ci ${tint}`}>{icon}</span>
      <span title={title}>{label}</span>
    </CardDescription>
  );

  if (isLoading) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <Skeleton className="mb-2 h-5 w-40" />
          <Skeleton className="h-8 w-56" />
        </CardHeader>
        <CardContent className="pt-0">
          <Skeleton className="h-[72px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="@container/card">
        <CardHeader>{head}</CardHeader>
        <CardContent className="pt-0">
          <div className="flex h-[72px] flex-col justify-end gap-2 px-1 pb-1">
            <div className="h-px w-full bg-border" />
            <span className="text-[11px] leading-none text-muted-foreground/70">
              {failedLabel}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="@container/card gap-2 py-4">
      <CardHeader className="pb-2">
        <CardDescription className="psm-cardlbl">
          <span className={`ci ${tint}`}>{icon}</span>
          <span title={title}>
            {label} <span>({formatNumber(count)})</span>
          </span>
        </CardDescription>
        <CardTitle className="text-2xl font-extrabold tracking-[-.02em] tabular-nums">
          <span>{formatCurrency(usd, "USD")}</span>
          <span className="mx-2">/</span>
          <span>{formatCurrency(eur, "EUR")}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4">
        <div className="flex h-[72px] flex-col justify-end gap-2 px-1 pb-1">
          <div className="h-px w-full bg-border" />
          <span className="text-[11px] leading-none text-muted-foreground/70">
            {count > 0 ? title : quiet}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function WalletTopupsStatsCard({
  period,
  dateRange,
}: {
  period: DashboardPeriod;
  dateRange?: DashboardDateRange;
}) {
  const { data, isLoading, isError } = useStatsDataset<WalletStatsResponse>(
    "wallet",
    period,
    dateRange,
  );
  return (
    <Tile
      label="Wallet in"
      title="Verified wallet top-ups in the selected period"
      tint="w"
      icon={<Wallet />}
      count={data?.topups.count ?? 0}
      usd={data?.topups.usd_amount ?? 0}
      eur={data?.topups.eur_amount ?? 0}
      quiet="No wallet top-ups verified in the selected period"
      isLoading={isLoading}
      isError={isError || !data}
      failedLabel="Failed to load wallet top-ups"
    />
  );
}

export function WalletExchangesStatsCard({
  period,
  dateRange,
}: {
  period: DashboardPeriod;
  dateRange?: DashboardDateRange;
}) {
  const { data, isLoading, isError } = useStatsDataset<WalletStatsResponse>(
    "wallet",
    period,
    dateRange,
  );
  return (
    <Tile
      label="Exchanges"
      title="Converted between wallet currencies, measured on the side that left"
      tint="p"
      icon={<ArrowLeftRight />}
      count={data?.exchanges.count ?? 0}
      usd={data?.exchanges.usd_amount ?? 0}
      eur={data?.exchanges.eur_amount ?? 0}
      quiet="No currency exchanges in the selected period"
      isLoading={isLoading}
      isError={isError || !data}
      failedLabel="Failed to load exchanges"
    />
  );
}
