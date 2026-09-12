"use client";

import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
  CalendarIcon,
  Coins,
  Monitor,
  Percent,
  Scale,
  Users,
  type LucideIcon,
} from "lucide-react";
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
import { Calendar } from "@/components/ui/calendar";
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
import { useAppContext } from "@/context/app-provider";
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

// Mockup-only classes (profit-hero + metric tiles + segmented period control),
// scoped under .psm-stats so they never leak. The admin shell injects the
// design tokens (--navy1/2/3, --brand, --primary, --panel, --line, --win,
// --muted, --faint, --shadow-sm/-shadow, --primary-tint …) on .psmapp; we
// reuse those and only add the one tint the shell omits. Rule bodies are
// copied from the approved super-admin mockup. The ring's animation is
// belt-and-suspenders disabled under reduced-motion (the shell already forces
// `.psmapp *{animation:none}` there, which our elements inherit).
const STATS_CSS = `
.psm-stats{--purple-tint:#f3e8ff;display:flex;flex-direction:column;gap:16px}

.psm-stats .statctl{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap}
.psm-stats .seg2{display:inline-flex;background:var(--panel-2);border:1px solid var(--line);border-radius:11px;padding:3px;gap:2px;flex-wrap:wrap}
.psm-stats .seg2 button{border:0;background:none;font-family:var(--bd);font-weight:700;font-size:.84rem;color:var(--muted);padding:8px 14px;border-radius:8px;cursor:pointer;transition:.13s}
.psm-stats .seg2 button:hover{color:var(--ink)}
.psm-stats .seg2 button.on{background:var(--panel);color:var(--primary-600);box-shadow:0 1px 3px rgba(20,30,80,.16)}
.psm-stats .rangebtn{display:inline-flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line-2);border-radius:11px;padding:9px 13px;font-family:var(--bd);font-weight:700;font-size:.85rem;color:var(--ink);cursor:pointer;box-shadow:var(--shadow-sm);transition:.13s}
.psm-stats .rangebtn:hover{border-color:var(--primary);color:var(--primary-600)}
.psm-stats .rangebtn.on{border-color:var(--primary);color:var(--primary-600);background:var(--primary-tint)}
.psm-stats .rangebtn svg{width:16px;height:16px}

.psm-stats .profit-hero{position:relative;border-radius:16px;padding:22px;color:#fff;background:linear-gradient(135deg,var(--navy1),var(--navy2) 55%,#1a2350);box-shadow:0 22px 46px -26px rgba(20,30,80,.85)}
.psm-stats .profit-hero>*{position:relative}
.psm-stats .profit-hero .hclip{position:absolute;inset:0;overflow:hidden;border-radius:16px;pointer-events:none}
.psm-stats .profit-hero .ring{position:absolute;inset:-45%;background:conic-gradient(from 0deg,transparent,rgba(91,141,255,.18),transparent 30%,rgba(139,92,246,.18),transparent 60%);animation:psmspin 26s linear infinite}
@keyframes psmspin{to{transform:rotate(360deg)}}
.psm-stats .profit-hero .pl{font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.8}
.psm-stats .profit-hero .pv{font-family:var(--hd);font-weight:800;font-size:2.6rem;letter-spacing:-.02em;margin:6px 0 2px;background:linear-gradient(135deg,#9db8ff,#c9b3ff);-webkit-background-clip:text;background-clip:text;color:transparent;font-variant-numeric:tabular-nums}
.psm-stats .profit-hero .prow{display:flex;gap:12px;flex-wrap:wrap;margin-top:14px}
.psm-stats .profit-hero .prow .b{flex:1;min-width:118px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:11px 13px;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
.psm-stats .profit-hero .prow .b span{font-size:.64rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;opacity:.78}
.psm-stats .profit-hero .prow .b b{display:block;font-family:var(--hd);font-size:1.35rem;margin-top:5px;font-variant-numeric:tabular-nums}

.psm-stats .mgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.psm-stats .metric{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:15px 16px;box-shadow:var(--shadow-sm);transition:transform .16s,box-shadow .16s}
.psm-stats .metric:hover{transform:translateY(-3px);box-shadow:var(--shadow)}
.psm-stats .metric .k{display:flex;align-items:center;gap:8px;font-size:.73rem;font-weight:600;color:var(--faint)}
.psm-stats .metric .v{font-family:var(--hd);font-weight:800;font-size:1.25rem;margin-top:9px;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.psm-stats .metric .v.err{font-family:var(--bd);font-weight:600;font-size:.95rem;color:var(--muted)}
.psm-stats .metric .sub{font-size:.72rem;color:var(--faint);margin-top:2px;min-height:1em}
.psm-stats .ci{width:26px;height:26px;border-radius:8px;display:inline-grid;place-items:center;flex:0 0 auto}
.psm-stats .ci svg{width:15px;height:15px}
.psm-stats .ci.b{background:var(--primary-tint);color:var(--primary-600)}
.psm-stats .ci.t{background:#d7f4f8;color:var(--teal)}
.psm-stats .ci.g{background:var(--gold-soft);color:#a9740b}
.psm-stats .ci.p{background:var(--purple-tint);color:var(--purple)}
.psm-stats .ci.w{background:var(--win-soft);color:var(--win)}
.psm-stats .ci.d{background:var(--danger-soft);color:var(--danger)}
.psm-stats .skel{display:inline-block;height:1.1em;width:130px;max-width:100%;border-radius:6px;background:var(--panel-2)}

@media (max-width:900px){.psm-stats .mgrid{grid-template-columns:repeat(2,1fr)}}
@media (max-width:520px){.psm-stats .mgrid{grid-template-columns:1fr}}
@media (max-width:640px){.psm-stats .profit-hero .pv{font-size:2.1rem}}
@media (prefers-reduced-motion:reduce){.psm-stats .profit-hero .ring{animation:none}}
`;

