import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Re-export the pure helpers so consumers can keep importing from @/lib/utils.
export {
  generateSlug,
  getInitials,
  formatRate,
  calculateTopupAmount,
  formatCurrency,
} from "./utils-pure";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY;

export const getURL = () => {
  let url = process?.env?.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  url = url.startsWith("http") ? url : `https://${url}`;

  url = url.endsWith("/") ? url : `${url}/`;
  return url;
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

