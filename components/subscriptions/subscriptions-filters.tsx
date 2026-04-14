"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SubscriptionDatePicker from "./subscription-date-picker";
import { SubscriptionStatus } from "./types";

type SubscriptionsFiltersProps = {
  status: SubscriptionStatus | "all";
  onStatusChange: (value: SubscriptionStatus | "all") => void;
  date: string;
  onDateChange: (value: string) => void;
  onClear: () => void;
};

export default function SubscriptionsFilters({
  status,
  onStatusChange,
  date,
  onDateChange,
  onClear,
}: SubscriptionsFiltersProps) {
  const hasFilters = status !== "all" || Boolean(date);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={status}
        onValueChange={(value) =>
          onStatusChange((value as SubscriptionStatus | "all") ?? "all")
        }
      >
        <SelectTrigger size="sm" className="w-40">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
          <SelectItem value="paused">Paused</SelectItem>
        </SelectContent>
      </Select>

      <SubscriptionDatePicker
        value={date || undefined}
        onChange={onDateChange}
        placeholder="Start Date"
        className="h-8 w-44 justify-start text-xs font-normal"
        align="start"
      />

      {hasFilters && (
        <Button size="sm" variant="ghost" onClick={onClear}>
          Clear Filters
        </Button>
      )}
    </div>
  );
}
