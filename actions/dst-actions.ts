"use server";

/**
 * DST (digital services tax), recharged to the customer.
 *
 * WHY THIS EXISTS. The supplier debits DST from PSM's own balance, so it
 * is OUR cost first and has to be recharged per advertiser -- weekly,
 * which is the cadence it arrives in and which does not fit the monthly
 * subscription run. Until the supplier's API exposes it per ad account,
 * an admin types it in: a period, a country and the spend behind it.
 *
 * Both writes go through SECURITY DEFINER RPCs (plak 65). `dst_charges`
 * is revoked for a session at table level, so this file is not one door
 * among several -- it is the only one, and it adds the maintenance
 * freeze and the tenant guard the RPCs alone do not carry.
 */

import { resolveAdminContext } from "./_shared";
import { safeErrorMessage } from "@/lib/pure-error";

type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

export type DstLineInput = {
  countryCode: string;
  /** The spend in that country over the period. */
  baseAmount: number;
  /** Only when the admin overrides the country's own rate. */
  ratePct?: number | null;
};

/**
 * Record one week of DST for one customer, one line per country.
 *
 * The lines go in one at a time, so a failure half way leaves the
 * earlier ones standing. There is no cancel RPC yet, so rather than
 * pretend otherwise the error says how far it got -- a half-recorded
 * week that LOOKS whole is the dangerous version.
 */
export async function recordDstCharges(input: {
  advertiserId: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  accountId?: string | null;
  note?: string | null;
  lines: DstLineInput[];
}): Promise<ActionResult<{ recorded: number; total: number }>> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth.ctx;

  const lines = (input.lines ?? []).filter(
    (l) => l && String(l.countryCode ?? "").trim() && Number(l.baseAmount) > 0,
  );
  if (!lines.length) {
    return { ok: false, error: "Fill in at least one country with an amount." };
  }
  if (!input.periodStart || !input.periodEnd) {
    return { ok: false, error: "Pick a period." };
  }
  if (input.periodEnd < input.periodStart) {
    return { ok: false, error: "The period runs backwards." };
  }

  const written: string[] = [];
  let total = 0;
  for (const line of lines) {
    const { data, error } = await supabase.rpc("dst_charge_record", {
      p_advertiser_id: input.advertiserId,
      p_period_start: input.periodStart,
      p_period_end: input.periodEnd,
      p_country_code: String(line.countryCode).trim().toUpperCase(),
      p_base_amount: Number(line.baseAmount),
      p_rate_pct:
        line.ratePct === null || line.ratePct === undefined || line.ratePct === ("" as unknown)
          ? null
          : Number(line.ratePct),
      p_currency: String(input.currency ?? "EUR").toUpperCase(),
      p_account_id: input.accountId ?? null,
      p_note: input.note ?? null,
    });
    if (error) {
      // These are separate statements, so a failure half way leaves the
      // earlier lines standing. There is no cancel RPC yet, and silently
      // leaving them would show a half-recorded week as a whole one --
      // so say exactly how far it got. The screen lists them as
      // reserved, where they can be seen and invoiced or left.
      const how = safeErrorMessage(error);
      return {
        ok: false,
        error: written.length
          ? `${how} — note: the first ${written.length} ${
              written.length === 1 ? "line is" : "lines are"
            } already recorded. Check the list before doing this again.`
          : how,
      };
    }
    const row = data as { id?: string; dst_amount?: number | string } | null;
    if (row?.id) written.push(row.id);
    total += Number(row?.dst_amount ?? 0);
  }

  return {
    ok: true,
    data: { recorded: written.length, total: Math.round(total * 100) / 100 },
  };
}

/** Turn reserved lines into one invoice the customer pays from their wallet. */
export async function invoiceDstCharges(
  ids: string[],
): Promise<ActionResult<{ invoiceId: string; total: number; currency: string }>> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth.ctx;

  const clean = (ids ?? []).filter(Boolean);
  if (!clean.length) return { ok: false, error: "No lines picked." };

  const { data, error } = await supabase.rpc("dst_charge_invoice", { p_ids: clean });
  if (error) return { ok: false, error: safeErrorMessage(error) };

  const inv = data as
    | { id?: string; total?: number | string; currency?: string | null }
    | null;
  if (!inv?.id) return { ok: false, error: "The invoice was not created." };

  return {
    ok: true,
    data: {
      invoiceId: inv.id,
      total: Number(inv.total ?? 0),
      currency: String(inv.currency ?? "EUR"),
    },
  };
}

/**
 * One period, one country, every customer at once.
 *
 * The supplier bills us per week for the whole book, not per customer,
 * so typing it in one customer at a time is the wrong shape of work:
 * twelve dialogs for one debit. This takes the week, the country and a
 * spend per customer, and records a line for each one that has any.
 *
 * Customers with nothing are skipped rather than written as zero -- a
 * zero line is a claim that we checked and they owed nothing, and that
 * is not what an empty box means.
 */
export async function recordDstChargesBulk(input: {
  periodStart: string;
  periodEnd: string;
  countryCode: string;
  currency: string;
  ratePct?: number | null;
  note?: string | null;
  rows: { advertiserId: string; baseAmount: number }[];
}): Promise<
  ActionResult<{ recorded: number; total: number; skipped: number; failed: string[] }>
> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth.ctx;

  if (!input.periodStart || !input.periodEnd) {
    return { ok: false, error: "Pick a period." };
  }
  if (input.periodEnd < input.periodStart) {
    return { ok: false, error: "The period runs backwards." };
  }
  if (!String(input.countryCode ?? "").trim()) {
    return { ok: false, error: "Pick a country." };
  }

  const rows = (input.rows ?? []).filter(
    (r) => r && r.advertiserId && Number(r.baseAmount) > 0,
  );
  if (!rows.length) {
    return { ok: false, error: "Fill in a spend for at least one customer." };
  }

  let recorded = 0;
  let total = 0;
  const failed: string[] = [];

  for (const row of rows) {
    const { data, error } = await supabase.rpc("dst_charge_record", {
      p_advertiser_id: row.advertiserId,
      p_period_start: input.periodStart,
      p_period_end: input.periodEnd,
      p_country_code: String(input.countryCode).trim().toUpperCase(),
      p_base_amount: Number(row.baseAmount),
      p_rate_pct:
        input.ratePct === null || input.ratePct === undefined
          ? null
          : Number(input.ratePct),
      p_currency: String(input.currency ?? "EUR").toUpperCase(),
      p_account_id: null,
      p_note: input.note ?? null,
    });
    // ONE CUSTOMER FAILING MUST NOT TAKE THE WEEK DOWN. The others are
    // already written and are visible as reserved; naming the ones that
    // did not land is more useful than refusing the whole batch.
    if (error) {
      failed.push(row.advertiserId);
      continue;
    }
    const r = data as { dst_amount?: number | string } | null;
    recorded += 1;
    total += Number(r?.dst_amount ?? 0);
  }

  return {
    ok: true,
    data: {
      recorded,
      total: Math.round(total * 100) / 100,
      skipped: (input.rows ?? []).length - rows.length,
      failed,
    },
  };
}
