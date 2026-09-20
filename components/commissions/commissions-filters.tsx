"use client";

import { CalendarIcon, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { compactRangeLabel } from "@/lib/pure-date-range-label";

// ── EVERY OPTION HERE MATCHED NOTHING ───────────────────────────────
//
// The accrual trigger hard-codes `'percentage'` as the commission type
// on every row it writes -- it is the only value the database has ever
// held. So both options on this filter returned an empty list, always,
// and the empty state said "No commissions found" with a clear-filters
// hint. There was no value that selected the rows that exist.
//
// "Percentage" is now first, because it is what the rows are. The other
// two are kept: a referral CAN be agreed as one-time or monthly on the
// link, and the day that reaches referral_commissions the filter should
// already work rather than being discovered missing.
const COMMISSION_TYPES = [
  { label: "Percentage", value: "percentage" },
  { label: "One-time", value: "onetime" },
  { label: "Monthly", value: "monthly" },
];

const CURRENCIES = [
  { label: "$ USD", value: "USD" },
  { label: "EUR", value: "EUR" },
];

type CommissionsFiltersProps = {
  currency: string;
  setCurrency: (value: string) => void;
  commissionType: string;
  setCommissionType: (value: string) => void;
  sort: string;
  setSort: (value: string) => void;
  dateRange: DateRange | undefined;
  setDateRange: (value: DateRange | undefined) => void;
};


function normalizeRange(range: DateRange | undefined): DateRange | undefined {
  if (!range) {
    return undefined;
  }

  if (range.from && range.to && range.from.getTime() === range.to.getTime()) {
    return { from: range.from, to: undefined };
  }

  return range;
}

export default function CommissionsFilters({
  currency,
  setCurrency,
  commissionType,
  setCommissionType,
  sort,
  setSort,
  dateRange,
  setDateRange,
}: CommissionsFiltersProps) {
  const [open, setOpen] = useState(false);
  const [isDesktopDatePickerOpen, setIsDesktopDatePickerOpen] = useState(false);
  const [desktopCalendarMonth, setDesktopCalendarMonth] = useState<
    Date | undefined
  >();
  const [mobileCalendarMonth, setMobileCalendarMonth] = useState<
    Date | undefined
  >();

  const [localCurrency, setLocalCurrency] = useState(currency);
  const [localCommissionType, setLocalCommissionType] =
    useState(commissionType);
  const [localSort, setLocalSort] = useState(sort);
  const [localDateRange, setLocalDateRange] = useState<DateRange | undefined>(
    dateRange,
  );

  // Same compaction as the dashboard bar, same reason. See
  // lib/pure-date-range-label.
  const dateRangeLabel =
    compactRangeLabel(dateRange?.from, dateRange?.to) || "Select Range";

  const localDateRangeLabel =
    compactRangeLabel(localDateRange?.from, localDateRange?.to) ||
    "Select Range";

  const applyFilters = () => {
    setCurrency(localCurrency);
    setCommissionType(localCommissionType);
    setSort(localSort);
    setDateRange(
      localDateRange?.from && localDateRange?.to ? localDateRange : undefined,
    );
    setOpen(false);
  };

  // How many things are narrowing the list. The button shows this, because
  // once the controls are behind it the button is the only thing left that
  // can say the list is filtered.
  const appliedCount =
    (currency !== "all" ? 1 : 0) +
    (commissionType !== "all" ? 1 : 0) +
    (sort !== "newest" ? 1 : 0) +
    (dateRange?.from && dateRange?.to ? 1 : 0);
  const isApplied = appliedCount > 0;

  const clearFilters = () => {
    setCurrency("all");
    setCommissionType("all");
    setSort("newest");
    setDateRange(undefined);
    setLocalCurrency("all");
    setLocalCommissionType("all");
    setLocalSort("newest");
    setLocalDateRange(undefined);
    setIsDesktopDatePickerOpen(false);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    setLocalCurrency(currency);
    setLocalCommissionType(commissionType);
    setLocalSort(sort);
    setLocalDateRange(dateRange);
    setMobileCalendarMonth(dateRange?.from);
  }, [open, currency, commissionType, sort, dateRange]);

  useEffect(() => {
    if (isDesktopDatePickerOpen) {
      setDesktopCalendarMonth(dateRange?.from);
    }
  }, [isDesktopDatePickerOpen, dateRange?.from]);

  const handleDesktopDateRangeSelect = (range: DateRange | undefined) => {
    const nextRange = normalizeRange(range);
    setDateRange(nextRange);

    if (nextRange?.from && nextRange?.to) {
      setIsDesktopDatePickerOpen(false);
    }
  };

  const handleMobileDateRangeSelect = (range: DateRange | undefined) => {
    setLocalDateRange(normalizeRange(range));
  };

  return (
    <>
      <div className="hidden md:flex flex-wrap items-center gap-2">
        <Select value={currency} onValueChange={(value) => setCurrency(value)}>
          <SelectTrigger size="sm">
            <SelectValue placeholder="Currency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Currencies</SelectItem>
            {CURRENCIES.map((currencyOption) => (
              <SelectItem key={currencyOption.value} value={currencyOption.value}>
                {currencyOption.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={commissionType}
          onValueChange={(value) => setCommissionType(value)}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="Commission Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {COMMISSION_TYPES.map((commissionTypeOption) => (
              <SelectItem
                key={commissionTypeOption.value}
                value={commissionTypeOption.value}
              >
                {commissionTypeOption.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select aria-label="Sort commissions" value={sort} onValueChange={setSort}>
          <SelectTrigger size="sm">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="commission-desc">Commission high to low</SelectItem>
            <SelectItem value="commission-asc">Commission low to high</SelectItem>
          </SelectContent>
        </Select>

        <Popover
          open={isDesktopDatePickerOpen}
          onOpenChange={setIsDesktopDatePickerOpen}
        >
          <PopoverTrigger asChild>
            <Button
              size="sm"
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
              month={desktopCalendarMonth}
              onMonthChange={setDesktopCalendarMonth}
              onSelect={handleDesktopDateRangeSelect}
              numberOfMonths={2}
              disabled={{ after: new Date() }}
            />
          </PopoverContent>
        </Popover>

        {isApplied && (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            <X />
            Clear Filters
          </Button>
        )}
      </div>

      {/* Same control as every other list: one button beside the search,
          carrying a count. It used to be a bare icon-only funnel PLUS a
          separate Clear button, which wrapped onto a second row under the
          search field — a filter bar taller than it needed to be, in a
          shape that appeared nowhere else in the app. Clearing lives inside
          the dialog, where the filters it clears are. */}
      <div className="fgroup md:hidden">
        <button
          className={`fbtn${isApplied ? " on" : ""}`}
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <SlidersHorizontal />
          <span>Sort &amp; filter</span>
          {appliedCount > 0 && <span className="fcount">{appliedCount}</span>}
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sort &amp; filter</DialogTitle>
          </DialogHeader>

          <div className="mt-2 flex flex-col gap-3">
            <Select
              value={localCurrency}
              onValueChange={(value) => setLocalCurrency(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Currencies</SelectItem>
                {CURRENCIES.map((currencyOption) => (
                  <SelectItem key={currencyOption.value} value={currencyOption.value}>
                    {currencyOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={localCommissionType}
              onValueChange={(value) => setLocalCommissionType(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Commission Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {COMMISSION_TYPES.map((commissionTypeOption) => (
                  <SelectItem
                    key={commissionTypeOption.value}
                    value={commissionTypeOption.value}
                  >
                    {commissionTypeOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={localSort} onValueChange={setLocalSort}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="commission-desc">
                  Commission high to low
                </SelectItem>
                <SelectItem value="commission-asc">
                  Commission low to high
                </SelectItem>
              </SelectContent>
            </Select>

            <div className="space-y-2">
              <p className="text-sm font-medium">Date Range</p>
              <div className="flex w-full items-center rounded-md border px-3 py-2 text-sm">
                <CalendarIcon className="mr-2 size-4" />
                {localDateRangeLabel}
              </div>
              <Calendar
                mode="range"
                className="w-full rounded-md border"
                selected={localDateRange}
                month={mobileCalendarMonth}
                onMonthChange={setMobileCalendarMonth}
                onSelect={handleMobileDateRangeSelect}
                numberOfMonths={1}
                disabled={{ after: new Date() }}
              />
            </div>
          </div>

          <DialogFooter className="mt-4 flex flex-row justify-end gap-2">
            {/* Reset moved in here from the filter bar, so clearing lives
                next to the filters it clears. */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clearFilters();
                setOpen(false);
              }}
              disabled={!isApplied}
            >
              Reset
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={applyFilters}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
