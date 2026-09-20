"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import {
  maintenanceGuard,
  resolveUserContext,
  type ActionResult,
  versionMatches,
  wroteSomething,
} from "./_shared";
import {
  calculateTopupAmount,
  convertibleCurrency,
  type MinimalRate,
} from "@/lib/utils-pure";
import { safeErrorMessage } from "@/lib/pure-error";
import { isAccountLocked } from "@/lib/pure-account-status";
import { enqueueSupplierTopupPush } from "@/lib/integrations/enqueue";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyAdvertiser } from "@/lib/notify-advertiser";
import { sameSlug } from "@/lib/pure-slug-key";

// Ad-account top-up types that carry a fee (mirrors the topup form).
const FEE_APPLICABLE_TYPES = ["top-up", "first-top-up"];

/**
 * The fee this top-up actually carries.
 *
 * PRECEDENCE, MOST SPECIFIC FIRST:
 *
 *   1. the AD ACCOUNT's own fee (ad_accounts.fee), when one is set
 *   2. the advertiser's plan rate (advertiser_plans.topup_fee_pct)
 *   3. whatever the caller sent (the ad-account type's default)
 *
 * then perks adjust the winner: a topup_fee_waiver zeroes it, a
 * topup_discount subtracts its percent.
 *
 * THIS ORDER WAS THE OTHER WAY AROUND, and it cost money. The plan won
 * unconditionally and the account's own fee was passed in merely as the
 * fallback for advertisers who had no plan — so an admin who set 4% on one
 * specific ad account, against a 3% plan, was silently charged 3%. The
 * account is the more specific statement about this account, and the owner's
 * rule is that it wins: "acc is 3% fee but ad acc is 4%, of course ad acc
 * should win with 4%."
 *
 * READ FROM THE DATABASE, never from the payload. That is what keeps the
 * anti-tampering property the old order was built for: ad_accounts.fee is a
 * value an admin stored, not something a browser can claim. The caller's
 * `fee` is still only a last resort.
 *
 * A ZERO ON THE ACCOUNT IS TREATED AS "NOT SET". ad_accounts.fee is not
 * nullable everywhere, and a column defaulting to 0 across a live table
 * would otherwise silently drop every planned customer to a 0% fee the
 * moment this shipped — a much worse fault than the one being fixed. A
 * deliberate 0% for one customer is expressed with a topup_fee_waiver perk,
 * which already exists and is auditable.
 */
async function resolveEffectiveFeePct(
  supabase: SupabaseClient,
  advertiserId: string,
  fallbackPct: number,
  adAccountId?: string | null,
  // ── HAS THE CALLER'S FIGURE ALREADY HAD THE PREMIUM POINTS OFF? ─────
  //
  // verifyAdTopup passes the row's STORED fee, which was created with the
  // two Meta-EU-Premium points already taken off — subtracting them again
  // put the floor BELOW the row's own rate, so that branch stopped
  // applying them. But the two CREATE paths pass the ad-account type's
  // default, which has NOT been discounted, and they inherited the same
  // branch: the dialog previewed a premium top-up at 3% and the server
  // stored 5%, crediting the account about $23 less on EUR 1,000 than
  // the admin had just been shown. That is the exact fault the long note
  // further down says this arrangement exists to prevent.
  //
  // One flag, set by the caller who knows which figure it is holding.
  fallbackAlreadyDiscounted = false,
): Promise<{ applied: boolean; pct: number }> {
  let accountPct: number | null = null;
  // THE PLATFORM DISCOUNT LIVES HERE NOW, not beside one caller.
  //
  // A Meta-EU-Premium account gets two points off. That was written into
  // the single-create path only, so the bulk path charged the full rate
  // for the same account, and the verify FLOOR compared against a rate
  // two points above what the row was legitimately created at — which
  // refused any non-owner adjusting a premium top-up at all, including
  // raising it. One rule, in the one function that knows the account.
  let isPremium = false;
  if (adAccountId) {
    // ── AND THIS READ FAILS LOUDLY TOO ────────────────────────────────
    //
    // The plan and perk reads six lines down throw on a real failure,
    // for the reason written there: "the alternative is charging
    // somebody a fee they were promised they would not pay." This one
    // discarded its error, and it is the read that matters MOST --
    // accountPct wins over the plan and over the fallback, so losing it
    // does not fall back to the account's rate, it falls THROUGH to the
    // plan's.
    //
    // An account negotiated at 3% whose customer is on a 5% plan is
    // charged 5% -- EUR 200 over-collected on a EUR 10,000 top-up, on
    // every top-up of that account, for ever, with nothing on screen.
    // And isPremium goes false with it, withholding the Meta-EU-Premium
    // two points as well: another EUR 200 on the same transfer.
    //
    // maybeSingle() is the other half: it answers null with NO error for
    // a row RLS refused or that is simply gone. An ad-account id we were
    // handed and cannot read is not a reason to price the top-up from
    // something else -- the quote path already refuses in that case
    // (see quoteTopupFeePct), and now so does this.
    const { data: acct, error: acctError } = await supabase
      .from("ad_accounts")
      .select("fee, platform")
      .eq("id", adAccountId)
      .maybeSingle();
    if (acctError) {
      throw new Error(
        `the ad account's own fee could not be read (${safeErrorMessage(acctError)})`,
      );
    }
    if (!acct) {
      throw new Error(
        "the ad account this top-up is for could not be read, so its fee is unknown",
      );
    }
    const row = acct as
      | { fee?: number | string | null; platform?: string | null }
      | null;
    const raw = row?.fee;
    const n = raw === null || raw === undefined ? NaN : Number(raw);
    if (Number.isFinite(n) && n > 0) accountPct = n;
    // sameSlug, not ===. A type created through the settings screen
    // is slugified from its LABEL, so "Meta-EU-Premium" is stored as
    // `meta-eu-premium` and an exact compare withheld the 2-point
    // discount for ever -- EUR 200 over-collected on a EUR 10,000
    // top-up, silently. See lib/pure-slug-key.
    isPremium = sameSlug(row?.platform, "eu-meta-premium");
  }

  const { data: plan, error: planError } = await supabase
    .from("advertiser_plans")
    .select("topup_fee_pct")
    .eq("advertiser_id", advertiserId)
    .maybeSingle();

  const { data: perks, error: perksError } = await supabase
    .from("advertiser_perks")
    .select("kind, amount, starts_at, expires_at")
    .eq("advertiser_id", advertiserId)
    .eq("active", true)
    .in("kind", ["topup_fee_waiver", "topup_discount"]);

  // ── A FAILED PERK READ IS NOT "THEY HAVE NO PERKS" ────────────────
  //
  // Both errors were discarded, so a refused read was indistinguishable
  // from a customer with nothing granted -- and a customer sitting on a
  // 100% top-up fee WAIVER was charged the full fee, silently, on the
  // screen that quotes it and again on the server that takes it.
  //
  // A missing table is the one case that legitimately means "no perks
  // here yet": 42P01 is "relation does not exist", 42703 is a missing
  // column. Anything else is a real failure and the caller has to know,
  // because the alternative is charging somebody a fee they were
  // promised they would not pay.
  const softCodes = new Set(["42P01", "42703"]);
  const hardError = [planError, perksError].find(
    (e) => e && !softCodes.has(String((e as { code?: string }).code ?? "")),
  );
  if (hardError) {
    throw new Error(
      "We couldn't read this customer's plan and perks, so the fee cannot be worked out. Nothing has been charged.",
    );
  }

  const now = Date.now();
  const activePerks = (perks ?? []).filter((p) => {
    const started = !p.starts_at || new Date(p.starts_at).getTime() <= now;
    const notExpired =
      !p.expires_at || new Date(p.expires_at).getTime() > now;
    return started && notExpired;
  });

  const hasPlan = plan != null && plan.topup_fee_pct != null;
  const waiver = activePerks.some((p) => p.kind === "topup_fee_waiver");
  const discount = activePerks
    .filter((p) => p.kind === "topup_discount")
    .reduce((max, p) => Math.max(max, Number(p.amount) || 0), 0);

  const premium = isPremium ? 2 : 0;

  if (accountPct === null && !hasPlan && !waiver && discount === 0) {
    // ── THE CALLER'S FIGURE, UNTOUCHED ──────────────────────────────
    //
    // Nothing is configured, so there is no rate of OURS to enforce and
    // the caller's own figure stands.
    //
    // The premium two points do NOT apply again here, and that matters.
    // verifyAdTopup passes the ROW'S STORED FEE as fallbackPct — a
    // figure created with the two points already taken off. Subtracting
    // them a second time put the floor BELOW the row's own rate: a
    // premium account stored at 3% resolved a floor of 1%, so any
    // non-owner could verify at 1% and leave ~$232 uncollected on a EUR
    // 10,000 top-up. The comment further down says the fallback is
    // "exactly the figure a verify must not silently drop below"; this
    // line was dropping two points below it.
    //
    // The discount belongs to a rate we resolved, never to one we were
    // handed — UNLESS the caller tells us its figure has not had the
    // premium points off yet, which is true of both create paths and
    // false of the verify floor.
    return {
      applied: false,
      pct: Math.max(0, fallbackAlreadyDiscounted ? fallbackPct : fallbackPct - premium),
    };
  }
  const base =
    accountPct !== null
      ? accountPct
      : hasPlan
        ? Number(plan!.topup_fee_pct)
        : fallbackPct;
  // PERCENT OFF, NOT PERCENTAGE POINTS OFF.
  //
  // The promotions screen labels this "Top-up fee discount (%)", accepts
  // 0-100, and renders the row as "20% off" — and its sibling
  // subscription_discount is applied multiplicatively. This subtracted
  // the number from the RATE, so 20% granted against a 5% ad account gave
  // max(0, 5 - 20) = 0%: a EUR 10,000 top-up collected nothing instead of
  // $465, on every top-up for as long as the perk lived. Even a modest 5%
  // took the fee to zero rather than to 4.75%.
  //
  // The premium two points stay a subtraction, because that is genuinely
  // what they are: two points off the rate, not a proportion of it.
  const discounted = base * (1 - Math.min(Math.max(discount, 0), 100) / 100);
  const pct = waiver ? 0 : Math.max(0, discounted - premium);
  return { applied: true, pct };
}

