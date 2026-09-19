"use client";

import { useStatsDataset } from "@/hooks/use-stats-batch";
import dayjs from "dayjs";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { DateRange } from "react-day-picker";

import { useIsMobile } from "@/hooks/use-mobile";

import { AffiliateCommissionsStatsCard } from "@/components/dashboard/affiliate-commissions-stats-card";
import { ExtraAdAccountsStatsCard } from "@/components/dashboard/extra-ad-accounts-stats-card";
import { FeesStatsCard } from "@/components/dashboard/fees-stats-card";
import {
  WalletExchangesStatsCard,
  WalletTopupsStatsCard,
} from "@/components/dashboard/wallet-stats-cards";
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

interface StatsResponse {
  ad_accounts: {
    total: number;
    active: number;
  };
  subscriptions: {
    /** active + past_due — the two the nightly run actually collects. */
    billing: number;
  };
  advertisers_affiliates: {
    advertisers: {
      total: number;
      active: number;
    };
    affiliates: {
      total: number;
    };
  };
}


const formatNumber = (value: number) => {
  return new Intl.NumberFormat("en-US").format(Math.floor(value));
};

const formatDateLabel = (date: Date) => dayjs(date).format(DATE_FORMAT);

// Mockup-only classes (profit-hero + metric tiles + segmented period control),
// scoped under .psm-stats so they never leak. The admin shell injects the
// design tokens (--navy1/2/3, --brand, --primary, --panel, --line, --win,
// --txt-2, --faint, --shadow-sm/-shadow, --primary-tint …) on .psmapp; we
// reuse those and only add the one tint the shell omits. Rule bodies are
// copied from the approved super-admin mockup. The ring's animation is
// belt-and-suspenders disabled under reduced-motion (the shell already forces
// `.psmapp *{animation:none}` there, which our elements inherit).
const STATS_CSS = `
.psm-stats{--purple-tint:#f3e8ff;display:flex;flex-direction:column;gap:12px}

/* Period control — one clearly-labelled bar that governs the metrics below. */
.psm-stats .statctl{display:flex;align-items:center;gap:8px;flex-wrap:nowrap;background:linear-gradient(180deg,var(--panel),var(--panel-2));border:1px solid var(--line);border-radius:13px;padding:6px 8px;box-shadow:var(--shadow-sm);overflow:hidden}
.psm-stats .statctl .seg2{min-width:0;flex:1 1 auto}
.psm-stats .statctl .seg2 button{min-width:0;padding:6px 8px;font-size:.8rem}
/* The range button keeps its icon and loses its words when the row gets
   tight — a calendar glyph is unambiguous, and a chosen range still prints
   its dates because that is the information. */
@media (max-width:470px){
  .psm-stats .statctl .rangelbl{display:none}
  .psm-stats .statctl .rangelbl.set{display:inline}
}
.psm-stats .statctl-lbl{margin-right:auto;padding-left:4px;font-size:.66rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--faint);white-space:nowrap}
/* WRAPS, does not scroll. Measured at 400px: six options need 440px in a
   233px strip, so four of them were off screen — and a horizontal scroller
   hides its own options, so the period you want is reliably one of the
   hidden ones. Two readable lines beat one line you have to drag. */
.psm-stats .seg2{display:flex;flex-wrap:wrap;background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:3px;gap:2px}
.psm-stats .seg2 button{border:0;background:none;font-family:var(--bd);font-weight:700;font-size:.82rem;color:var(--txt-2);padding:7px 12px;border-radius:8px;cursor:pointer;transition:.13s;white-space:nowrap}
.psm-stats .seg2 button:hover{color:var(--ink)}
.psm-stats .seg2 button.on{background:var(--panel);color:var(--primary-600);box-shadow:0 1px 3px rgba(20,30,80,.16)}
.psm-stats .rangebtn{display:inline-flex;align-items:center;gap:7px;background:var(--panel);border:1px solid var(--line-2);border-radius:10px;padding:8px 12px;font-family:var(--bd);font-weight:700;font-size:.83rem;color:var(--ink);cursor:pointer;box-shadow:var(--shadow-sm);transition:.13s}
.psm-stats .rangebtn:hover{border-color:var(--primary);color:var(--primary-600)}
.psm-stats .rangebtn.on{border-color:var(--primary);color:var(--primary-600);background:var(--primary-tint)}
.psm-stats .rangebtn svg{width:15px;height:15px}
/* Month step arrows — nudge the selected period back/forward one month. */
.psm-stats .stepbtn{display:inline-grid;place-items:center;width:34px;height:34px;flex:0 0 auto;border:1px solid var(--line-2);border-radius:10px;background:var(--panel);color:var(--txt-2);cursor:pointer;box-shadow:var(--shadow-sm);transition:.13s}
.psm-stats .stepbtn:hover:not(:disabled){border-color:var(--primary);color:var(--primary-600)}
.psm-stats .stepbtn:disabled{opacity:.4;cursor:default}
.psm-stats .stepbtn svg{width:16px;height:16px}

/* Section sub-labels with a trailing hairline — separates period vs all-time. */
/* ── The activity panel ────────────────────────────────────────────────
   One object instead of two labelled sections. The period selector sits
   inside its head, where it visibly governs what is under it, and the
   all-time totals sit below a rule as the panel's footing rather than as
   a second block with its own heading. */
.psm-stats .statpanel{border:1px solid var(--line);border-radius:18px;
  background:var(--panel);padding:14px;display:flex;flex-direction:column;gap:12px;
  box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 1px 2px -1px rgba(20,30,80,.14),
             0 18px 38px -28px rgba(20,30,80,.5)}
.psm-stats .statpanel-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.psm-stats .statpanel-head .statctl{margin-left:auto}
/* A rule with the label sitting ON it, so the footing reads as part of
   the panel rather than as the next section down. */
.psm-stats .statpanel-rule{display:flex;align-items:center;gap:10px;margin-top:2px}
.psm-stats .statpanel-rule::after{content:"";flex:1 1 auto;height:1px;
  background:linear-gradient(90deg,var(--line),transparent)}
.psm-stats .statpanel-rule span{font-size:.67rem;font-weight:700;letter-spacing:.08em;
  text-transform:uppercase;color:var(--faint);flex:0 0 auto}
@media(max-width:520px){
  .psm-stats .statpanel{padding:12px;border-radius:16px}
  .psm-stats .statpanel-head .statctl{margin-left:0;width:100%}
}
.psm-stats .slab{display:flex;align-items:center;gap:10px;margin-top:2px;font-size:.67rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
.psm-stats .slab::after{content:"";flex:1;height:1px;background:var(--line)}

.psm-stats .profit-hero{position:relative;border-radius:16px;padding:16px 18px;color:#fff;background:linear-gradient(135deg,var(--navy1),var(--navy2) 55%,#1a2350);box-shadow:0 22px 46px -26px rgba(20,30,80,.85)}
.psm-stats .profit-hero>*{position:relative}
.psm-stats .profit-hero .hclip{position:absolute;inset:0;overflow:hidden;border-radius:16px;pointer-events:none}
.psm-stats .profit-hero .ring{position:absolute;inset:-45%;background:conic-gradient(from 0deg,transparent,rgba(91,141,255,.18),transparent 30%,rgba(139,92,246,.18),transparent 60%);animation:psmspin 26s linear infinite}
@keyframes psmspin{to{transform:rotate(360deg)}}
.psm-stats .profit-hero .pl{font-size:.7rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.8}
.psm-stats .profit-hero .pv{font-family:var(--hd);font-weight:800;font-size:2.15rem;letter-spacing:-.02em;margin:4px 0 2px;background:linear-gradient(135deg,#9db8ff,#c9b3ff);-webkit-background-clip:text;background-clip:text;color:transparent;font-variant-numeric:tabular-nums}
.psm-stats .profit-hero .prow{display:flex;gap:10px;flex-wrap:wrap;margin-top:11px}
.psm-stats .profit-hero .prow .b{flex:1;min-width:112px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:11px;padding:9px 11px;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
.psm-stats .profit-hero .prow .b span{font-size:.62rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;opacity:.78}
.psm-stats .profit-hero .prow .b b{display:block;font-family:var(--hd);font-size:1.2rem;margin-top:4px;font-variant-numeric:tabular-nums}

.psm-stats .mgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.psm-stats .metric{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:12px 14px;box-shadow:var(--shadow-sm);transition:transform .16s,box-shadow .16s}
.psm-stats .metric:hover{transform:translateY(-3px);box-shadow:var(--shadow)}
.psm-stats .metric .k{display:flex;align-items:center;gap:8px;font-size:.72rem;font-weight:600;color:var(--faint)}
.psm-stats .metric .v{font-family:var(--hd);font-weight:800;font-size:1.15rem;margin-top:7px;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.psm-stats .metric .v.err{font-family:var(--bd);font-weight:600;font-size:.92rem;color:var(--txt-2)}
.psm-stats .metric .sub{font-size:.71rem;color:var(--faint);margin-top:2px;min-height:1em}
.psm-stats .ci{width:26px;height:26px;border-radius:8px;display:inline-grid;place-items:center;flex:0 0 auto}
.psm-stats .ci svg{width:15px;height:15px}
.psm-stats .ci.b{background:var(--primary-tint);color:var(--primary-600)}
.psm-stats .ci.t{background:#d7f4f8;color:var(--teal)}
.psm-stats .ci.g{background:var(--gold-soft);color:#a9740b}
.psm-stats .ci.p{background:var(--purple-tint);color:var(--purple)}
.psm-stats .ci.w{background:var(--win-soft);color:var(--win)}
.psm-stats .ci.d{background:var(--danger-soft);color:var(--danger)}
.psm-stats .ci.i{background:#e5e9ff;color:#4a5bd0}
.psm-stats .skel{display:inline-block;height:1.1em;width:130px;max-width:100%;border-radius:6px;background:var(--panel-2)}

/* "This period" cards (shadcn Card) restyled to the SAME premium panel look
   as the all-time metric tiles — one cohesive dashboard. The label reads
   like a metric label (faint), the amount like a metric value (bold). */
.psm-stats [data-slot=card]{background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-sm);transition:transform .16s,box-shadow .16s}
.psm-stats [data-slot=card]:hover{transform:translateY(-3px);box-shadow:var(--shadow)}
/* ONE ROW. The chip, then the words, then the edge of the card. A
   label that does not fit is clipped with an ellipsis and keeps its
   full text in the title attribute — it is never folded onto a second
   line, because that is what pushed each figure to a different height
   and made six identical $0.00s look like six different cards. */
.psm-stats [data-slot=card-description]{display:flex;align-items:center;gap:8px;height:28px;font-family:var(--hd);font-weight:700;font-size:.66rem;letter-spacing:.05em;text-transform:uppercase;color:var(--faint);white-space:nowrap}
.psm-stats [data-slot=card-description]>span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis}
/* The figure: one line, and it shrinks rather than breaks. */
.psm-stats [data-slot=card-title]{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:clamp(1rem,4.4vw,1.3rem);letter-spacing:-.02em}

/* Six rectangles of one size. grid-auto-rows:1fr is what makes a row
   as tall as its tallest card and every card in it that tall; the
   cards stretch into it, and their content column pushes the footer
   to the bottom so the baselines line up across the row. */
.psm-stats .statgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;grid-auto-rows:1fr}
.psm-stats .statgrid>*{min-width:0}
.psm-stats [data-slot=card]{height:100%;display:flex;flex-direction:column}
.psm-stats [data-slot=card-content]{flex:1 1 auto;display:flex;flex-direction:column;justify-content:flex-end}
@media(min-width:1100px){.psm-stats .statgrid{grid-template-columns:repeat(3,1fr)}}
.psm-stats [data-slot=card-title]{font-family:var(--hd);font-weight:800;font-size:1.28rem;letter-spacing:-.01em;color:var(--ink);font-variant-numeric:tabular-nums}

@media (max-width:900px){.psm-stats .mgrid{grid-template-columns:repeat(2,1fr)}}
/* Two columns all the way down: these tiles are a label plus a number,
   so one-per-row turned the dashboard into 1846px of scrolling on a phone
   for figures that fit side by side. */
@media (max-width:520px){.psm-stats .mgrid{grid-template-columns:repeat(2,1fr);gap:8px}}
/* Period bar stays one row; the segments scroll horizontally and the label
   is dropped on narrow screens so nothing wraps. */
@media (max-width:640px){.psm-stats .statctl-lbl{display:none}}
@media (max-width:640px){.psm-stats .profit-hero .pv{font-size:1.85rem}}
@media (prefers-reduced-motion:reduce){.psm-stats .profit-hero .ring{animation:none}}
`;

