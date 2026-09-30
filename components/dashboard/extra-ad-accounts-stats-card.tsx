"use client";

import { Megaphone } from "lucide-react";

import { useStatsDataset } from "@/hooks/use-stats-batch";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MiniTrend } from "@/components/dashboard/mini-trend";
import { moneyLines } from "@/lib/pure-money-lines";
import {
  DashboardDateRange,
  DashboardPeriod,
} from "@/lib/dashboard-period";
import { formatCurrency } from "@/lib/utils";

type TopupSeriesPoint = {
  bucket_start: string;
  bucket_end: string;
  label: string;
  usd_amount: number;
  eur_amount: number;
  usd_count: number;
  eur_count: number;
  count: number;
};

type ExtraAdAccountsStatsResponse = {
  range: { from: string; to: string };
  granularity: "hour" | "day" | "week" | "month";
  totals: {
    count: number;
    usd: { amount: number; count: number };
    eur: { amount: number; count: number };
  };
  series: TopupSeriesPoint[];
};


function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.floor(value));
}

export function ExtraAdAccountsStatsCard({
  period,
  dateRange,
  amounts,
}: {
  period: DashboardPeriod;
  dateRange?: DashboardDateRange;
  /** false on an employee admin's dashboard -- see Tile. */
  amounts?: boolean;
}) {
  // One shared batched request feeds every card on this dashboard —
  // see hooks/use-stats-batch.ts for why.
  const { data, isLoading, isError } = useStatsDataset<ExtraAdAccountsStatsResponse>(
    "extra-ad-accounts",
    period,
    dateRange,
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

  if (isError || !data) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <CardDescription className="psm-cardlbl">
          <span className="ci p">
            <Megaphone />
          </span>
          <span>Extra accounts</span>
        </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex h-[72px] flex-col justify-end gap-2 px-1 pb-1">
            {/* A baseline, not a dashed box repeating the 0.00 above it.
                A quiet month is the normal state on this dashboard, and
                seven dashed rectangles made it look like seven faults. */}
            <div className="h-px w-full bg-border" />
            <span className="text-[11px] leading-none text-muted-foreground/70">
              Failed to load extra ad accounts data
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="@container/card gap-2 py-4">
      <CardHeader className="pb-2">
        {/* ── THE FIGURE IS THE HEADLINE ──────────────────────────
            The label was text-lg semibold in the card's own ink, above a
            figure at text-xl — so the two competed and the card read as
            a heading with a number under it rather than as a number.
            Small, quiet label; the figure carries the weight. */}
        <CardDescription className="psm-cardlbl">
          <span className="ci p">
            <Megaphone />
          </span>
          <span>Extra accounts <span>({formatNumber(data.totals.count)})</span></span>
        </CardDescription>
        <CardTitle className="text-2xl font-extrabold tracking-[-.02em] tabular-nums">
          {amounts === false ? (
            // Counts, not money, on an employee admin's
            // dashboard -- see the Tile note in
            // wallet-stats-cards.tsx.
            <span>{formatNumber(data.totals.count)}</span>
          ) : (
            <>
          {/* Alleen de valuta waar die periode iets in gebeurd is. Zie
                  lib/pure-money-lines.ts: de TELLING beslist of de regel
                  er staat, niet het bedrag, zodat een echte nul blijft
                  staan en een ongebruikte valuta verdwijnt. */}
              {moneyLines(data.totals.usd, data.totals.eur).flatMap((l, i) =>
                i === 0
                  ? [
                      <span key={l.currency}>
                        {formatCurrency(l.amount, l.currency)}
                      </span>,
                    ]
                  : [
                      <span key={l.currency + "-sep"} className="mx-2">
                        /
                      </span>,
                      <span key={l.currency}>
                        {formatCurrency(l.amount, l.currency)}
                      </span>,
                    ],
              )}
            </>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0 px-4">
        <MiniTrend series={data.series} amounts={amounts !== false} />
      </CardContent>
    </Card>
  );
}