const PERIODS: { value: DashboardPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
];

export function DashboardStatsCards() {
  const { profile, isSuperAdmin } = useAppContext();
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date | undefined>();
  const isAdminDashboard = profile?.role === "admin" && !isSuperAdmin;
  const showFullDashboard = !isAdminDashboard;

  const {
    data: stats,
    isLoading: isStatsLoading,
    isError: isStatsError,
  } = useQuery({
    queryKey: ["stats", "overview"],
    queryFn: fetchStats,
    enabled: showFullDashboard,
    staleTime: 1000 * 60 * 5,
  });

  const isMobile = useIsMobile();

  const hasRange = Boolean(dateRange?.from && dateRange?.to);
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

  const rangeTrigger = (
    <button type="button" className={`rangebtn${hasRange ? " on" : ""}`}>
      <CalendarIcon />
      {dateRangeLabel}
    </button>
  );

  const periodControl = (
    <div className="statctl">
      <div className="seg2" role="group" aria-label="Dashboard period">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            aria-pressed={period === p.value && !hasRange}
            className={period === p.value && !hasRange ? "on" : ""}
            onClick={() => setDashboardPeriod(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isMobile ? (
        <Dialog open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
          <DialogTrigger asChild>{rangeTrigger}</DialogTrigger>
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
          <PopoverTrigger asChild>{rangeTrigger}</PopoverTrigger>
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
  );

  return (
    <div className="psm-stats">
      <style>{STATS_CSS}</style>

      {isAdminDashboard ? (
        <>
          {periodControl}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 *:data-[slot=card]:shadow-xs">
            <TopupsStatsCard period={period} dateRange={dateRange} />
            <SubscriptionsStatsCard period={period} dateRange={dateRange} />
            <ExtraAdAccountsStatsCard period={period} dateRange={dateRange} />
            <RegistrationsStatsCard period={period} dateRange={dateRange} />
          </div>
        </>
      ) : (
        <>
          {/* All-time profit marquee — super-admin only, fed by /api/stats.
              Honest empty/loading/error states, no fabricated numbers. */}
          <div className="profit-hero">
            <div className="hclip">
              <div className="ring" />
            </div>
            <div className="pl">Total profit · all time</div>
            <div className="pv">
              {isStatsError
                ? "—"
                : stats
                  ? formatCurrency(stats.revenue_profit.total_profit, "EUR")
                  : "…"}
            </div>
            <div className="prow">
              <div className="b">
                <span>Advertisers</span>
                <b>
                  {stats
                    ? formatNumber(stats.advertisers_affiliates.advertisers.total)
                    : isStatsError
                      ? "—"
                      : "…"}
                </b>
              </div>
              <div className="b">
                <span>Ad accounts</span>
                <b>
                  {stats
                    ? formatNumber(stats.ad_accounts.total)
                    : isStatsError
                      ? "—"
                      : "…"}
                </b>
              </div>
              <div className="b">
                <span>Topups</span>
                <b>
                  {stats
                    ? formatNumber(stats.total_topups.count)
                    : isStatsError
                      ? "—"
                      : "…"}
                </b>
              </div>
            </div>
          </div>

          {periodControl}

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

          <div className="mgrid">
            <SummaryStatCard
              title="Total Topups"
              icon={Coins}
              ci="t"
              value={
                stats
                  ? `${formatCurrency(stats.total_topups.usd_amount, "USD")} / ${formatCurrency(stats.total_topups.eur_amount, "EUR")}`
                  : ""
              }
              description={
                stats
                  ? `From ${formatNumber(stats.total_topups.count)} topups`
                  : ""
              }
              isLoading={isStatsLoading}
              isError={isStatsError}
            />
            <SummaryStatCard
              title="Total Fees"
              icon={Percent}
              ci="g"
              value={
                stats
                  ? `${formatCurrency(stats.total_fees.usd_amount, "USD")} / ${formatCurrency(stats.total_fees.eur_amount, "EUR")}`
                  : ""
              }
              description={
                stats
                  ? `From ${formatNumber(stats.total_fees.count)} topups`
                  : ""
              }
              isLoading={isStatsLoading}
              isError={isStatsError}
            />
            <SummaryStatCard
              title="Total Profit"
              icon={Scale}
              ci="p"
              value={
                stats
                  ? `${formatCurrency(stats.revenue_profit.total_profit, "EUR")}`
                  : ""
              }
              description=""
              isLoading={isStatsLoading}
              isError={isStatsError}
            />
            <SummaryStatCard
              title="Total Ad Accounts"
              icon={Monitor}
              ci="b"
              value={stats ? `${formatNumber(stats.ad_accounts.total)}` : ""}
              description={` ${stats ? formatNumber(stats.ad_accounts.active) : 0} active `}
              isLoading={isStatsLoading}
              isError={isStatsError}
            />
            <SummaryStatCard
              title="Total Advertisers"
              icon={Users}
              ci="w"
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
        </>
      )}
    </div>
  );
}

function SummaryStatCard({
  title,
  value,
  description,
  isLoading,
  isError,
  icon: Icon,
  ci,
}: {
  title: string;
  value: string;
  description: string;
  isLoading: boolean;
  isError: boolean;
  icon: LucideIcon;
  ci: string;
}) {
  return (
    <div className="metric">
      <div className="k">
        <span className={`ci ${ci}`}>
          <Icon />
        </span>
        {title}
      </div>
      {isLoading ? (
        <>
          <div className="v">
            <span className="skel" />
          </div>
          <div className="sub" />
        </>
      ) : isError ? (
        <>
          <div className="v err">Failed to load</div>
          <div className="sub" />
        </>
      ) : (
        <>
          <div className="v">{value || "0"}</div>
          <div className="sub">{description}</div>
        </>
      )}
    </div>
  );
}
