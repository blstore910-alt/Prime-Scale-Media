"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DATE_FORMAT } from "@/lib/constants";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import { CalendarIcon } from "lucide-react";

type SubscriptionDatePickerProps = {
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  align?: "start" | "center" | "end";
  disableBeforeToday?: boolean;
  className?: string;
  contentClassName?: string;
};

export default function SubscriptionDatePicker({
  value,
  onChange,
  placeholder = "Select date",
  align = "start",
  disableBeforeToday = false,
  className,
  contentClassName,
}: SubscriptionDatePickerProps) {
  const today = dayjs().startOf("day").toDate();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {value ? dayjs(value).format(DATE_FORMAT) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-[280px] p-0", contentClassName)}
        align={align}
      >
        <Calendar
          className="w-full"
          mode="single"
          selected={value ? dayjs(value).toDate() : undefined}
          onSelect={(date) => {
            if (!date) {
              return;
            }
            onChange(dayjs(date).format("YYYY-MM-DD"));
          }}
          disabled={disableBeforeToday ? { before: today } : undefined}
        />
      </PopoverContent>
    </Popover>
  );
}
