import { NextRequest, NextResponse } from "next/server";

import { apiRequireAdmin } from "@/lib/auth/api-require-admin";

import { GET as summaryGET } from "../route";
import { GET as affiliateCommissionsGET } from "../affiliate-commissions/route";
import { GET as extraAdAccountsGET } from "../extra-ad-accounts/route";
import { GET as feesGET } from "../fees/route";
import { GET as profitGET } from "../profit/route";
import { GET as registrationsGET } from "../registrations/route";
import { GET as subscriptionsGET } from "../subscriptions/route";
import { GET as topupsGET } from "../topups/route";
import { GET as walletGET } from "../wallet/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/stats/batch?datasets=a,b,c&from=…&to=…
 *
 * The dashboard needs five to six of these datasets at once. Asking for them
 * one endpoint at a time cost five separate function invocations, and each
 * one paid the same two serial round trips to Supabase (validate the JWT,
 * then read the profile) before it ran a single query of its own. Measured on
 * production over a phone connection, the five calls took 1.3s, 2.5s, 2.8s,
 * 3.0s and 3.2s — in parallel, contending for the same connections — which
 * is most of the five seconds between signing in and seeing a dashboard.
 *
 * Batched, the auth happens ONCE (apiRequireAdmin is per-request cached) and
 * the datasets run concurrently inside one invocation.
 *
 * Each handler is reused verbatim, so the individual endpoints stay the
 * source of truth and keep working for anything that calls them directly.
 * They read nothing from the request but `from`/`to`, which the batch request
 * already carries — so the same request object is simply passed through.
 */
const HANDLERS: Record<
  string,
  (request: NextRequest) => Promise<Response>
> = {
  summary: () => summaryGET(),
  topups: (r) => topupsGET(r),
  fees: (r) => feesGET(r),
  profit: (r) => profitGET(r),
  subscriptions: (r) => subscriptionsGET(r),
  registrations: (r) => registrationsGET(r),
  "extra-ad-accounts": (r) => extraAdAccountsGET(r),
  "affiliate-commissions": (r) => affiliateCommissionsGET(r),
  wallet: (r) => walletGET(r),
};

// A ceiling so a crafted URL cannot ask for the same expensive dataset a
// hundred times in one invocation.
// Nine datasets exist and the owner dashboard mounts eight of them at
// once, so a cap of 8 silently dropped the last card in the grid.
const MAX_DATASETS = 12;

export async function GET(request: NextRequest) {
  // ── THE BOUNDARY REFUSES, NOT ONLY THE DELEGATES ──────────────────
  //
  // This was the one /api/stats route with no guard of its own. Each
  // delegate does refuse — but the loop below catches that refusal and
  // returns HTTP 200 with {"profit":{"ok":false,"status":403}}, which
  // is per-dataset reporting doing exactly what it was written for and
  // turning an authorisation failure into a successful response.
  //
  // Today's only consumer maps !ok to isError, so nothing renders a
  // fabricated zero. That is the consumer being careful, not the route
  // being safe: the next caller to read `.data` without checking `ok`
  // gets {} where it should get a refusal, and an advertiser can
  // already call this URL and watch it answer 200.
  //
  // Admin here, not owner: four of the nine datasets are admin-level
  // and refusing the whole batch at owner level would break the admin
  // dashboard. The owner-only delegates still refuse individually.
  const { error: authError } = await apiRequireAdmin();
  if (authError) return authError;

  const requested = (request.nextUrl.searchParams.get("datasets") ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => Object.hasOwn(HANDLERS, name));

  const datasets = [...new Set(requested)].slice(0, MAX_DATASETS);

  if (!datasets.length) {
    return NextResponse.json(
      { error: "No known datasets requested" },
      { status: 400 },
    );
  }

  const entries = await Promise.all(
    datasets.map(async (name) => {
      try {
        const res = await HANDLERS[name](request);
        const body = await res.json();
        // A failed dataset must not blank the whole dashboard — the other
        // cards are still true. It is reported per dataset so the card that
        // owns it can show its own error instead of an empty state, which
        // would read as "there is nothing here".
        return [name, res.ok ? { ok: true, data: body } : { ok: false, status: res.status }];
      } catch {
        return [name, { ok: false, status: 500 }];
      }
    }),
  );

  return NextResponse.json(Object.fromEntries(entries), {
    headers: { "Cache-Control": "no-store" },
  });
}