async function requireAdminCtx() {
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false as const, error: mm.error };
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false as const, error: "Unauthorized" };
  }

  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role, tenant_id, user_id, full_name, email, is_active, status")
    .eq("user_id", userData.user.id);

  if (!profiles?.length) return { ok: false as const, error: "Forbidden" };

  const profile = existingProfile
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];

  if (profile.role !== "admin" || !profile.tenant_id) {
    return { ok: false as const, error: "Forbidden" };
  }
  // Deactivated admin keeps role but loses access.
  if (profile.is_active === false || (profile.status ?? "active") === "inactive") {
    return { ok: false as const, error: "Account is inactive" };
  }

  return { ok: true as const, supabase, profile };
}

// ─────────────────────────────────────────
// top_ups: admin create (with allow-listed status + column allowlist)
// The caller's tenant is enforced server-side; status is either
// 'pending' or 'completed' (mark-paid switch).
// ─────────────────────────────────────────
const TOPUP_INSERT_ALLOWED = [
  "type",
  "currency",
  "amount_received",
  "amount_usd",
  "topup_amount",
  "fee",
  "fee_amount",
  "eur_value",
  "eur_topup",
  "account_id",
  "advertiser_id",
  "payment_slip",
  "notes",
  "source",
] as const;

type TopupInsertInput = Partial<
  Record<(typeof TOPUP_INSERT_ALLOWED)[number], unknown>
> & {
  status?: "pending" | "completed";
  mark_paid?: boolean;
};

// Write the top_up audit-trail row SERVER-side so updated_by/author are the
// authenticated session admin — never a client-supplied value. The old
// client-side insert let any admin forge the author or fabricate new_values
// (and for "create" it was actually broken: the returned {id} had no
// `author`, so author.id threw). Best-effort: the row already committed and
// the trigger-based audit_events still captures the change, so a log-insert
// failure must not fail the mutation.
async function writeTopupLog(
  supabase: SupabaseClient,
  profile: { id: string; full_name?: string | null; email?: string | null },
  topupId: string,
  action: "create" | "update" | "delete",
  values: Partial<
    Record<
      | "fee"
      | "topup_amount"
      | "amount_received"
      | "amount_usd"
      | "currency"
      | "status"
      | "is_deleted",
      unknown
    >
  >,
) {
  const { error } = await supabase.from("topup_logs").insert({
    topup_id: topupId,
    updated_by: profile.id,
    action,
    // topup_logs is readable by the advertiser who owns the top-up
    // (topup_logs_select in 20260828140000_rls_templates.sql allows
    // _is_own_advertiser), so this is a customer-facing row too. Id only.
    author: { id: profile.id },
    new_values: {
      fee: values.fee ?? null,
      topup_amount: values.topup_amount ?? null,
      amount_received: values.amount_received ?? null,
      amount_usd: values.amount_usd ?? null,
      currency: values.currency ?? null,
      status: values.status ?? null,
      is_deleted: values.is_deleted ?? null,
    },
  });
  if (error) {
    console.warn("topup_logs insert failed:", safeErrorMessage(error));
  }
}

/**
 * The fee resolver THROWS on a real read failure, deliberately -- a
 * confident default over a failed read is how the wrong fee gets
 * charged. But a throw out of a server action reaches the browser as an
 * opaque Next.js digest: `if (!res.ok)` never runs, and the sentence the
 * resolver exists to deliver -- "the fee cannot be worked out, nothing
 * has been charged" -- is the one thing the admin never sees, on the
 * three screens where money is at stake.
 *
 * So each caller wraps it and turns the throw back into an answer.
 */
