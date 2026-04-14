import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ExchangeRate } from "./types/exchange-rates";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY;

export const generateSlug = (value: string) => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // remove special chars
    .replace(/\s+/g, "-"); // spaces -> dashes
};

export const getURL = () => {
  let url = process?.env?.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  url = url.startsWith("http") ? url : `https://${url}`;

  url = url.endsWith("/") ? url : `${url}/`;
  return url;
};

export const getInitials = (name: string) => {
  return name
    .split(" ")
    .map((c: string) => c[0])
    .join("");
};

export const formatRate = (rate: number | null | undefined) => {
  if (rate === null || rate === undefined) return;
  return parseFloat(rate.toFixed(8));
};

export const calculateTopupAmount = (
  amountReceived: number,
  exchangeRates: ExchangeRate[] | undefined,
  currency: string,
  fee: number,
) => {
  if (!exchangeRates) return { topupAmount: 0, amountUSD: 0, feeAmount: 0 };

  const rate =
    currency === "USD"
      ? 1
      : Number(exchangeRates[0][currency.toLowerCase() as keyof ExchangeRate]);

  const amountUSD = amountReceived * rate;

  const feeAmount = amountUSD * (fee / 100);
  const topupAmount = amountUSD - feeAmount;
  return { topupAmount, amountUSD, feeAmount };
};

export async function enablePush() {
  if (!("serviceWorker" in navigator)) throw new Error("No SW support");

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return;

  const reg = await navigator.serviceWorker.ready;

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    ),
  });

  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sub),
  });
}

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const formatCurrency = (
  value: number,
  currency: "USD" | "EUR" | string = "USD",
) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
};
