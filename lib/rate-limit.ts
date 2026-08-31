import { createClient } from "@/lib/supabase/server";

export { callerIp } from "./pure-request";

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
  // A single browser tab beats /api/heartbeat every 5 minutes = 12/hour.
  // 60/hour per IP is 5x that headroom, still catches scripted abuse.
  heartbeat: { bucket: "heartbeat", max: 60, windowSeconds: 3600 },
  // Client-error reports: cap per-IP to catch a runaway retry loop
  // without losing legitimate boundary catches.
  clientErrorLog: {
    bucket: "client-error-log",
    max: 60,
    windowSeconds: 3600,
  },
  // GDPR export is expensive (many joined queries). Cap the frequency
  // per user so a runaway script or accidental button-mash doesn't
  // knock over the DB.
  gdprExport: { bucket: "gdpr-export", max: 10, windowSeconds: 3600 },
  // Customer-initiated financial requests (wallet top-up, ad-account
  // request, ad-account withdrawal). Generous for a human, but stops a
  // scripted/compromised account from flooding the admin queue. Keyed
  // per user.
  financialRequest: {
    bucket: "financial-request",
    max: 30,
    windowSeconds: 3600,
  },
} as const;