// SHORT, because they have to share ONE line with the range button.
// "This Week / This Month / This Year" plus "Last month" plus Select Range
// needed 440px in a 233px strip, so the bar wrapped to three rows on a
// phone and the period control was taller than the figures it filtered.
// The word "This" is carried by the heading above them.
const PERIODS: { value: DashboardPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

export function DashboardStatsCards() {
  const { profile, isSuperAdmin } = useAppContext();
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date | undefined>();
  const isAdminDashboard = profile?.role === "admin" && !isSuperAdmin;

  // Rides the same batched request as the period cards below, so the whole
  // dashboard costs one round trip instead of five.
  const { data: stats, isError: isStatsError } =
    useStatsDataset<StatsResponse>("summary", period, dateRange);

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

  // Month stepping + "Last month" are expressed purely as a custom dateRange,
  // so they ride the existing getPeriodRange(period, dateRange) path — no new
  // data source. Landing on the current month restores the named "month"
  // period so it matches the "This Month" segment exactly.
  const thisMonthStart = dayjs().startOf("month");
  const lastMonthStart = thisMonthStart.subtract(1, "month");

  const selectMonth = (anchor: dayjs.Dayjs) => {
    const start = anchor.startOf("month");
    if (start.isSame(thisMonthStart, "month")) {
      setDashboardPeriod("month");
      setCalendarMonth(start.toDate());
      return;
    }
    handleDateRangeSelect({
      from: start.toDate(),
      to: anchor.endOf("month").toDate(),
    });
    setCalendarMonth(start.toDate());
  };

  const monthAnchor = dateRange?.from ? dayjs(dateRange.from) : dayjs();
  const canStepForward = monthAnchor
    .startOf("month")
    .isBefore(thisMonthStart, "month");
  const stepMonth = (delta: number) => {
    if (delta > 0 && !canStepForward) return;
    selectMonth(monthAnchor.add(delta, "month"));
  };

  const isLastMonthSelected =
    hasRange &&
    !!dateRange?.from &&
    !!dateRange?.to &&
    dayjs(dateRange.from).isSame(lastMonthStart, "day") &&
    dayjs(dateRange.to).isSame(lastMonthStart.endOf("month"), "day");

  const rangeTrigger = (
    <button
      type="button"
      className={`rangebtn${hasRange && !isLastMonthSelected ? " on" : ""}`}
    >
      <CalendarIcon />
      <span className={`rangelbl${hasRange ? " set" : ""}`}>
        {dateRangeLabel}
      </span>
    </button>
  );

  // The month step arrows only make sense once a month is in focus — when
  // "This Month" / "Last month" / a custom range is active. For Today/Week/
  // Year they'd do nothing meaningful, so they stay hidden (cleaner bar).
  const showStepArrows = period === "month" || hasRange;

  const periodControl = (
    <div className="statctl">
      <span className="statctl-lbl">Period</span>
      {showStepArrows && (
        <button
          type="button"
          className="stepbtn"
          aria-label="Previous month"
          onClick={() => stepMonth(-1)}
        >
          <ChevronLeft />
        </button>
      )}
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
      {showStepArrows && (
        <button
          type="button"
          className="stepbtn"
          aria-label="Next month"
          onClick={() => stepMonth(1)}
          disabled={!canStepForward}
        >
          <ChevronRight />
        </button>
      )}

      {isMobile ? (
        <Dialog open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
          <DialogTrigger asChild>{rangeTrigger}</DialogTrigger>
          <DialogContent className="p-0 sm:max-w-[340px] sm:rounded-2xl">
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
          {/* Same panel as the owner sees, without the hero — an admin
              has no business-wide profit view. */}
          <div className="statpanel">
            <div className="statpanel-head">
              <span className="slab">Activity</span>
              {periodControl}
            </div>
            <div className="statgrid">
              {/* Money IN first, then what we charged for it, then
                  what leaves for the ad accounts — the order the money
                  actually travels in. Wallet in and Exchanges were on no
                  tile at all before this. */}
              <WalletTopupsStatsCard period={period} dateRange={dateRange} />
              <TopupsStatsCard period={period} dateRange={dateRange} />
              <FeesStatsCard period={period} dateRange={dateRange} />
              <WalletExchangesStatsCard period={period} dateRange={dateRange} />
              <SubscriptionsStatsCard period={period} dateRange={dateRange} />
              <ExtraAdAccountsStatsCard period={period} dateRange={dateRange} />
              <AffiliateCommissionsStatsCard
                period={period}
                dateRange={dateRange}
              />
              <RegistrationsStatsCard period={period} dateRange={dateRange} />
            </div>
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
            {/* ── SUBSCRIPTIONS, NOT ALL-TIME PROFIT ──────────────
                All-time profit is a number that barely moves and that
                the finance report already carries in full. What the
                owner checks on opening the dashboard is how many plans
                are billing — that is the book. */}
            <div className="pl">Subscriptions · billing now</div>
            <div className="pv">
              {isStatsError
                ? "—"
                : stats
                  ? formatNumber(stats.subscriptions.billing)
                  : "…"}
            </div>
            {/* ── THE LIVE STATE OF THE BUSINESS ────────────────────
                Three figures the owner wants at a glance: how many
                plans are billing, how many accounts are running, how
                many customers there are. Topups came off — the amount
                is in the All-time footing below and a bare count beside
                it was the same fact twice.

                Whatever sits here does NOT appear again in the grid
                underneath. That duplication is what made the screen
                read as the same numbers twice. */}
            <div className="prow">
              <div className="b">
                <span>Ad accounts</span>
                <b>
                  {stats
                    ? formatNumber(stats.ad_accounts.active)
                    : isStatsError
                      ? "—"
                      : "…"}
                </b>
              </div>
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
                <span>Affiliates</span>
                <b>
                  {stats
                    ? formatNumber(stats.advertisers_affiliates.affiliates.total)
                    : isStatsError
                      ? "—"
                      : "…"}
                </b>
              </div>
            </div>
          </div>

          {/* ── ONE BLOCK, NOT TWO ─────────────────────────────────────
              These were two labelled sections stacked on one screen —
              "This period" with four cards, then "All time" with five
              tiles — and the only thing telling them apart was a small
              grey word. So the page read as the same numbers twice and
              the owner had to work out which block a figure belonged to.

              It is one panel now: the period selector sits INSIDE it, at
              the top, where it visibly governs what is under it; the
              period cards follow; and the all-time totals sit below a
              rule as the footing of the same panel rather than as a
              second section. Same figures, one object.

              Period-scoped activity here is limited to what the hero and
              the all-time footing do NOT already carry — topups, fees and
              profit were taken out because showing them twice is what
              made the screen feel duplicated in the first place. */}
          {/* ── ONE PANEL, ONE PERIOD ──────────────────────────────────
              This was a panel of period cards with a second "All time"
              block bolted underneath it, and the only thing telling the
              two apart was a small grey word. Topups and Fees sat in
              that footing as lifetime totals while every figure beside
              them answered to the selector at the top — so two cards on
              one screen meant something different from the other four.

              The footing is gone. Everything in here answers to the
              period control in its head, Topups and Fees included, and
              every tile carries the same chip so the grid reads as one
              set. Lifetime figures live on the finance report, which is
              where a lifetime figure belongs. */}
          <div className="statpanel">
            <div className="statpanel-head">
              <span className="slab">Activity</span>
              {periodControl}
            </div>
            <div className="statgrid">
              {/* Money IN first, then what we charged for it, then
                  what leaves for the ad accounts — the order the money
                  actually travels in. Wallet in and Exchanges were on no
                  tile at all before this. */}
              <WalletTopupsStatsCard period={period} dateRange={dateRange} />
              <TopupsStatsCard period={period} dateRange={dateRange} />
              <FeesStatsCard period={period} dateRange={dateRange} />
              <WalletExchangesStatsCard period={period} dateRange={dateRange} />
              <SubscriptionsStatsCard period={period} dateRange={dateRange} />
              <ExtraAdAccountsStatsCard period={period} dateRange={dateRange} />
              <AffiliateCommissionsStatsCard
                period={period}
                dateRange={dateRange}
              />
              <RegistrationsStatsCard period={period} dateRange={dateRange} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
