import { createClient } from "@/lib/supabase/server";
import type { NextRequest } from "next/server";

/**
 * Returns the caller's best-effort IP address. Behind Vercel/CDN this
 * lands in `x-forwarded-for` (first entry). Falls back to a constant so
 * rate limits still apply when the address is unavailable.
 */
export function callerIp(req: NextRequest | Request): string {
  const headers = "headers" in req ? req.headers : new Headers();
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export type RateLimitSpec = {
  bucket: string;
  max: number;
  windowSeconds: number;
};

/**
 * Distributed rate-limit check. Returns `true` when the request may
 * proceed. Fails open on DB error so that a Supabase outage doesn't
 * take the app down; the DB-side function is designed to be cheap.
 *
 * Prefer namespacing keys with a stable prefix, e.g. "send-invite:ip:1.2.3.4".
 */
export async function rateLimitCheck(
  spec: RateLimitSpec,
  keySuffix: string,
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const key = `${spec.bucket}:${keySuffix}`;
    const { data, error } = await supabase.rpc("rate_limit_check", {
      p_key: key,
      p_max_requests: spec.max,
      p_window_seconds: spec.windowSeconds,
    });
    if (error) {
      // Fail open — surface only in server logs.
      console.error("rate_limit_check failed:", error.message);
      return true;
    }
    return data === true;
  } catch (err) {
    console.error(
      "rate_limit_check exception:",
      err instanceof Error ? err.message : "unknown",
    );
    return true;
  }
}

// Preset limits — tune as needed.
export const LIMITS = {
  sendInvite: { bucket: "send-invite", max: 20, windowSeconds: 3600 },
  acceptInvite: { bucket: "accept-invite", max: 10, windowSeconds: 3600 },
  signup: { bucket: "signup", max: 5, windowSeconds: 3600 },
  pushSubscribe: { bucket: "push-subscribe", max: 20, windowSeconds: 3600 },
} as const;
