"use client";

import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, XAxis } from "recharts";

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
  getPeriodRange,
} from "@/lib/dashboard-period";
import { formatCurrency } from "@/lib/utils";

type ProfitSeriesPoint = {
  bucket_start: string;
  bucket_end: string;
  label: string;
  profit: number;
  count: number;
};

type ProfitStatsResponse = {
  range: { from: string; to: string };
  granularity: "hour" | "day" | "week" | "month";
  totals: {
    profit: number;
    count: number;
  };
  series: ProfitSeriesPoint[];
};

const chartConfig = {
  profit: {
    label: "Profit",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

async function fetchProfitStats(
  period: DashboardPeriod,
  dateRange?: DashboardDateRange,
): Promise<ProfitStatsResponse> {
  const { from, to } = getPeriodRange(period, dateRange);
  const searchParams = new URLSearchParams({ from, to });
  const res = await fetch(`/api/stats/profit?${searchParams.toString()}`);
  if (!res.ok) {
    throw new Error("Failed to fetch profit stats");
  }
  return res.json();
}

export function ProfitStatsCard({
  period,
  dateRange,
}: {
  period: DashboardPeriod;
  dateRange?: DashboardDateRange;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: [
      "stats",
      "profit",
      period,
      dateRange?.from?.toISOString(),
      dateRange?.to?.toISOString(),
    ],
    queryFn: () => fetchProfitStats(period, dateRange),
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
          <CardDescription className="">Total Profit</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex h-[72px] items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            Failed to load profit data
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasAmountData = data.series.length > 0;

  return (
    <Card className="@container/card gap-2 py-4">
      <CardHeader className="pb-2">
        <CardDescription className="font-semibold text-card-foreground">
          Profits
        </CardDescription>
        <CardTitle className=" text-xl font-semibold tabular-nums">
          {formatCurrency(data.totals.profit)}
        </CardTitle>
        <p className="line-clamp-1 flex gap-2 text-sm font-medium text-muted-foreground">
          Net Profit
        </p>
      </CardHeader>

      <CardContent className="pt-0 px-4">
        {hasAmountData ? (
          <div className="relative">
            <ChartContainer
              config={chartConfig}
              className="h-24 w-full aspect-auto rounded-sm bg-muted/20"
            >
              <LineChart
                data={data.series}
                margin={{ top: 6, right: 4, left: 4, bottom: 4 }}
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
                      | ProfitSeriesPoint
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
                            | ProfitSeriesPoint
                            | undefined;
                          return currentPoint?.label ?? "";
                        }}
                        formatter={(value) => {
                          return (
                            <div className="grid w-full gap-1">
                              <div className="flex items-center justify-between gap-4 font-semibold">
                                <span className="text-muted-foreground">
                                  Profit
                                </span>
                                <span className="font-mono tabular-nums">
                                  {formatCurrency(Number(value) || 0)}
                                </span>
                              </div>
                            </div>
                          );
                        }}
                      />
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  stroke="var(--color-profit)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ChartContainer>
          </div>
        ) : (
          <div className="flex h-[72px] items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            No profit data in the selected period
          </div>
        )}
      </CardContent>
    </Card>
  );
}
