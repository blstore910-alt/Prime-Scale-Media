"use client";

import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { CalendarIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { DateRange } from "react-day-picker";

import { useIsMobile } from "@/hooks/use-mobile";

import { AffiliateCommissionsStatsCard } from "@/components/dashboard/affiliate-commissions-stats-card";
import { ExtraAdAccountsStatsCard } from "@/components/dashboard/extra-ad-accounts-stats-card";
import { FeesStatsCard } from "@/components/dashboard/fees-stats-card";
import { ProfitStatsCard } from "@/components/dashboard/profit-stats-card";
import { RegistrationsStatsCard } from "@/components/dashboard/registrations-stats-card";
import { SubscriptionsStatsCard } from "@/components/dashboard/subscriptions-stats-card";
import { TopupsStatsCard } from "@/components/dashboard/topups-stats-card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DATE_FORMAT } from "@/lib/constants";
import { DashboardPeriod } from "@/lib/dashboard-period";
import { formatCurrency } from "@/lib/utils";

interface StatsResponse {
  total_topups: {
    count: number;
    usd_amount: number;
    eur_amount: number;
  };
  total_fees: {
    count: number;
    usd_amount: number;
    eur_amount: number;
  };
  revenue_profit: {
    total_revenue: number;
    total_profit: number;
  };
  ad_accounts: {
    total: number;
    active: number;
  };
  advertisers_affiliates: {
    advertisers: {
      total: number;
      active: number;
    };
    affiliates: {
      total: number;
      active: number;
    };
  };
}

async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch("/api/stats");

  if (!res.ok) {
    throw new Error("Failed to fetch stats");
  }

  return res.json();
}

const formatNumber = (value: number) => {
  return new Intl.NumberFormat("en-US").format(Math.floor(value));
};

const formatDateLabel = (date: Date) => dayjs(date).format(DATE_FORMAT);

