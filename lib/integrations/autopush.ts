// Auto-push safety gate.
//
// "Auto-push" = when an ad-account top-up is marked completed (we have the
// advertiser's money), we automatically tell the supplier to fund the ad
// account, instead of an admin doing it by hand in the supplier's portal.
//
// That moves REAL money on a REAL supplier account, so it is locked behind
// TWO independent switches that must BOTH be set. Neither has a permissive
// default, and neither is inferred from anything else:
//
//   SUPPLIER1_MODE=live        — the adapter talks to the real API at all
//   SUPPLIER1_AUTOPUSH=on      — and we're allowed to originate pushes
//
// Why two and not one: SUPPLIER1_MODE=live is also what enables the
// read-only paths (balance check, ad-account sync, the pool page). Those are
// safe and we want them on well before we trust the write path. Folding both
// into one flag would mean "let me see the real inventory" and "let me spend
// real money" are the same decision. They are not.
//
// Consulted in two places, on purpose (defence in depth):
//   1. the enqueue side — no integration_jobs row is even created
//   2. the worker — a row that already exists is never dispatched
// So enabling it mid-flight can't drain a backlog of jobs queued during
// testing, and disabling it mid-flight stops in-flight work.

export type AutoPushGate = {
  enabled: boolean;
  /** Human-readable reason, always set — logged/surfaced when blocked. */
  reason: string;
  mode: string;
  flag: string;
};

// Explicit opt-in strings only. A typo, an empty string, "false", "0", or a
// leftover "mock" all read as OFF — the flag has to be deliberately correct
// to arm, never merely present.
const ON_VALUES = new Set(["on", "true", "1", "enabled", "yes"]);

/**
 * The ONE reading of SUPPLIER1_MODE. Every consumer must use this.
 *
 * The gate trimmed the value and getSupplier1Adapter did not, so
 * SUPPLIER1_MODE="live " (a trailing space from the Vercel env UI, or a
 * newline from `vercel env add` reading a file) armed the money gate while
 * handing the job to the MOCK adapter — which reports success. Two switches
 * that disagree about what "live" means is worse than either being wrong.
 */
export function supplier1Mode(
  env: Record<string, string | undefined> = process.env,
): string {
  return (env.SUPPLIER1_MODE ?? "mock").trim().toLowerCase();
}

export function isSupplier1Live(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return supplier1Mode(env) === "live";
}

export function autoPushGate(
  env: Record<string, string | undefined> = process.env,
): AutoPushGate {
  const mode = supplier1Mode(env);
  const flag = (env.SUPPLIER1_AUTOPUSH ?? "").toLowerCase().trim();

  if (mode !== "live") {
    return {
      enabled: false,
      reason: `supplier is in ${mode || "mock"} mode — no real pushes`,
      mode,
      flag,
    };
  }
  if (!ON_VALUES.has(flag)) {
    return {
      enabled: false,
      reason:
        "SUPPLIER1_AUTOPUSH is not on — pushes stay manual (admin funds the account in the supplier portal)",
      mode,
      flag,
    };
  }
  return { enabled: true, reason: "auto-push armed", mode, flag };
}

export function autoPushEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return autoPushGate(env).enabled;
}
