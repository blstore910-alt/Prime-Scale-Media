"use client";

import { useQuery } from "@tanstack/react-query";
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
  getPeriodRange,
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

const chartConfig = {
  advertisers_count: {
    label: "Advertisers",
    color: "var(--chart-2)",
  },
  affiliates_count: {
    label: "Affiliates",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

async function fetchRegistrationsStats(
  period: DashboardPeriod,
  dateRange?: DashboardDateRange
): Promise<RegistrationsStatsResponse> {
  const { from, to } = getPeriodRange(period, dateRange);
  const searchParams = new URLSearchParams({ from, to });
  const res = await fetch(`/api/stats/registrations?${searchParams.toString()}`);
  if (!res.ok) {
    throw new Error("Failed to fetch registrations stats");
  }
  return res.json();
}

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
  const { data, isLoading, isError } = useQuery({
    queryKey: [
      "stats",
      "registrations",
      period,
      dateRange?.from?.toISOString(),
      dateRange?.to?.toISOString(),
    ],
    queryFn: () => fetchRegistrationsStats(period, dateRange),
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
          <CardDescription className="">Advertisers / Affiliates</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex h-[72px] items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            Failed to load registrations data
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasData = data.series.length > 0;

  return (
    <Card className="@container/card gap-2 py-4">
      <CardHeader className="pb-2">
        <CardDescription className="font-semibold text-card-foreground">
          Advertisers / Affiliates
        </CardDescription>
        <CardTitle className="text-xl font-semibold tabular-nums">
          <span>{formatNumber(data.totals.advertisers)}</span>
          <span className="mx-2">/</span>
          <span>{formatNumber(data.totals.affiliates)}</span>
        </CardTitle>
        <p className="line-clamp-1 flex gap-2 text-sm font-medium text-muted-foreground">
          New Registrations
        </p>
      </CardHeader>

      <CardContent className="pt-0 px-4">
        {hasData ? (
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
                      | RegistrationSeriesPoint
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
                            | RegistrationSeriesPoint
                            | undefined;
                          return currentPoint?.label ?? "";
                        }}
                        formatter={(value, name) => {
                          const isAdvertisers = name === "advertisers_count";
                          return (
                            <div className="grid w-full gap-1">
                              <div className="flex items-center justify-between gap-4 font-semibold">
                                <span className="text-muted-foreground">
                                  {isAdvertisers ? "Advertisers" : "Affiliates"}
                                </span>
                                <span className="font-mono tabular-nums">
                                  {formatNumber(Number(value) || 0)}
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
                  dataKey="advertisers_count"
                  fill="var(--color-advertisers_count)"
                  radius={[4, 4, 2, 2]}
                  maxBarSize={32}
                />
                <Bar
                  dataKey="affiliates_count"
                  fill="var(--color-affiliates_count)"
                  radius={[4, 4, 2, 2]}
                  maxBarSize={32}
                />
              </BarChart>
            </ChartContainer>
          </div>
        ) : (
          <div className="flex h-[72px] items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            No registrations in the selected period
          </div>
        )}
      </CardContent>
    </Card>
  );
}