export function DashboardStatsCards() {
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date | undefined>();

  const {
    data: stats,
    isLoading: isStatsLoading,
    isError: isStatsError,
  } = useQuery({
    queryKey: ["stats", "overview"],
    queryFn: fetchStats,
    staleTime: 1000 * 60 * 5,
  });

  const isMobile = useIsMobile();

  const dateRangeLabel =
    dateRange?.from && dateRange?.to
      ? `${formatDateLabel(dateRange.from)} - ${formatDateLabel(dateRange.to)}`
      : "Select Range";

  const setDashboardPeriod = (nextPeriod: DashboardPeriod) => {
    setPeriod(nextPeriod);
    setDateRange(undefined);
  };

  useEffect(() => {
    if (isDatePickerOpen) {
      setCalendarMonth(dateRange?.from);
    }
  }, [isDatePickerOpen, dateRange?.from]);

  const handleDateRangeSelect = (range: DateRange | undefined) => {
    if (!range) {
      setDateRange(undefined);
      return;
    }

    if (range.from && range.to && range.from.getTime() === range.to.getTime()) {
      setDateRange({ from: range.from, to: undefined });
      return;
    }

    setDateRange(range);

    if (range.from && range.to) {
      setIsDatePickerOpen(false);
    }
  };

  return (
    <div className="space-y-4 px-4 lg:px-6 pb-16">
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <Tabs
          className="hidden sm:block"
          value={period}
          onValueChange={(v) => setDashboardPeriod(v as DashboardPeriod)}
        >
          <TabsList>
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">This Week</TabsTrigger>
            <TabsTrigger value="month">This Month</TabsTrigger>
            <TabsTrigger value="year">This Year</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select
          value={period}
          onValueChange={(v) => setDashboardPeriod(v as DashboardPeriod)}
        >
          <SelectTrigger className="w-[140px] sm:hidden">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
          </SelectContent>
        </Select>
        {isMobile ? (
          <Dialog open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="flex-1 justify-start text-left font-normal sm:min-w-56"
              >
                <CalendarIcon className="mr-2 size-4" />
                {dateRangeLabel}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[340px] rounded-lg p-0">
              <DialogHeader className="px-4 pt-4">
                <DialogTitle>Select Date Range</DialogTitle>
              </DialogHeader>
              <Calendar
                mode="range"
                className="w-full"
                selected={dateRange}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                onSelect={handleDateRangeSelect}
                numberOfMonths={1}
                hidden={{ from: new Date(2026, 0, 0), after: new Date() }}
                disabled={{ after: new Date() }}
              />
            </DialogContent>
          </Dialog>
        ) : (
          <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="min-w-56 justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 size-4" />
                {dateRangeLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0" align="end">
              <Calendar
                mode="range"
                className="w-full"
                selected={dateRange}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                onSelect={handleDateRangeSelect}
                numberOfMonths={2}
                hidden={{ from: new Date(2026, 0, 1), after: new Date() }}
                disabled={{ after: new Date() }}
              />
            </PopoverContent>
          </Popover>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 *:data-[slot=card]:shadow-xs">
        <TopupsStatsCard period={period} dateRange={dateRange} />
        <FeesStatsCard period={period} dateRange={dateRange} />
        <AffiliateCommissionsStatsCard period={period} dateRange={dateRange} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 *:data-[slot=card]:shadow-xs">
        <SubscriptionsStatsCard period={period} dateRange={dateRange} />
        <ExtraAdAccountsStatsCard period={period} dateRange={dateRange} />
        <ProfitStatsCard period={period} dateRange={dateRange} />
        <RegistrationsStatsCard period={period} dateRange={dateRange} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5 *:data-[slot=card]:shadow-xs">
        <SummaryStatCard
          title="Total Topups"
          value={
            stats
              ? `${formatCurrency(stats.total_topups.usd_amount, "USD")} / ${formatCurrency(stats.total_topups.eur_amount, "EUR")}`
              : ""
          }
          description={
            stats ? `${formatNumber(stats.total_topups.count)} completed` : ""
          }
          isLoading={isStatsLoading}
          isError={isStatsError}
        />
        <SummaryStatCard
          title="Total Fees"
          value={
            stats
              ? `${formatCurrency(stats.total_fees.usd_amount, "USD")} / ${formatCurrency(stats.total_fees.eur_amount, "EUR")}`
              : ""
          }
          description={
            stats ? `From ${formatNumber(stats.total_fees.count)} topups` : ""
          }
          isLoading={isStatsLoading}
          isError={isStatsError}
        />
        <SummaryStatCard
          title="Total Revenue"
          value={
            stats ? `${formatCurrency(stats.revenue_profit.total_revenue)}` : ""
          }
          description={
            stats
              ? `Profit: ${formatCurrency(stats.revenue_profit.total_profit)}`
              : ""
          }
          isLoading={isStatsLoading}
          isError={isStatsError}
        />
        <SummaryStatCard
          title="Total Ad Accounts"
          value={stats ? `${formatNumber(stats.ad_accounts.total)}` : ""}
          description={` ${stats ? formatNumber(stats.ad_accounts.active) : 0} active `}
          isLoading={isStatsLoading}
          isError={isStatsError}
        />
        <SummaryStatCard
          title="Total Advertisers"
          value={
            stats
              ? `${formatNumber(stats.advertisers_affiliates.advertisers.total)}`
              : ""
          }
          description={`${stats ? formatNumber(stats.advertisers_affiliates.advertisers.active) : 0} active`}
          isLoading={isStatsLoading}
          isError={isStatsError}
        />
      </div>
    </div>
  );
}

function SummaryStatCard({
  title,
  value,
  description,
  isLoading,
  isError,
}: {
  title: string;
  value: string;
  description: string;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return (
      <Card className="@container/card">
        <CardHeader className="gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-28" />
        </CardHeader>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <CardDescription className="font-semibold text-card-foreground">
            {title}
          </CardDescription>
          <CardTitle className="text-base text-muted-foreground">
            Failed to load
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="@container/card py-4">
      <CardHeader className="gap-2 px-4">
        <CardDescription className="font-semibold text-card-foreground">
          {title}
        </CardDescription>
        <CardTitle className="text-xl font-semibold tabular-nums">
          {value}
        </CardTitle>
        <p className="line-clamp-1 text-sm font-medium text-muted-foreground">
          {description}
        </p>
      </CardHeader>
    </Card>
  );
}
