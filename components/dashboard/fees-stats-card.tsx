"use client";

import { Percent } from "lucide-react";

import { useQuery } from "@tanstack/react-query";

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
  getPeriodRange,
} from "@/lib/dashboard-period";
import { formatCurrency } from "@/lib/utils";

type FeeSeriesPoint = {
  bucket_start: string;
  bucket_end: string;
  label: string;
  usd_amount: number;
  eur_amount: number;
  usd_count: number;
  eur_count: number;
  count: number;
};

type FeesStatsResponse = {
  range: { from: string; to: string };
  granularity: "hour" | "day" | "week" | "month";
  totals: {
    count: number;
    usd: { amount: number; count: number };
    eur: { amount: number; count: number };
  };
  series: FeeSeriesPoint[];
};

async function fetchFeesStats(
  period: DashboardPeriod,
  dateRange?: DashboardDateRange,
): Promise<FeesStatsResponse> {
  const { from, to } = getPeriodRange(period, dateRange);
  const searchParams = new URLSearchParams({ from, to });
  const res = await fetch(`/api/stats/fees?${searchParams.toString()}`);
  if (!res.ok) {
    throw new Error("Failed to fetch fees stats");
  }
  return res.json();
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.floor(value));
}

export function FeesStatsCard({
  period,
  dateRange,
}: {
  period: DashboardPeriod;
  dateRange?: DashboardDateRange;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: [
      "stats",
      "fees",
      period,
      dateRange?.from?.toISOString(),
      dateRange?.to?.toISOString(),
    ],
    queryFn: () => fetchFeesStats(period, dateRange),
    staleTime: 1000 * 60 * 5,
  });

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
          <span className="ci g">
            <Percent />
          </span>
          <span>Fees</span>
        </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex h-[72px] flex-col justify-end gap-2 px-1 pb-1">
            {/* A baseline, not a dashed box repeating the 0.00 above it.
                A quiet month is the normal state on this dashboard, and
                seven dashed rectangles made it look like seven faults. */}
            <div className="h-px w-full bg-border" />
            <span className="text-[11px] leading-none text-muted-foreground/70">
              Failed to load fees data
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
          <span className="ci g">
            <Percent />
          </span>
          <span>Fees <span>({formatNumber(data.totals.count)})</span></span>
        </CardDescription>
        <CardTitle className="text-2xl font-extrabold tracking-[-.02em] tabular-nums">
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
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0 px-4">
        <MiniTrend series={data.series} />
      </CardContent>
    </Card>
  );
}
