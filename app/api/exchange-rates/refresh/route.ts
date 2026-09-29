import { NextResponse } from "next/server";

import { isMaintenanceMode } from "@/actions/_shared";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
import { rateAge, RATE_STALE_HOURS } from "@/lib/pure-rate-guard";
import { refreshExchangeRates } from "@/lib/refresh-exchange-rates";

// ── A STALE RATE GETS REFRESHED BY WHOEVER NOTICES ──────────────────
//
// The hourly cron is registered in vercel.json and does not keep to it.
// Measured on production 27-09: it fired once at 08:00:26, then missed
// 09, 10, 11, 12 and 13 — five hours, no write, and no integration alert
// either, so the function did not run at all rather than failing. The
// stored rate was 5,5 hours old and climbing, and EVERY EUR/USD figure in
// the app comes off that one row: the EUR 50 request fee, wallet
// exchanges, converted affiliate payouts, the tier ladder.
//
// So this does not replace the cron, it removes the dependency on it.
// useUsdToEur reads the row on every money screen; when what it read is
// older than RATE_STALE_HOURS it calls this once, and the next reader
// finds a fresh row.
//
// WHY THIS IS NOT "FETCH LIVE PER CALCULATION", which the cron's own note
// argues against: nothing here is per calculation. It writes the same
// single stored row that everything else reads, at most once per stale
// window, and the amount a customer is charged still comes from that row
// — never from this response. What a dispute asks is "which rate did we
// use", and the answer is still the row.
//
// THE GUARDS, because this is a write that a page load can trigger:
//   - a signed-in caller only. Anonymous gets 401, so nobody can make us
//     hammer the provider from the outside.
//   - the age is checked SERVER-SIDE before anything is fetched. A client
//     that calls this in a loop gets "fresh" back and touches nothing.
//   - MAINTENANCE_MODE freezes it like every other write.
//   - the band in refreshExchangeRates still applies, so a nonsense
//     response from the provider is refused and alerted, not stored.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Supabase server env not configured" },
      { status: 500 },
    );
  }

  // Signed in, and that is the whole authorisation. Any profile in any
  // tenant reads this rate already (policy `exchange_rates_select`), and
  // what this does is make the figure they are about to be charged on
  // current. There is nothing here to gate on a role.
  // Still refuse an anonymous caller. The id itself is no longer kept
  // here: createAdminClient reads the session and carries the name
  // into the audit row for us.
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: "Sign in first" }, { status: 401 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: safeErrorMessage(e) },
      { status: 500 },
    );
  }
  if (isMaintenanceMode()) {
    return NextResponse.json({ ok: true, skipped: "maintenance" });
  }

  // ── THE CALLER IS KNOWN. WRITE IT DOWN. ─────────────────
  //
  // This route authenticated the caller at the top, captured their id,
  // and then threw it away with `void userId` before building a raw
  // service client. So a signed-in person changed the FX rate that
  // every customer is charged on, and the audit row landed with no
  // name — indistinguishable from the hourly cron.
  //
  // It matters more now than it did: with two owners (plak 143), "who
  // moved the rate" is a question that can actually be asked of two
  // different people.
  //
  // `createAdminClient()` reads the session itself and attaches the
  // `x-psm-actor` header that `_audit_row_change` reads (plak 132), so
  // this is the same service-role client with a name on it.
  const admin = await createAdminClient();

  // ---- IS IT ACTUALLY STALE? --------------------------------------
  //
  // Asked here and not taken from the caller: the client says "the row I
  // read looked old", and that is a hint, not a fact. Another reader may
  // have refreshed it a second ago.
  //
  // The FRESHEST active row decides. Rows are per tenant and the job
  // writes them all in one pass, so if the newest is fresh they all are;
  // taking the oldest would let one abandoned tenant trigger a fetch on
  // every single page load.
  const { data: rows, error: ageErr } = await admin
    .from("exchange_rates")
    .select("updated_at")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (ageErr) {
    return NextResponse.json(
      { ok: false, error: "Could not read the stored rates" },
      { status: 500 },
    );
  }
  const newest = (rows?.[0] as { updated_at?: string } | undefined)?.updated_at;
  // No row at all is not "fresh" — there is nothing to be fresh. Let the
  // refresh run; it writes only rows that exist, so at worst it is a
  // provider call that updates nothing and says so.
  if (newest) {
    const age = rateAge(newest);
    if (!age.stale) {
      return NextResponse.json({
        ok: true,
        skipped: "fresh",
        hours: age.hours,
        staleAfterHours: RATE_STALE_HOURS,
      });
    }
  }

  const out = await refreshExchangeRates(admin);
  return NextResponse.json(out, { status: out.ok ? 200 : 502 });
}
