import { DATE_TIME_FORMAT } from "@/lib/constants";
import dayjs from "dayjs";
import { ExtraAdAccountAdvertiserProfile } from "./types";

export function formatExtraAdAccountAmount(amount: number | string | null) {
  const value = Number(amount ?? 0);

  if (!Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatExtraAdAccountCreatedAt(createdAt?: string | null) {
  if (!createdAt) {
    return "-";
  }

  const date = dayjs(createdAt);
  return date.isValid() ? date.format(DATE_TIME_FORMAT) : "-";
}

export function getAdvertiserName(profile: ExtraAdAccountAdvertiserProfile) {
  if (Array.isArray(profile)) {
    return profile[0]?.full_name ?? "-";
  }

  return profile?.full_name ?? "-";
}
