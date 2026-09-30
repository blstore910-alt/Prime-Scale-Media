"use client";

import { UserPlus } from "lucide-react";

import { useStatsDataset } from "@/hooks/use-stats-batch";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MiniTrendCounts } from "@/components/dashboard/mini-trend";
import {
  DashboardDateRange,
  DashboardPeriod,
} from "@/lib/dashboard-period";

type RegistrationSeriesPoint = {
  bucket_start: string;
  bucket_end: string;
  label: string;
  advertisers_count: number;
  affiliates_count: number;
  count: number;
};

type RegistrationsStatsResponse = {
  range: { from: string; to: string };
  granularity: "hour" | "day" | "week" | "month";
  totals: {
    advertisers: number;
    affiliates: number;
  };
  series: RegistrationSeriesPoint[];
};


function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.floor(value));
}

export function RegistrationsStatsCard({
  period,
  dateRange,
}: {
  period: DashboardPeriod;
  dateRange?: DashboardDateRange;
}) {
  // One shared batched request feeds every card on this dashboard —
  // see hooks/use-stats-batch.ts for why.
  const { data, isLoading, isError } = useStatsDataset<RegistrationsStatsResponse>(
    "registrations",
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
          <span className="ci i">
            <UserPlus />
          </span>
          <span title="New advertisers / new affiliates">Sign-ups</span>
        </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex h-[72px] flex-col justify-end gap-2 px-1 pb-1">
            {/* A baseline, not a dashed box repeating the 0.00 above it.
                A quiet month is the normal state on this dashboard, and
                seven dashed rectangles made it look like seven faults. */}
            <div className="h-px w-full bg-border" />
            <span className="text-[11px] leading-none text-muted-foreground/70">
              Failed to load registrations data
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
          <span className="ci i">
            <UserPlus />
          </span>
          <span title="New advertisers / new affiliates">Sign-ups</span>
        </CardDescription>
        <CardTitle className="text-2xl font-extrabold tracking-[-.02em] tabular-nums">
          <span>{formatNumber(data.totals.advertisers)}</span>
          <span className="mx-2">/</span>
          <span>{formatNumber(data.totals.affiliates)}</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0 px-4">
        <MiniTrendCounts series={data.series} />
      </CardContent>
    </Card>
  );
}
