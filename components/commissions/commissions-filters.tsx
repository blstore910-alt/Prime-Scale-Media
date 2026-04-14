"use client";

import dayjs from "dayjs";
import { CalendarIcon, Filter, X } from "lucide-react";
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
import { DATE_FORMAT } from "@/lib/constants";

const COMMISSION_TYPES = [
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

const formatDateLabel = (date: Date) => dayjs(date).format(DATE_FORMAT);

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

  const dateRangeLabel =
    dateRange?.from && dateRange?.to
      ? `${formatDateLabel(dateRange.from)} - ${formatDateLabel(dateRange.to)}`
      : "Select Range";

  const localDateRangeLabel =
    localDateRange?.from && localDateRange?.to
      ? `${formatDateLabel(localDateRange.from)} - ${formatDateLabel(localDateRange.to)}`
      : "Select Range";

  const applyFilters = () => {
    setCurrency(localCurrency);
    setCommissionType(localCommissionType);
    setSort(localSort);
    setDateRange(
      localDateRange?.from && localDateRange?.to ? localDateRange : undefined,
    );
    setOpen(false);
  };

  const isApplied =
    currency !== "all" ||
    commissionType !== "all" ||
    sort !== "newest" ||
    Boolean(dateRange?.from && dateRange?.to);

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

      <div className="md:hidden gap-2">
        {isApplied && (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            <X />
            Clear
          </Button>
        )}
        <Button size="icon" variant="outline" onClick={() => setOpen(true)}>
          <Filter />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
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
