"use client";

import { useStatsDataset } from "@/hooks/use-stats-batch";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
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

type SubscriptionsStatsResponse = {
  range: { from: string; to: string };
  granularity: "hour" | "day" | "week" | "month";
  totals: {
    count: number;
    usd: { amount: number; count: number };
    eur: { amount: number; count: number };
  };
  series: TopupSeriesPoint[];
};

const chartConfig = {
  usd_amount: {
    label: "USD",
    color: "var(--chart-2)",
  },
  eur_amount: {
    label: "EUR",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;


function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.floor(value));
}

export function SubscriptionsStatsCard({
  period,
  dateRange,
}: {
  period: DashboardPeriod;
  dateRange?: DashboardDateRange;
}) {
  // One shared batched request feeds every card on this dashboard —
  // see hooks/use-stats-batch.ts for why.
  const { data, isLoading, isError } = useStatsDataset<SubscriptionsStatsResponse>(
    "subscriptions",
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
          <CardDescription className="">Subscriptions</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex h-[72px] flex-col justify-end gap-2 px-1 pb-1">
            {/* A baseline, not a dashed box repeating the 0.00 above it.
                A quiet month is the normal state on this dashboard, and
                seven dashed rectangles made it look like seven faults. */}
            <div className="h-px w-full bg-border" />
            <span className="text-[11px] leading-none text-muted-foreground/70">
              Failed to load subscriptions data
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasAmountData = data.totals.count > 0;

  return (
    <Card className="@container/card gap-2 py-4">
      <CardHeader className="pb-2">
        <CardDescription className="font-semibold text-lg  text-card-foreground">
          Subscriptions <span>({formatNumber(data.totals.count)})</span>
        </CardDescription>
        <CardTitle className="text-2xl font-extrabold tracking-[-.02em] tabular-nums">
          <span>{formatCurrency(data.totals.usd.amount, "USD")}</span>
          <span className="mx-2">/</span>
          <span>{formatCurrency(data.totals.eur.amount, "EUR")}</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0 px-4">
        {hasAmountData ? (
          <div className="relative">
            <ChartContainer
              config={chartConfig}
              className="h-24 w-full aspect-auto rounded-sm bg-muted/20"
            >
              <BarChart
                data={data.series}
                barCategoryGap={"20%"}
                margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
              >
                <XAxis dataKey="label" hide />
                <CartesianGrid
                  vertical
                  horizontal={false}
                  stroke="var(--border)"
                  strokeOpacity={0.45}
                />
                <ChartTooltip
                  cursor={false}
                  content={(props) => {
                    const point = props.payload?.[0]?.payload as
                      | TopupSeriesPoint
                      | undefined;

                    if (!point || point.count <= 0) {
                      return null;
                    }

                    return (
                      <ChartTooltipContent
                        active={props.active}
                        payload={props.payload}
                        label={props.label}
                        hideIndicator
                        labelFormatter={(_, payload) => {
                          const currentPoint = payload?.[0]?.payload as
                            | TopupSeriesPoint
                            | undefined;
                          return currentPoint?.label ?? "";
                        }}
                        formatter={(value, name, item) => {
                          const currentPoint = item.payload as TopupSeriesPoint;
                          const isUsd = name === "usd_amount";
                          const currency = isUsd ? "USD" : "EUR";
                          const count = isUsd
                            ? currentPoint.usd_count
                            : currentPoint.eur_count;

                          return (
                            <div className="grid w-full gap-1">
                              <div className="flex items-center justify-between gap-4 font-semibold">
                                <span className="text-muted-foreground">
                                  {currency}
                                </span>
                                <span className="font-mono tabular-nums">
                                  {formatCurrency(Number(value) || 0, currency)}{" "}
                                  ({formatNumber(count)})
                                </span>
                              </div>
                            </div>
                          );
                        }}
                      />
                    );
                  }}
                />
                <Bar
                  dataKey="usd_amount"
                  fill="var(--color-usd_amount)"
                  radius={[4, 4, 2, 2]}
                  maxBarSize={32}
                />
                <Bar
                  dataKey="eur_amount"
                  fill="var(--color-eur_amount)"
                  radius={[4, 4, 2, 2]}
                  maxBarSize={32}
                />
              </BarChart>
            </ChartContainer>
          </div>
        ) : (
          <div className="flex h-[72px] flex-col justify-end gap-2 px-1 pb-1">
            {/* A baseline, not a dashed box repeating the 0.00 above it.
                A quiet month is the normal state on this dashboard, and
                seven dashed rectangles made it look like seven faults. */}
            <div className="h-px w-full bg-border" />
            <span className="text-[11px] leading-none text-muted-foreground/70">
              No subscriptions made in the selected period
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
