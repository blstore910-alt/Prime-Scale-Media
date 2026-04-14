import { DATE_FORMAT } from "@/lib/constants";
import dayjs from "dayjs";
import { SubscriptionStatus } from "./types";

export function getTodayDateValue() {
  return dayjs().format("YYYY-MM-DD");
}

export function formatSubscriptionDate(dateValue?: string | null) {
  if (!dateValue) {
    return "-";
  }

  const date = dayjs(dateValue);
  return date.isValid() ? date.format(DATE_FORMAT) : "-";
}

export function formatSubscriptionAmount(amount: number | string | null) {
  const value = Number(amount ?? 0);

  if (!Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function resolveStatusFromQuery(
  value: string | null,
): SubscriptionStatus | "all" {
  if (value === "active" || value === "inactive" || value === "paused") {
    return value;
  }

  return "all";
}

export function getStatusBadgeClassName(status: SubscriptionStatus) {
  if (status === "active") {
    return "bg-green-500 hover:bg-green-600 text-white";
  }

  if (status === "inactive") {
    return "bg-destructive hover:bg-destructive/90 text-white";
  }

  return "bg-yellow-500 hover:bg-yellow-600 text-black";
}

export function calculateNextPaymentDate(startDateValue: string) {
  const startDate = dayjs(startDateValue).startOf("day");

  if (!startDate.isValid()) {
    return null;
  }

  const today = dayjs().startOf("day");

  if (startDate.isAfter(today) || startDate.isSame(today, "day")) {
    return startDate;
  }

  const monthsDiff = today.diff(startDate, "month");
  let candidate = startDate.add(monthsDiff, "month");

  if (candidate.isBefore(today, "day")) {
    candidate = candidate.add(1, "month");
  }

  return candidate;
}

