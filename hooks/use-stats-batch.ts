"use client";

import { useAppContext } from "@/context/app-provider";
import {
  DashboardDateRange,
  DashboardPeriod,
  getPeriodRange,
} from "@/lib/dashboard-period";
import { useQuery } from "@tanstack/react-query";

type Slice = { ok: true; data: unknown } | { ok: false; status: number };

/**
 * The datasets each role's dashboard actually renders. Keeping these lists
 * exact matters twice over: a dataset nobody shows is a query nobody needed,
 * and every card on a given dashboard must ask for the SAME list or they stop
 * sharing a cache entry and the batching is undone.
 */
// A CARD THAT ASKS FOR A DATASET NOT ON ITS LIST GETS NOTHING BACK, and
// useStatsDataset reads a missing slice as a failure — so the card says
// "Failed to load", on a dashboard where nothing is wrong. That is
// exactly what happened the moment the owner's grid gained a Topups
// tile: `topups` was on the admin list and not on this one.
//
// So the rule is: these lists are the cards on that dashboard. Both
// dashboards now render the same six period tiles, so both lists carry
// the same six datasets and the owner's adds the hero summary.
const PERIOD_DATASETS = [
  "topups",
  "wallet",
  "subscriptions",
  "extra-ad-accounts",
  "affiliate-commissions",
  "registrations",
] as const;

// An employee admin sees six of the eight tiles: /api/stats/fees and
// /api/stats/affiliate-commissions are apiRequireOwner at the source,
// so asking for them here buys a refusal per slice.
const ADMIN_DATASETS = PERIOD_DATASETS.filter(
  (d) => d !== "affiliate-commissions",
);

const SUPER_ADMIN_DATASETS = ["summary", ...PERIOD_DATASETS] as const;

async function fetchStatsBatch(
  datasets: readonly string[],
  from: string,
  to: string,
): Promise<Record<string, Slice>> {
  const params = new URLSearchParams({
    datasets: datasets.join(","),
    from,
    to,
  });
  const res = await fetch(`/api/stats/batch?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch dashboard stats");
  return res.json();
}

function useStatsBatch(period: DashboardPeriod, dateRange?: DashboardDateRange) {
  const { profile, isSuperAdmin } = useAppContext();
  const isAdminDashboard = profile?.role === "admin" && !isSuperAdmin;
  const datasets = isAdminDashboard ? ADMIN_DATASETS : SUPER_ADMIN_DATASETS;
  const { from, to } = getPeriodRange(period, dateRange);

  return useQuery({
    queryKey: ["stats-batch", datasets.join(","), from, to],
    queryFn: () => fetchStatsBatch(datasets, from, to),
    enabled: !!profile,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * One dataset out of the shared batch. Every card calls this with the same
 * period, so react-query resolves them all from a single request.
 */
export function useStatsDataset<T>(
  name: string,
  period: DashboardPeriod,
  dateRange?: DashboardDateRange,
): { data: T | undefined; isLoading: boolean; isError: boolean } {
  const { data, isLoading, isError } = useStatsBatch(period, dateRange);
  const slice = data?.[name];

  return {
    data: slice && slice.ok ? (slice.data as T) : undefined,
    isLoading,
    // A dataset the batch could not produce is an error for THIS card only —
    // rendering it as an empty state would say "nothing happened this period",
    // which is a different and much worse claim than "we could not read it".
    isError: isError || (!!slice && !slice.ok),
  };
}
