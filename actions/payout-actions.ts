"use server";

import { createClient } from "@/lib/supabase/server";
import { maintenanceGuard } from "./_shared";

// ── ASKING TO BE PAID, AND BEING PAID ───────────────────────────────────
//
// Until now "Request payout" opened WhatsApp with a sentence in it.
// Nothing was recorded: no amount, no date, no status. The owner had no
// queue, the affiliate could not see whether anything was happening, and
// settling meant ticking commissions one by one — which is exactly what
// the owner said it must not be ("dat moeten we in bulk doen").
//
// The amount is fixed the moment it is asked for: the RPC hangs the exact
// commission rows on the payout (payout_id), so it cannot drift while it
// waits, and the same commission can never be in two payouts.
//
// Every write here goes through a SECURITY DEFINER RPC (plak 50): the
// table is readable and not writable from a session.

type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

const MISSING = /PGRST202|could not find the function|does not exist|schema cache/i;

/**
 * The database has not had plak 50 yet — the feature stays dark.
 *
 * NOT exported: a "use server" file may export only async functions, and
 * Next refuses the BUILD over it. That is how two deploys failed while
 * tsc, lint and the tests were all green — the gate does not run
 * `next build`, so this class of error only shows up on Vercel.
 */
function isPayoutsMissing(message: string): boolean {
  return MISSING.test(message);
}

export type PayoutDetails = {
  holder?: string;
  accountType?: string;
  taxId?: string;
  address?: string;
  iban?: string;
  bic?: string;
  bankName?: string;
  accountNumber?: string;
  routing?: string;
  note?: string;
};

export type PayoutRequested = {
  payoutId: string;
  amount: number;
  currency: string;
  commissions: number;
  clawbacks: number;
};

export async function requestAffiliatePayout(
  currency: "EUR" | "USD",
  details: PayoutDetails,
): Promise<ActionResult<PayoutRequested>> {
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false, error: mm.error };

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: "Please sign in and try again." };
  }

  // Only the fields the payout form asks for, trimmed. Never the whole
  // object the caller happens to send.
  const clean: PayoutDetails = {};
  const keys: (keyof PayoutDetails)[] = [
    "holder",
    "accountType",
    "taxId",
    "address",
    "iban",
    "bic",
    "bankName",
    "accountNumber",
    "routing",
    "note",
  ];
  for (const k of keys) {
    const v = details?.[k];
    if (typeof v === "string" && v.trim()) clean[k] = v.trim().slice(0, 200);
  }

  const { data, error } = await supabase.rpc("affiliate_payout_request", {
    p_currency: currency,
    p_details: clean,
  });
  if (error) {
    if (isPayoutsMissing(error.message)) {
      return {
        ok: false,
        error: "Payouts are being switched on. Message us and we'll sort it by hand.",
      };
    }
    return { ok: false, error: error.message };
  }

  const r = (data ?? {}) as {
    payout_id?: string;
    amount?: number | string;
    currency?: string;
    commissions?: number;
    clawbacks?: number | string;
  };
  return {
    ok: true,
    data: {
      payoutId: String(r.payout_id ?? ""),
      amount: Number(r.amount) || 0,
      currency: String(r.currency ?? currency).toUpperCase(),
      commissions: Number(r.commissions) || 0,
      clawbacks: Number(r.clawbacks) || 0,
    },
  };
}

export async function cancelAffiliatePayout(payoutId: string): Promise<ActionResult> {
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false, error: mm.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("affiliate_payout_cancel", { p_payout_id: payoutId });
  if (error) {
    return {
      ok: false,
      error: isPayoutsMissing(error.message)
        ? "Payouts are being switched on in the database."
        : error.message,
    };
  }
  return { ok: true, data: null };
}

/**
 * The owner settles it. "paid" records what they transferred — it does not
 * move money — and marks exactly the commissions on this payout as paid,
 * with the date. "reject" hands those commissions back to the queue and
 * says why.
 */
export async function decideAffiliatePayout(
  payoutId: string,
  action: "paid" | "reject",
  opts: { reason?: string; reference?: string } = {},
): Promise<ActionResult<{ commissions: number }>> {
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false, error: mm.error };

  if (action === "reject" && (opts.reason ?? "").trim().length < 3) {
    return { ok: false, error: "Say why, so they know." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("affiliate_payout_decide", {
    p_payout_id: payoutId,
    p_action: action,
    p_reason: opts.reason ?? null,
    p_reference: opts.reference ?? null,
  });
  if (error) {
    return {
      ok: false,
      error: isPayoutsMissing(error.message)
        ? "Settling payouts is not switched on in the database yet (plak 50)."
        : error.message,
    };
  }
  const r = (data ?? {}) as { commissions?: number };
  return { ok: true, data: { commissions: Number(r.commissions) || 0 } };
}
