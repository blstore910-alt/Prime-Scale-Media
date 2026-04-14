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

async function fetchExtraAdAccountsStats(
  period: DashboardPeriod,
  dateRange?: DashboardDateRange,
): Promise<ExtraAdAccountsStatsResponse> {
  const { from, to } = getPeriodRange(period, dateRange);
  const searchParams = new URLSearchParams({ from, to });
  const res = await fetch(
    `/api/stats/extra-ad-accounts?${searchParams.toString()}`,
  );
  if (!res.ok) {
    throw new Error("Failed to fetch extra ad accounts stats");
  }
  return res.json();
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.floor(value));
}

export function ExtraAdAccountsStatsCard({
  period,
  dateRange,
}: {
  period: DashboardPeriod;
  dateRange?: DashboardDateRange;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: [
      "stats",
      "extra-ad-accounts",
      period,
      dateRange?.from?.toISOString(),
      dateRange?.to?.toISOString(),
    ],
    queryFn: () => fetchExtraAdAccountsStats(period, dateRange),
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
          <CardDescription className="">Extra Ad Accounts</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex h-[72px] items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            Failed to load extra ad accounts data
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasAmountData = data.totals.count > 0;

  return (
    <Card className="@container/card gap-2 py-4">
      <CardHeader className="pb-2">
        <CardDescription className="font-semibold text-card-foreground">
          Extra Ad Accounts <span>({formatNumber(data.totals.count)})</span>
        </CardDescription>
        <CardTitle className=" text-xl font-semibold tabular-nums">
          <span>{formatCurrency(data.totals.usd.amount, "USD")}</span>
          <span className="mx-2">/</span>
          <span>{formatCurrency(data.totals.eur.amount, "EUR")}</span>
        </CardTitle>
        <p className="line-clamp-1 flex gap-2 text-sm font-medium text-muted-foreground">
          Extra Account Topups
        </p>
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
          <div className="flex h-[72px] items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            No extra ad accounts created in the selected period
          </div>
        )}
      </CardContent>
    </Card>
  );
}