async function feeOrRefusal<T>(
  fn: () => Promise<T>,
): Promise<{ ok: true; fee: T } | { ok: false; error: string }> {
  try {
    return { ok: true, fee: await fn() };
  } catch (err) {
    return {
      ok: false,
      error: `The fee for this top-up could not be worked out (${safeErrorMessage(
        err,
      )}). Nothing has been charged -- try again in a moment.`,
    };
  }
}

export async function createTopupAsAdmin(
  input: TopupInsertInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  if (!input.advertiser_id || typeof input.advertiser_id !== "string") {
    return { ok: false, error: "advertiser_id required" };
  }

  // Verify the target advertiser belongs to this tenant.
  const { data: adv, error: advError } = await supabase
    .from("advertisers")
    .select("id, tenant_id")
    .eq("id", input.advertiser_id)
    .maybeSingle();
  if (advError || !adv) return { ok: false, error: "Advertiser not found" };
  if (adv.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  // Verify the target ad account (when given) belongs to this tenant AND to
  // the same advertiser — an admin must not be able to attach a top-up to
  // another tenant's or another advertiser's account.
  if (typeof input.account_id === "string" && input.account_id.length > 0) {
    const { data: acct } = await supabase
      .from("ad_accounts")
      .select("id, tenant_id, advertiser_id, status, name")
      .eq("id", input.account_id)
      .maybeSingle();
    if (!acct || acct.tenant_id !== profile.tenant_id) {
      return { ok: false, error: "Ad account not found" };
    }
    // ── DO NOT FUND A LOCKED ACCOUNT ──────────────────────────────────
    //
    // isAccountLocked is honoured in three places and all three are the
    // WITHDRAWAL side or the customer's own Top up button. The funding
    // side had no check at all, so an admin could create — and mark paid
    // — a top-up against a banned or disabled account, and a bulk run of
    // 200 rows could include several. The customer-facing card is
    // correctly locked, which is what made the gap hard to see.
    if (isAccountLocked(acct.status)) {
      return {
        ok: false,
        error: `${acct.name ?? "That ad account"} is ${String(acct.status ?? "not usable")}, so money sent to it cannot be spent. Reactivate it first.`,
        code: "invalid",
      };
    }
    if (acct.advertiser_id !== input.advertiser_id) {
      return {
        ok: false,
        error: "Ad account does not belong to this advertiser",
      };
    }
  }

  const cleaned: Record<string, unknown> = {};
  for (const col of TOPUP_INSERT_ALLOWED) {
    if (col in input) cleaned[col] = input[col];
  }

  // Status: only pending or completed. mark_paid boolean is the UI switch.
  const requested = input.status ?? (input.mark_paid ? "completed" : "pending");
  if (requested !== "pending" && requested !== "completed") {
    return { ok: false, error: "Invalid status" };
  }
  cleaned.status = requested;
  cleaned.tenant_id = profile.tenant_id;
  // Only the profile id. An advertiser reads their own top_ups rows, so a
  // name and work email stamped here is our staff's PII delivered to the
  // customer — and nothing in the app ever read these fields back; who did
  // what is reconstructable from audit_events, which is admin-only.
  cleaned.author = { id: profile.id };

  // Authoritative fee: for fee-bearing top-ups, let the advertiser's plan
  // rate + active top-up perks drive the fee, and recompute the derived
  // amounts from it (same math as the client preview) so the stored values
  // can't be understated by the payload. No plan + no perk → untouched.
  if (typeof input.type === "string" && FEE_APPLICABLE_TYPES.includes(input.type)) {
    const fallbackPct = Number(input.fee) || 0;
    const resolvedFee = await feeOrRefusal(() =>
      resolveEffectiveFeePct(
        supabase,
        input.advertiser_id as string,
        fallbackPct,
        typeof input.account_id === "string" ? input.account_id : null,
      ),
    );
    if (!resolvedFee.ok) return resolvedFee;
    const { pct: resolvedPct } = resolvedFee.fee;

    // ── The premium platform's two points, applied HERE ────────────────
    // Meta-EU-Premium carries a 2-point discount on the top-up fee, and
    // until now it existed only in the browser: topup-form.tsx computed
    // the AMOUNTS at (fee − 2) while sending `fee` at the full rate. That
    // worked only because the server left the payload alone when the
    // advertiser had no plan and no perk. Recomputing unconditionally —
    // which is what makes fee_amount reliable — overwrote the discounted
    // figures with full-fee ones, so the account was credited $23.26 less
    // than the admin had just been shown on a €1,000 top-up.
    //
    // A discount the server does not know about is not a discount. It is
    // resolved from the ACCOUNT, server-side, where the amounts are.
    // The premium discount is applied by resolveEffectiveFeePct now, so
    // that the bulk path and the verify floor agree with this one.
    const pct = resolvedPct;
    // ALWAYS recompute, not only when a plan or perk applies.
    //
    // `if (applied)` meant that for an advertiser with no plan and no perk
    // the derived columns were left exactly as the payload sent them — and
    // the admin "add a top-up for this user" dialog sends amount_usd,
    // topup_amount and fee, but NOT fee_amount. There is no DB default and
    // no trigger for it, so the column stayed null.
    //
    // fee_amount is the ONLY column the fee and profit reporting reads
    // (app/api/stats/route.ts, stats/profit, stats/fees). So a €1,000
    // top-up at 5% for a planless customer collected $58.14 of fee and
    // reported €0 of fee revenue and €0 of profit — while the top-up ROW
    // showed "€50" in its Fee column, because that cell computes
    // amount_received × fee / 100 itself rather than reading the column.
    // The money was collected and invisible, and the screen agreed with
    // neither.
    //
    // Recomputing unconditionally is also the safer shape: the stored
    // figures are then always the ones our own arithmetic produced from the
    // amount and the effective percentage, never a caller's.
    const { data: rate } = await supabase
      .from("exchange_rates")
      .select("eur")
      .eq("tenant_id", profile.tenant_id)
      .eq("is_active", true)
      .maybeSingle();
    const rates: MinimalRate[] = [{ eur: Number(rate?.eur) || 0 }];
    const amountReceived = Number(input.amount_received) || 0;
    const currency = String(input.currency || "USD");

    // NO RATE IS A REFUSAL, not a zero.
    //
    // calculateTopupAmount divides the received amount by the rate, so a
    // missing or stood-down rate row makes topup_amount, amount_usd and
    // fee_amount all "0.00" — a 1,000 EUR transfer recorded as nothing
    // arriving, and the supplier push then funds $0 against money we
    // actually hold. Saving a new exchange rate stands the old one down
    // FIRST, so "no active rate" is a state this app can genuinely be in
    // for a few seconds, and the only sign of it is a failed save toast.
    // ── A RATE WE DO NOT HOLD AT ALL ─────────────────────────────────
    //
    // The guard below tests rate.eur, which a GBP or HKD top-up passes
    // while calculateTopupAmount reads exchangeRates[0].gbp — undefined,
    // so rate 0, so amount_usd 0.00, fee_amount 0.00, topup_amount 0.00.
    // A GBP 1,000 transfer recorded as nothing arriving, against money
    // we hold, and the supplier push then funds $0. convertibleCurrency
    // says which codes we can actually convert; anything else is refused
    // BEFORE a row is written rather than written as a zero.
    if (!convertibleCurrency(currency)) {
      return {
        ok: false,
        error: `We can only convert USD and EUR top-ups. ${currency.toUpperCase()} would be stored as zero dollars, so nothing was created — record it in one of those two, or ask us to add a rate for it.`,
        code: "invalid",
      };
    }
    if (currency.toUpperCase() !== "USD" && !(Number(rate?.eur) > 0)) {
      return {
        ok: false,
        error:
          "There is no active exchange rate, so a non-USD top-up cannot be converted. Set the rate in Settings → Finance first.",
        code: "invalid",
      };
    }
    const { topupAmount, amountUSD, feeAmount } = calculateTopupAmount(
      amountReceived,
      rates,
      currency,
      pct,
    );
    cleaned.fee = pct;
    cleaned.fee_amount = feeAmount.toFixed(2);
    cleaned.topup_amount = topupAmount.toFixed(2);
    cleaned.amount_usd = amountUSD.toFixed(2);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("top_ups")
    .insert(cleaned)
    .select("id")
    .single();
  if (insertError) return { ok: false, error: insertError.message };

  await writeTopupLog(supabase, profile, inserted.id, "create", {
    ...cleaned,
    amount_received: input.amount_received,
    currency: input.currency,
  });

  // Created already-paid → the supplier has to fund the account. No-op unless
  // the auto-push gate is armed; never fails the top-up. See lib/integrations/autopush.
  //
  // ── AND THE REFUSAL IS NOT SWALLOWED ────────────────────────────────
  //
  // enqueue returns a reason for every refusal and all four call sites
  // threw it away. The gate being shut is the ordinary case and stays
  // silent. Every other refusal means the gate WAS armed, the money has
  // moved, and the supplier was not told — so the top-up sat green in
  // the queue while the ad account was never funded. That belongs on the
  // screen of whoever just pressed the button.
  let pushWarning: string | undefined;
  if (requested === "completed") {
    const push = await enqueueSupplierTopupPush(supabase, {
      topupId: inserted.id,
      tenantId: profile.tenant_id,
    });
    if (!push.enqueued && !push.heldByGate) {
      pushWarning = `The top-up was created, but the supplier was NOT told: ${push.reason}. Fund the account by hand.`;
    }
  }

  return { ok: true, data: { id: inserted.id }, warning: pushWarning };
}

// ─────────────────────────────────────────
// top_ups: bulk admin insert (used by bulk-ad-accounts-topup-dialog)
// ─────────────────────────────────────────
export async function bulkCreateTopupsAsAdmin(
  rows: TopupInsertInput[],
): Promise<ActionResult<{ inserted: number }>> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "No rows" };
  }
  if (rows.length > 200) {
    return { ok: false, error: "Too many rows (max 200)" };
  }
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  // Verify every referenced advertiser belongs to caller's tenant, in one round-trip.
  const advertiserIds = Array.from(
    new Set(
      rows
        .map((r) => r.advertiser_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  if (advertiserIds.length === 0) {
    return { ok: false, error: "advertiser_id required on every row" };
  }
  const { data: advs, error: advsError } = await supabase
    .from("advertisers")
    .select("id, tenant_id")
    .in("id", advertiserIds);
  if (advsError) return { ok: false, error: advsError.message };
  const validIds = new Set(
    (advs ?? [])
      .filter((a) => a.tenant_id === profile.tenant_id)
      .map((a) => a.id),
  );
  if (validIds.size !== advertiserIds.length) {
    return { ok: false, error: "Forbidden advertiser id in batch" };
  }

  // Verify every referenced ad account belongs to caller's tenant and to the
  // advertiser it's paired with in the same row — no cross-tenant / mismatched
  // account attachment.
  const accountIds = Array.from(
    new Set(
      rows
        .map((r) => r.account_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  if (accountIds.length > 0) {
    const { data: accts, error: acctsError } = await supabase
      .from("ad_accounts")
      .select("id, tenant_id, advertiser_id, status, name")
      .in("id", accountIds);
    if (acctsError) return { ok: false, error: acctsError.message };
    const acctById = new Map(
      (accts ?? [])
        .filter((a) => a.tenant_id === profile.tenant_id)
        .map((a) => [a.id, a.advertiser_id]),
    );
    // Same refusal as the single path — a bulk run is exactly where a
    // banned account slips through unnoticed.
    const lockedName = (accts ?? []).find((a) =>
      isAccountLocked((a as { status?: string | null }).status),
    );
    if (lockedName) {
      const l = lockedName as { name?: string | null; status?: string | null };
      return {
        ok: false,
        error: `${l.name ?? "One of these ad accounts"} is ${String(l.status ?? "not usable")}, so money sent to it cannot be spent. Remove that row or reactivate the account. Nothing was created.`,
        code: "invalid",
      };
    }
    for (const row of rows) {
      const acctId = row.account_id;
      if (typeof acctId !== "string" || acctId.length === 0) continue;
      if (!acctById.has(acctId)) {
        return { ok: false, error: "Forbidden ad account id in batch" };
      }
      if (acctById.get(acctId) !== row.advertiser_id) {
        return {
          ok: false,
          error: "Ad account does not belong to the paired advertiser",
        };
      }
    }
  }

  // Authoritative fee, per row — the SAME resolution the single-create path
  // applies. This was missing here, so the bulk dialog stored whatever fee
  // the client sent: a granted topup_fee_waiver was ignored and the customer
  // charged anyway, a plan rate was ignored in favour of the ad account's
  // own default, and a tampered payload could understate the fee on 200 rows
  // at once — the exact thing the single path was hardened against.
  //
  // Resolved ONCE PER ADVERTISER rather than per row: a bulk run is usually
  // many accounts belonging to a handful of advertisers, and the plan and
  // perks are a property of the advertiser, not of the row.
  // ONE KEY, BUILT ONCE, USED BY BOTH SIDES.
  //
  // This map was filled under `advertiserId + "|" + accountId` and read
  // back under `advertiserId` alone. Those never match, so the lookup
  // returned undefined every time and the whole server-side fee block
  // was skipped — which meant `fee`, `fee_amount`, `topup_amount` and
  // `amount_usd` were taken from the browser payload exactly as sent.
  // A plan rate, an ad account's own rate, a fee waiver and a discount
  // were all silently ignored on every bulk top-up.
  //
  // Two expressions that have to agree is a fault waiting to happen, so
  // there is now one expression and both sides call it with the row.
  const feeKeyOf = (r: Record<string, unknown>) =>
    String(r.advertiser_id ?? "") +
    "|" +
    (typeof r.account_id === "string" ? r.account_id : "");

  const feeByAdvertiser = new Map<string, { applied: boolean; pct: number }>();
  const needsFee = rows.some(
    (r) => typeof r.type === "string" && FEE_APPLICABLE_TYPES.includes(r.type),
  );
  let bulkRates: MinimalRate[] = [];
  if (needsFee) {
    const { data: rate } = await supabase
      .from("exchange_rates")
      .select("eur")
      .eq("tenant_id", profile.tenant_id)
      .eq("is_active", true)
      .maybeSingle();
    // ── NO RATE IS A REFUSAL HERE TOO ─────────────────────────────────
    //
    // The single-create path refuses this; the bulk path just carried a
    // zero into calculateTopupAmount, which returns zeros for every
    // non-USD row — so five EUR 1,000 top-ups were recorded as nothing
    // arriving, with ~$290 of fee revenue invisible to every report and
    // a toast reading "Successfully topped up 5 ad accounts".
    //
    // .maybeSingle() ERRORS when two rows match, and two active rate
    // rows is a state this database has reached before — the exchange
    // rate actions document it twice. The dialog's own guard reads a
    // LIST, so it passes happily and previews the right figures while
    // the server stores zeros.
    const bulkRate = Number(rate?.eur);
    const needsConversion = rows.some(
      (r) =>
        typeof r.type === "string" &&
        FEE_APPLICABLE_TYPES.includes(r.type) &&
        String(r.currency ?? "USD").toUpperCase() !== "USD",
    );
    // Same refusal on the bulk path: one unconvertible row would be
    // stored as zero dollars alongside rows that are correct, which is
    // worse than refusing the batch.
    const unconvertible = rows.find(
      (r) =>
        typeof r.type === "string" &&
        FEE_APPLICABLE_TYPES.includes(r.type) &&
        !convertibleCurrency(String(r.currency ?? "USD")),
    );
    if (unconvertible) {
      return {
        ok: false,
        error: `We can only convert USD and EUR top-ups, and one row is in ${String(
          unconvertible.currency ?? "",
        ).toUpperCase()}. Nothing was created.`,
        code: "invalid",
      };
    }
    if (needsConversion && !(bulkRate > 0)) {
      return {
        ok: false,
        error:
          "There is no single active exchange rate, so a non-USD top-up cannot be converted. Check Settings → Finance — if two rates are active, stand one down. Nothing was created.",
        code: "invalid",
      };
    }
    bulkRates = [{ eur: bulkRate || 0 }];

    for (const row of rows) {
      if (typeof row.type !== "string") continue;
      if (!FEE_APPLICABLE_TYPES.includes(row.type)) continue;
      const advId = row.advertiser_id;
      if (typeof advId !== "string" || !advId) continue;
      // KEYED BY ADVERTISER **AND** ACCOUNT. The plan and the perks are
      // properties of the advertiser, but the winning fee is now a property
      // of the ad account — so caching one answer per advertiser would give
      // every account in a bulk run the first account's fee.
      const acctId =
        typeof row.account_id === "string" ? row.account_id : null;
      const key = feeKeyOf(row);
      if (feeByAdvertiser.has(key)) continue;
      const bulkFee = await feeOrRefusal(() =>
        resolveEffectiveFeePct(supabase, advId, Number(row.fee) || 0, acctId),
      );
      if (!bulkFee.ok) return bulkFee;
      feeByAdvertiser.set(key, bulkFee.fee);
    }
  }

  // ── A ROW'S CURRENCY MUST BE ITS ACCOUNT'S ──────────────────────────
  //
  // Every row used to default to EUR, so an admin filling amounts for USD
  // ad accounts and leaving the default wrote EUR top-ups against USD
  // accounts, out of the EUR wallet. The dialog now seeds from the
  // account and refuses a mismatch — and a dialog is not a boundary, so
  // the same refusal lives here, where the payload arrives.
  {
    const ids = [
      ...new Set(
        rows
          .map((r) => (typeof r.account_id === "string" ? r.account_id : null))
          .filter((x): x is string => !!x),
      ),
    ];
    if (ids.length) {
      const { data: accts } = await supabase
        .from("ad_accounts")
        .select("id, name, currency")
        .in("id", ids);
      const byId = new Map(
        (accts ?? []).map((a) => [
          String(a.id),
          {
            name: String(a.name ?? "that account"),
            cur: String(a.currency ?? "").toUpperCase(),
          },
        ]),
      );
      for (const row of rows) {
        const id = typeof row.account_id === "string" ? row.account_id : null;
        if (!id) continue;
        const acct = byId.get(id);
        // An account that does not state a currency is not a mismatch —
        // there is nothing to disagree with.
        if (!acct || (acct.cur !== "EUR" && acct.cur !== "USD")) continue;
        const rowCur = String(row.currency ?? "").toUpperCase();
        if (rowCur && rowCur !== acct.cur) {
          return {
            ok: false,
            error: `${acct.name} is a ${acct.cur} account, so it cannot be funded from the ${rowCur} wallet. Nothing was created.`,
            code: "invalid",
          };
        }
      }
    }
  }

  // Id only — see the note on the single-create path. This lands on
  // customer-readable top_ups rows.
  const author = { id: profile.id };
  const payload = rows.map((row) => {
    const cleaned: Record<string, unknown> = {};
    for (const col of TOPUP_INSERT_ALLOWED) {
      if (col in row) cleaned[col] = row[col];
    }
    const requested =
      row.status ?? (row.mark_paid ? "completed" : "pending");
    if (requested !== "pending" && requested !== "completed") {
      throw new Error("Invalid status in bulk payload");
    }
    cleaned.status = requested;
    cleaned.tenant_id = profile.tenant_id;
    cleaned.author = author;

    if (
      typeof row.type === "string" &&
      FEE_APPLICABLE_TYPES.includes(row.type) &&
      typeof row.advertiser_id === "string"
    ) {
      const resolved = feeByAdvertiser.get(feeKeyOf(row));
      // ALWAYS, not only when a plan or a perk applies — the same rule the
      // single-create path states at length above. `if (applied)` left the
      // derived columns exactly as the browser sent them for any
      // advertiser with no plan, no perk and a zero account fee, which is
      // the majority of new customers. Recomputing unconditionally means
      // the stored figures are always the ones our own arithmetic produced
      // from the amount and the effective percentage, never a caller's.
      if (resolved) {
        const { topupAmount, amountUSD, feeAmount } = calculateTopupAmount(
          Number(row.amount_received) || 0,
          bulkRates,
          String(row.currency || "USD"),
          resolved.pct,
        );
        cleaned.fee = resolved.pct;
        cleaned.fee_amount = feeAmount.toFixed(2);
        cleaned.topup_amount = topupAmount.toFixed(2);
        cleaned.amount_usd = amountUSD.toFixed(2);
      }
    }
    return cleaned;
  });

  const { data: insertedRows, error: insertError } = await supabase
    .from("top_ups")
    .insert(payload)
    .select("id, status");
  if (insertError) return { ok: false, error: insertError.message };

  // Queue a supplier push for each row that went in already-paid. Sequential
  // on purpose: a bulk run is at most 200 rows and each enqueue is two small
  // reads plus an insert — hammering the DB in parallel here buys nothing and
  // makes a partial failure harder to read. No-op unless the gate is armed.
  const notTold: string[] = [];
  for (const row of (insertedRows ?? []) as Array<{ id: string; status: string }>) {
    if (row.status !== "completed") continue;
    const push = await enqueueSupplierTopupPush(supabase, {
      topupId: row.id,
      tenantId: profile.tenant_id,
    });
    if (!push.enqueued && !push.heldByGate) notTold.push(push.reason);
  }

  return {
    ok: true,
    data: { inserted: payload.length },
    // One line however many rows: a bulk run that funded nothing is the
    // case where silence costs the most.
    warning: notTold.length
      ? `${notTold.length} of ${payload.length} were created but the supplier was NOT told (${notTold[0]}). Fund those accounts by hand.`
      : undefined,
  };
}

// ─────────────────────────────────────────
// top_ups: admin partial update
// ─────────────────────────────────────────
// THE MONEY COLUMNS ARE NOT EDITABLE HERE, AND THAT IS THE THIRD TIME.
//
// The create path recomputes fee, fee_amount, topup_amount and amount_usd
// from resolveEffectiveFeePct; the bulk path was fixed to do the same;
// and verifying below the resolved rate is owner-only. This action was
// never revisited, so it still wrote all four straight from the payload
// with no recompute, no floor and no owner check: post
// {fee: 0, fee_amount: 0, status: "completed"} for a EUR 10,000 top-up
// on a 4% account and the row genuinely reads 0% — fee_amount is the
// only column the fee and profit reports read, so they agree with it.
//
// Dropping them is better than adding a fourth copy of the rule. A
// top-up's figures come from the amount and the resolved percentage,
// full stop; repricing goes through verifyAdTopup, which has the floor.
// `currency` and `amount_received` go too, because changing either
// without recomputing leaves the derived columns describing a different
// payment.
const TOPUP_UPDATE_ALLOWED = [
  "type",
  "notes",
  "status",
  "is_deleted",
] as const;

type TopupUpdateInput = Partial<
  Record<(typeof TOPUP_UPDATE_ALLOWED)[number], unknown>
>;

export async function updateTopupAsAdmin(
  topupId: string,
  payload: TopupUpdateInput,
  ifUpdatedAt?: string,
): Promise<ActionResult> {
  if (typeof topupId !== "string" || topupId.length === 0) {
    return { ok: false, error: "Invalid input", code: "invalid" };
  }
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  // Verify target is in caller's tenant
  const { data: existing } = await supabase
    .from("top_ups")
    .select("id, tenant_id, updated_at, status")
    .eq("id", topupId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Top-up not found", code: "not_found" };
  if (existing.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }
  if (!versionMatches(existing.updated_at, ifUpdatedAt)) {
    return {
      ok: false,
      error: "This top-up was updated by someone else. Reload and retry.",
      code: "conflict",
    };
  }

  const cleaned: Record<string, unknown> = {};
  for (const col of TOPUP_UPDATE_ALLOWED) {
    if (col in payload) cleaned[col] = payload[col];
  }
  if (cleaned.status !== undefined) {
    const s = cleaned.status;
    if (s !== "pending" && s !== "completed" && s !== "rejected") {
      return { ok: false, error: "Invalid status" };
    }
    // ── COMPLETED DOES NOT GO BACKWARDS ───────────────────────────────
    //
    // This was the last of the three money-status actions with no
    // transition guard. invoice-actions refuses paid -> unpaid and says
    // why; referral-actions now refuses paid -> unpaid for the same
    // reason. A completed top-up has had its money split, its fee
    // recorded and, if the gate is armed, a supplier push queued —
    // writing `pending` or `rejected` over the top of that changes the
    // row and undoes none of it, and the fee and profit reports, which
    // read fee_amount, go on agreeing with a row that now claims the
    // payment never landed.
    //
    // Undoing a verify is a real thing an admin needs, and it has its own
    // RPC that reverses the money. This action is not it.
    const was = String(existing.status ?? "");
    if (was === "completed" && s !== "completed") {
      return {
        ok: false,
        error:
          "This top-up is already completed. Changing it back here would leave the money split and the row saying otherwise — undo the verification instead.",
        code: "invalid",
      };
    }
  }
  if (Object.keys(cleaned).length === 0) {
    return { ok: false, error: "No updatable fields" };
  }
  cleaned.updated_at = new Date().toISOString();
  // Only the profile id. An advertiser reads their own top_ups rows, so a
  // name and work email stamped here is our staff's PII delivered to the
  // customer — and nothing in the app ever read these fields back; who did
  // what is reconstructable from audit_events, which is admin-only.
  cleaned.author = { id: profile.id };

  // Count the rows — see wroteSomething(). An edit to a top-up that silently
  // did not save would be written to the log below as though it had, so the
  // log would disagree with the row it describes.
  const { data: updatedTopup, error: updateError } = await supabase
    .from("top_ups")
    .update(cleaned)
    .eq("id", topupId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");
  if (updateError) return { ok: false, error: updateError.message };
  const wroteTopup = wroteSomething(updatedTopup);
  if (!wroteTopup.ok) return wroteTopup;

  await writeTopupLog(
    supabase,
    profile,
    topupId,
    payload.is_deleted === true ? "delete" : "update",
    payload,
  );

  // Marked paid → queue the supplier push. Enqueue is idempotent on the
  // top-up id, so re-saving an already-completed row can't double-fund.
  // No-op unless the auto-push gate is armed. See lib/integrations/autopush.
  let pushWarning: string | undefined;
  if (cleaned.status === "completed" && payload.is_deleted !== true) {
    const push = await enqueueSupplierTopupPush(supabase, {
      topupId,
      tenantId: profile.tenant_id,
    });
    // See createTopupAsAdmin: a refusal that is NOT the gate means the
    // money moved and the supplier was not told.
    if (!push.enqueued && !push.heldByGate) {
      pushWarning = `Saved, but the supplier was NOT told: ${push.reason}. Fund the account by hand.`;
    }
  }

  return { ok: true, data: null, warning: pushWarning };
}

// ─────────────────────────────────────────
// verifyAdTopup — the admin "Verify payment" action
// ─────────────────────────────────────────
// The verify dialog used to call the top_up_admin_verify RPC straight from
// the browser. The RPC itself is safe (SECURITY DEFINER, it does its own
// authorization), so nothing was exposed — but going around the server
// action also went around the supplier push. Verifying a top-up is EXACTLY
// the moment we learn the money is ours and the supplier should be told, and
// it was the one path that never told them. Silently: no error, no queued
// job, just an account that never gets funded.
//
// Everything else that marks a top-up completed already enqueues here. This
// makes the canonical path do the same.
export async function verifyAdTopup(
  topupId: string,
  newFeePercent: number | null,
): Promise<ActionResult<unknown>> {
  if (typeof topupId !== "string" || topupId.length === 0) {
    return { ok: false, error: "Invalid input", code: "invalid" };
  }
  if (
    newFeePercent !== null &&
    (typeof newFeePercent !== "number" ||
      !Number.isFinite(newFeePercent) ||
      newFeePercent < 0 ||
      newFeePercent > 100)
  ) {
    return { ok: false, error: "Invalid fee percentage", code: "invalid" };
  }

  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  // ── A VERIFY MUST NOT BE A REPRICE ──────────────────────────────────
  //
  // p_new_fee_percent is taken straight from the dialog and re-splits the
  // money. That is a payload overriding the ad account — the one thing
  // the fee rule at the top of this file says must never happen — and
  // unlike repricing a subscription, which is owner-only behind three
  // gates, there was nothing here at all. An employee admin could open a
  // 10,000 EUR top-up on a 4% account, type 0, and confirm: nothing
  // collected, the row now genuinely reads 0%, and the fee report agrees
  // with it.
  //
  // Raising the fee is still allowed for any admin — it cannot cost us
  // anything and there are real reasons to. Going BELOW what the account
  // and the plan resolve to is the owner's call.
  // ── THE TENANT CHECK IS NOT PART OF THE FEE CHECK ───────────────────
  //
  // All of this used to sit inside `if (newFeePercent !== null)`, so the
  // ordinary call — verifyAdTopup(id, null), which is what the dialog
  // sends when the fee is not being changed — reached the RPC with no
  // tenant compare at all. An admin of tenant A could verify tenant B's
  // top-up, marking another tenant's payment collected and then queueing
  // a supplier push stamped with the CALLER'S tenant id.
  //
  // updateTopupAsAdmin, forty lines up in this same file, checks
  // unconditionally. The only other defence was top_up_admin_verify
  // itself, which is not in supabase/migrations at all — it is hand
  // authored on live and named only in a comment, so nothing in this
  // repository can say whether it compares tenants. A guard you cannot
  // read is not a guard you can rely on.
  {
    const { data: row, error: rowErr } = await supabase
      .from("top_ups")
      .select("tenant_id")
      .eq("id", topupId)
      .maybeSingle();
    if (rowErr) {
      return {
        ok: false,
        error: "Could not read this top-up, so it cannot be verified.",
        code: "invalid",
      };
    }
    if (!row) return { ok: false, error: "Top-up not found", code: "not_found" };
    if (row.tenant_id !== profile.tenant_id) {
      return { ok: false, error: "Forbidden", code: "forbidden" };
    }
  }

  if (newFeePercent !== null) {
    // ── A READ WE COULD NOT MAKE IS NOT PERMISSION ──────────────────
    //
    // This discarded `error` and then wrote both checks so that "no row"
    // meant "no check": `if (row && tenant mismatch)` and
    // `if (row?.advertiser_id)`. Any null read — a column a pending
    // migration adds, an RLS hiccup, two matching rows — skipped the
    // tenant compare AND the whole floor, and called the RPC with
    // p_new_fee_percent = 0. Nothing in SQL guards that parameter, so a
    // EUR 10,000 top-up re-splits at 0% and the row then genuinely reads
    // 0%, which is precisely the outcome the floor was written to stop.
    //
    // updateTopupAsAdmin in this same file gets this right.
    const { data: row, error: rowErr } = await supabase
      .from("top_ups")
      .select("advertiser_id, account_id, fee, tenant_id")
      .eq("id", topupId)
      .maybeSingle();

    if (rowErr) {
      return {
        ok: false,
        error: "Could not read this top-up, so the fee cannot be checked.",
        code: "invalid",
      };
    }
    if (!row) return { ok: false, error: "Top-up not found", code: "not_found" };
    if (row.tenant_id !== profile.tenant_id) {
      return { ok: false, error: "Forbidden", code: "forbidden" };
    }

    if (row.advertiser_id) {
      const effectiveFee = await feeOrRefusal(() =>
        resolveEffectiveFeePct(
          supabase,
          String(row.advertiser_id),
          Number(row.fee) || 0,
          typeof row.account_id === "string" ? row.account_id : null,
          // The stored fee already has the premium points off.
          true,
        ),
      );
      if (!effectiveFee.ok) return effectiveFee;
      const effective = effectiveFee.fee;
      // GATE ON THE NUMBER, not on `applied`.
      //
      // `applied` is false precisely when nothing is configured — no
      // plan, no perk, and an account fee of 0, which is most new
      // customers. In that case pct falls back to the row's OWN stored
      // fee, which is exactly the figure a verify must not silently drop
      // below. Requiring `applied` therefore switched the guard off for
      // the population it most needed to cover: a 10,000 EUR top-up
      // carrying fee = 5 could be verified at 0 by any admin, and the
      // row would then genuinely read 0% so the fee report agreed with
      // it.
      if (newFeePercent + 0.0001 < effective.pct) {
        const { data: tenant } = await supabase
          .from("tenants")
          .select("owner_id")
          .eq("id", profile.tenant_id)
          .maybeSingle();
        if (!tenant || tenant.owner_id !== profile.user_id) {
          return {
            ok: false,
            error: `This account's rate is ${effective.pct}%. Only the super-admin can verify below it — ask them, or use a fee waiver so the reason is recorded.`,
            code: "forbidden",
          };
        }
      }
    }
  }

  const { data, error } = await supabase.rpc("top_up_admin_verify", {
    p_top_up_id: topupId,
    p_new_fee_percent: newFeePercent,
  });
  if (error) return { ok: false, error: error.message };

  // Idempotent on the top-up id, and a no-op unless BOTH auto-push switches
  // are armed — so this cannot fund anything while the gate is shut, and
  // re-verifying cannot fund it twice.
  const push = await enqueueSupplierTopupPush(supabase, {
    topupId,
    tenantId: profile.tenant_id,
  });

  // ── AND TELL THE CUSTOMER ─────────────────────────────────────────
  //
  // Not one money action wrote a notification. An admin verifies a
  // top-up and the customer's phone stays silent -- the only way they
  // learn their money reached the ad account is by opening the app and
  // comparing a figure to what they remember. `topup_completed` has a
  // receipt dialog, a push case, a catalogue entry and a customer
  // toggle, and nothing has ever written it.
  //
  // Best effort by construction: the money has already moved, and an
  // action that reports failure after a successful verify is far worse
  // than a customer who was not told.
  {
    // The row read above is scoped to the fee-gate block, so read the
    // one field this needs. It is one small select on a path that has
    // already moved money.
    const { data: who } = await supabase
      .from("top_ups")
      .select("advertiser_id")
      .eq("id", topupId)
      .maybeSingle();
    await notifyAdvertiser(supabase, {
      advertiserId: (who as { advertiser_id?: string | null } | null)
        ?.advertiser_id,
      tenantId: profile.tenant_id,
      type: "topup_completed",
      payload: {
        topup_id: topupId,
        approved_at: new Date().toISOString(),
      },
    });
  }

  return {
    ok: true,
    data,
    // Verifying is the moment we learn the money is ours and the
    // supplier should be funded. If that could not be queued for any
    // reason other than the gate being shut, the admin needs to know
    // now — not when the customer asks why their account is empty.
    warning:
      !push.enqueued && !push.heldByGate
        ? `Verified, but the supplier was NOT told: ${push.reason}. Fund the account by hand.`
        : undefined,
  };
}

/**
 * What a top-up on this ad account will actually cost, resolved by the
 * server's own rule.
 *
 * WHY THIS EXISTS. The customer's top-up dialog read
 * `ad_accounts.fee` and nothing else, so it could not see the plan's
 * rate, a fee waiver, a discount perk or the Meta-EU-Premium two points
 * — the four other inputs resolveEffectiveFeePct consults. An account
 * whose own fee column is 0 made the dialog hide the fee line entirely
 * and promise that the full amount lands, while the plan's percentage
 * was charged.
 *
 * It returns the PERCENTAGE ONLY. No plan name, no perk name, no
 * supplier anything — the customer is entitled to know what they are
 * charged, not how we arrived at it.
 *
 * Scoped to the caller's own advertiser, server-side. An account id is
 * accepted, an advertiser id is not.
 */
export async function quoteTopupFeePct(
  accountId: string,
): Promise<ActionResult<{ pct: number; resolved: boolean }>> {
  const auth = await resolveUserContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  if (typeof accountId !== "string" || !accountId) {
    return { ok: false, error: "Invalid input" };
  }

  // ── AN ADMIN HAS NO ADVERTISERS ROW ───────────────────────────────
  //
  // This resolved the caller's own advertiser and refused when there
  // was none — so for an ADMIN it always failed. The admin bulk top-up
  // dialog quotes every account through here, got null for all of
  // them, and kept its seed value of `account.fee ?? 0`. But the query
  // RESOLVED (empty, not errored), so "Checking fees…" cleared and the
  // button enabled: twenty accounts with fee 0 on a 5% plan showed 0%
  // in every box while bulkCreateTopupsAsAdmin charged the plan's 5%.
  // On EUR 50,000 that is about EUR 2,900 of fee the admin was shown as
  // zero.
  //
  // An admin quoting an account in their own tenant is a legitimate
  // question with a correct answer, so it is answered. The advertiser
  // is taken FROM THE ACCOUNT rather than from the caller, and the
  // ownership test still applies to a customer asking about their own.
  const isAdmin = profile.role === "admin";

  const { data: acct } = await supabase
    .from("ad_accounts")
    .select("id, fee, advertiser_id, tenant_id")
    .eq("id", accountId)
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();
  if (!acct) return { ok: false, error: "That ad account was not found." };

  let advertiserId = String(acct.advertiser_id ?? "");

  if (!isAdmin) {
    // Their own advertiser, in their own tenant. Nothing from the caller.
    const { data: adv } = await supabase
      .from("advertisers")
      .select("id")
      .eq("user_id", profile.user_id)
      .eq("tenant_id", profile.tenant_id)
      .maybeSingle();
    if (!adv?.id) {
      return { ok: false, error: "No advertiser for this account." };
    }
    if (String(acct.advertiser_id ?? "") !== String(adv.id)) {
      return { ok: false, error: "That ad account is not yours." };
    }
    advertiserId = String(adv.id);
  }

  if (!advertiserId) {
    return { ok: false, error: "That ad account has no customer on it." };
  }

  // The resolver throws when it could not read the plan or the perks,
  // because a silent fall-through charges a customer a fee they were
  // told they would not pay. A quote that cannot be made is refused,
  // and both top-up forms already refuse to submit on an unresolved
  // fee and say why.
  try {
    const resolved = await resolveEffectiveFeePct(
      supabase,
      advertiserId,
      Number(acct.fee) || 0,
      accountId,
    );
    return {
      ok: true,
      data: { pct: resolved.pct, resolved: resolved.applied },
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "The fee could not be worked out.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Tell the customer their ad-account top-up was refused, and why
// ─────────────────────────────────────────────────────────────────────
// `top_up_admin_reject` is called straight from the browser, which is
// allowed here — it is a SECURITY DEFINER RPC, which is what CLAUDE.md
// says financial writes go through. But an RPC cannot be given a
// notification from the client, and the rejection reason is the single
// most important sentence in this whole flow: it is written to the
// customer, it is the reason the reject dialog demands one, and there
// are fifteen templates behind it. Until now it reached the database
// and stopped there.
//
// So: a small action the dialog calls AFTER the RPC has returned. It
// cannot invent a rejection — it re-reads the row and writes nothing
// unless that row really is rejected, so a caller cannot use it to
// tell a customer their money is gone when it is not.
// ─────────────────────────────────────────────────────────────────────
export async function notifyTopupRejected(
  topupId: string,
  reason: string,
): Promise<ActionResult> {
  if (typeof topupId !== "string" || !topupId) {
    return { ok: false, error: "Invalid input" };
  }
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  const { data: row } = await supabase
    .from("top_ups")
    .select("id, tenant_id, advertiser_id, status, amount_received, currency")
    .eq("id", topupId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Top-up not found" };
  if (row.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  // The row is the proof. Anything other than rejected and we say
  // nothing rather than telling a customer something that did not
  // happen.
  const status = String(row.status ?? "").toLowerCase();
  if (status !== "rejected" && status !== "failed") {
    return { ok: true, data: null };
  }

  await notifyAdvertiser(supabase, {
    advertiserId: row.advertiser_id ? String(row.advertiser_id) : null,
    tenantId: profile.tenant_id,
    type: "topup_rejected",
    payload: {
      topup_id: topupId,
      amount: row.amount_received ?? null,
      currency: row.currency ?? null,
      reason: typeof reason === "string" ? reason.trim().slice(0, 500) : null,
    },
  });
  return { ok: true, data: null };
}
