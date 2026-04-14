import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { DateRange } from "react-day-picker";

dayjs.extend(utc);

export type DashboardPeriod = "today" | "week" | "month" | "year";

export type DashboardDateRange = DateRange | undefined;

export function getPeriodRange(
  period: DashboardPeriod,
  dateRange?: DashboardDateRange
) {
  if (dateRange?.from && dateRange?.to) {
    const start = dayjs(dateRange.from).utc().startOf("day");
    const end = dayjs(dateRange.to).utc().startOf("day").add(1, "day");
    return { from: start.toISOString(), to: end.toISOString() };
  }

  const now = dayjs().utc();

  if (period === "year") {
    const start = now.startOf("year");
    return {
      from: start.toISOString(),
      to: start.add(1, "year").toISOString(),
    };
  }

  if (period === "month") {
    const start = now.startOf("month");
    return {
      from: start.toISOString(),
      to: start.add(1, "month").toISOString(),
    };
  }

  if (period === "week") {
    const start = now.startOf("week");
    return {
      from: start.toISOString(),
      to: start.add(1, "week").toISOString(),
    };
  }

  const start = now.startOf("day");
  return { from: start.toISOString(), to: start.add(1, "day").toISOString() };
}
