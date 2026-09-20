"use server";

import { feeIsAPrice, isTenantOwner } from "@/actions/_fee-is-a-price";
import { createClient } from "@/lib/supabase/server";
import { wroteSomething } from "./_shared";
import { safeErrorMessage } from "@/lib/pure-error";
import { cookies } from "next/headers";
import {
  checkVersion,
  maintenanceGuard,
  versionMatches,
  type ActionResult,
} from "./_shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyAdvertiser } from "@/lib/notify-advertiser";

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
    .select("id, role, tenant_id, user_id, is_active, status")
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
// ad_accounts: create
// ─────────────────────────────────────────
// The supplier fee is what WE pay — a cost figure that must NEVER reach a
// customer. It lives in public.ad_account_costs, not on the ad_accounts row,
// precisely because advertisers can read their own ad_accounts through RLS and
// the advertiser app reads them with select("*"). Keeping it off that row
// makes the leak structurally impossible instead of dependent on every future
// query being written carefully.
//
// Read is admin-of-tenant (RLS). Write is the tenant owner only: a regular
// admin editing an ad account must not be able to move our margin, and hiding
// the field in the UI is not a boundary since a server action is directly
// invokable.
//
// `raw === undefined` means "not supplied" → leave untouched, so every
// existing caller keeps working. `null` or "" means "not recorded" and clears
// it — deliberately distinct from 0, which would claim the supplier charges
// us nothing.
async function upsertSupplierFee(
  supabase: SupabaseClient,
  profile: { user_id: string; tenant_id: string },
  adAccountId: string,
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (raw === undefined) return { ok: true };

  let pct: number | null = null;
  if (raw !== null && raw !== "") {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return { ok: false, error: "Supplier fee must be between 0 and 100" };
    }
    pct = n;
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();
  if (!tenant || tenant.owner_id !== profile.user_id) {
    return {
      ok: false,
      error: "Only the super-admin can set the supplier fee",
    };
  }

  const { error } = await supabase.from("ad_account_costs").upsert(
    {
      ad_account_id: adAccountId,
      tenant_id: profile.tenant_id,
      supplier_fee_pct: pct,
    },
    { onConflict: "ad_account_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Admin-only read of the cost figures, keyed by ad account id. Separate from
// the ad-account read on purpose — a caller has to ask for costs explicitly,
// so no customer-facing query picks them up by accident.
export async function getAdAccountCosts(): Promise<
  ActionResult<Record<string, number | null>>
> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  const { data, error } = await supabase
    .from("ad_account_costs")
    .select("ad_account_id, supplier_fee_pct")
    .eq("tenant_id", profile.tenant_id);
  if (error) return { ok: false, error: error.message };

  const out: Record<string, number | null> = {};
  for (const row of (data ?? []) as Array<{
    ad_account_id: string;
    supplier_fee_pct: number | null;
  }>) {
    out[row.ad_account_id] =
      row.supplier_fee_pct == null ? null : Number(row.supplier_fee_pct);
  }
  return { ok: true, data: out };
}

// `status` belongs here. Without it every account this form creates is
// born with status NULL, and isAccountLocked(null) is true — so the admin
// top-up refuses it, the bulk run refuses it, and the customer's picker
// silently leaves it out. An account nobody can put money on, with no
// sign of why. The only cure was to open Update Ad Account and save,
// because THAT form defaults status to "active".
const AD_ACCOUNT_INSERT_ALLOWED = [
  "name",
  "status",
  "min_topup",
  "bm_id",
  "fee",
  "advertiser_id",
  "platform",
  "airtable",
  "timezone",
  "notes",
  "website_url",
  "metadata",
  "currency",
  "start_date",
] as const;
type AdAccountInsertInput = Partial<
  Record<(typeof AD_ACCOUNT_INSERT_ALLOWED)[number], unknown>
>;

export async function createAdAccountAsAdmin(
  input: AdAccountInsertInput & { supplier_fee_pct?: unknown },
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  const advertiserId = input.advertiser_id;
  if (typeof advertiserId !== "string" || advertiserId.length === 0) {
    return { ok: false, error: "advertiser_id required" };
  }
  const { data: adv } = await supabase
    .from("advertisers")
    .select("id, tenant_id")
    .eq("id", advertiserId)
    .maybeSingle();
  if (!adv) return { ok: false, error: "Advertiser not found" };
  if (adv.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  const feeRaw = input.fee;
  if (feeRaw != null) {
    const fee = Number(feeRaw);
    if (!Number.isFinite(fee) || fee < 0 || fee > 100) {
      return { ok: false, error: "Fee must be between 0 and 100" };
    }
    // Same rule as the update path, and it asks whether this is a PRICE
    // rather than whether a fee was sent at all. Both create dialogs
    // auto-fill one -- Quick Create from the type's default, the
    // create-from-request dialog from the plan rate -- and a disabled
    // input still submits its value, so "any fee needs the owner" meant
    // an employee admin could no longer create ANY ad account, with an
    // error telling them to leave a box blank that the form refills.
    // See actions/_fee-is-a-price.
    if (
      await feeIsAPrice(supabase, {
        advertiserId,
        platform: typeof input.platform === "string" ? input.platform : null,
        tenantId: profile.tenant_id,
        fee,
      })
    ) {
      const owner = await isTenantOwner(
        supabase,
        profile.tenant_id,
        profile.user_id,
      );
      if (owner.unreadable) {
        return {
          ok: false,
          error:
            "We couldn't check who owns this tenant just now, so we'd rather not set a price. Try again in a moment.",
          code: "conflict",
        };
      }
      if (!owner.owner) {
        return {
          ok: false,
          error:
            "That fee is not this customer's agreed rate, and only the super-admin can set a different one. Leave it at their plan rate, or ask the owner.",
          code: "forbidden",
        };
      }
    }
  }
  const cleaned: Record<string, unknown> = {};
  for (const col of AD_ACCOUNT_INSERT_ALLOWED) {
    if (col in input) cleaned[col] = input[col];
  }
  cleaned.tenant_id = profile.tenant_id;
  cleaned.created_by = profile.user_id;
  if (cleaned.start_date == null) {
    cleaned.start_date = new Date().toISOString();
  }
  // ── A STATUS, ALWAYS ────────────────────────────────────────────────
  //
  // Adding "status" to the allowlist above changed nothing, because none
  // of the three creation paths sends one — not the create-from-request
  // dialog, not the quick-create form, not the pool allocation. And
  // isAccountLocked(null) is TRUE, so every account this action makes
  // was born unfundable: the customer's picker drops it, the admin
  // top-up refuses it, the bulk run refuses it, a withdrawal refuses it.
  // The card just reads "Being set up" for ever. The only cure was to
  // open Update Ad Account and press save, because THAT form defaults
  // status to active.
  //
  // The customer has paid EUR 50 by this point. The account has to work.
  if (cleaned.status == null || cleaned.status === "") {
    cleaned.status = "active";
  }
  // Same story for the funding floor. min_topup was not in the allowlist
  // at all, so no path set it, and the form falls back to 300 — in
  // whatever currency is being paid. "Put 1 in and confirm the figure
  // that lands" is the first step of the ad-account journey and it was
  // refused with "Minimum Amount: 300".
  if (cleaned.min_topup == null) {
    cleaned.min_topup = 0;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("ad_accounts")
    .insert(cleaned)
    .select("id")
    .single();
  if (insertError) return { ok: false, error: insertError.message };

  // Cost row is written after the account exists, and only when supplied.
  // A refusal here is reported but does not undo the account — the account
  // is the customer-facing thing and is already correct; the fee can be set
  // afterwards by the owner.
  const feeRes = await upsertSupplierFee(
    supabase,
    profile,
    inserted.id,
    input.supplier_fee_pct,
  );
  if (!feeRes.ok) {
    return {
      ok: true,
      data: { id: inserted.id },
      warning: `Ad account created, but the supplier fee was not saved: ${feeRes.error}`,
    };
  }

  return { ok: true, data: { id: inserted.id } };
}

// ─────────────────────────────────────────
// ad_accounts: update
// ─────────────────────────────────────────
// ── TWO FIELDS THE FORM SENDS AND THIS SILENTLY DROPPED ─────────────
//
// update-account-form sends `platform` and `advertiser_id`; neither was
// here, so the loop skipped them, the update succeeded on the rest, and
// the form said "Ad Account updated successfully."
//
// `platform` is not cosmetic: resolveEffectiveFeePct takes two
// percentage points off every future top-up when it is
// "eu-meta-premium", and the platform family decides which ad-account
// type -- and therefore which beneficiary bank -- a customer is told to
// pay. An admin correcting it watched the dropdown change, got a
// success toast, and the column never moved.
//
// `advertiser_id` is who the account belongs to. Reassigning one
// reported success and left it with the original customer, who kept
// seeing it, kept funding it and kept being billed for it.
//
// The CREATE allowlist has both, so the two forms disagreed about which
// of their own fields were real.
const AD_ACCOUNT_UPDATE_ALLOWED = [
  "name",
  "bm_id",
  "fee",
  "airtable",
  "timezone",
  "notes",
  "website_url",
  "metadata",
  "min_topup",
  "status",
  "platform",
  "advertiser_id",
] as const;
type AdAccountUpdateInput = Partial<
  Record<(typeof AD_ACCOUNT_UPDATE_ALLOWED)[number], unknown>
>;

export async function updateAdAccountAsAdmin(
  accountId: string,
  payload: AdAccountUpdateInput & { supplier_fee_pct?: unknown },
  ifUpdatedAt?: string,
): Promise<ActionResult> {
  if (typeof accountId !== "string" || accountId.length === 0) {
    return { ok: false, error: "Invalid input", code: "invalid" };
  }
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  const { data: existing } = await supabase
    .from("ad_accounts")
    .select("id, tenant_id, updated_at, fee, advertiser_id, platform")
    .eq("id", accountId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Ad account not found", code: "not_found" };
  if (existing.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }
  if (!versionMatches(existing.updated_at, ifUpdatedAt)) {
    return {
      ok: false,
      error: "This ad account was updated by someone else. Reload and retry.",
      code: "conflict",
    };
  }

  const cleaned: Record<string, unknown> = {};
  for (const col of AD_ACCOUNT_UPDATE_ALLOWED) {
    if (col in payload) cleaned[col] = payload[col];
  }
  // Number(), not typeof: the create path coerces and this did not, so
  // a string "500" skipped the bound entirely and "-5" skipped BOTH the
  // bound and the owner rule (feeIsAPrice treats <= 0 as "use the
  // plan"). A negative fee is not a fee.
  if ("fee" in cleaned && cleaned.fee !== null && cleaned.fee !== "") {
    const feeNum = Number(cleaned.fee);
    if (!Number.isFinite(feeNum) || feeNum < 0 || feeNum > 100) {
      return { ok: false, error: "Fee must be between 0 and 100" };
    }
    cleaned.fee = feeNum;
  }
  // ── `fee` IS A PRICE, AND PRICES ARE THE OWNER'S ────────────────────
  //
  // Forty lines from here, upsertSupplierFee refuses a non-owner the
  // SUPPLIER percentage -- what we pay. This column is what the CUSTOMER
  // pays, it is the bigger of the two, and it was admin-level.
  //
  // It is also the strongest lever in the app: resolveEffectiveFeePct
  // reads ad_accounts.fee FIRST and it wins over the plan, so it
  // overrides upsertPlan, upsertFeeDefault, upsertExchangeRate,
  // upsertAdAccountType and changeSubscriptionAmount -- every one of
  // which was deliberately raised to owner-only. An employee admin
  // editing one account from 5% to 25% charges EUR 2,500 instead of
  // EUR 500 on a EUR 10,000 top-up, invoiced, with no owner in the loop.
  //
  // Everything else on the form stays admin-level; only the price moves.
  // ...and ONLY when it actually moves. A disabled input still submits
  // its current value, so gating on "fee is in the payload" would refuse
  // an employee admin editing the NAME of any account that has a fee.
  //
  // NULL and 0 are the SAME state -- both mean "use the plan rate" -- and
  // treating them as different refused an employee admin renaming any
  // account whose fee had never been set: update-account-form sends
  // `fee: account.fee ?? 0`, so null -> 0 read as a price change.
  const asRate = (v: unknown): number => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
  };
  //
  // ── THE ALLOWANCE COMES FROM THE STORED ROW, NEVER THE PAYLOAD ─────
  //
  // `platform` and `advertiser_id` are both in the update allowlist, so
  // taking the allowance from the payload let an employee admin write
  // any price in two ordinary calls: create a type with
  // default_fee_pct 25 (types are admin-writable), update the account
  // with {platform: "that-type", fee: 25} -- allowed, because the
  // lookup matched the type they had just named -- then update again
  // with {platform: "eu-meta-psm"}, which is not a fee change, so the
  // gate never runs. Platform restored, fee 25, nobody asked the owner.
  // Same shape with advertiser_id and a 25% plan.
  //
  // What the account IS decides what its agreed rate is.
  const feeChanges =
    "fee" in cleaned &&
    asRate(cleaned.fee) !== asRate((existing as { fee?: unknown }).fee);
  if (feeChanges) {
    const isPrice = await feeIsAPrice(supabase, {
      advertiserId:
        String((existing as { advertiser_id?: unknown }).advertiser_id ?? "") ||
        null,
      platform:
        String((existing as { platform?: unknown }).platform ?? "") || null,
      tenantId: profile.tenant_id,
      fee: cleaned.fee,
    });
    if (isPrice) {
      const owner = await isTenantOwner(
        supabase,
        profile.tenant_id,
        profile.user_id,
      );
      if (owner.unreadable) {
        return {
          ok: false,
          error:
            "We couldn't check who owns this tenant just now, so we'd rather not change a price. Try again in a moment.",
          code: "conflict",
        };
      }
      if (!owner.owner) {
        return {
          ok: false,
          error:
            "That fee is not this customer's agreed rate, and only the super-admin can set a different one.",
          code: "forbidden",
        };
      }
    }
  }
  // ── AND A REASSIGNMENT HAS TO STAY IN THIS TENANT ──────────────────
  //
  // createAdAccountAsAdmin validates advertiser_id against the tenant;
  // this path only re-checked the ACCOUNT's tenant, so an account could
  // be handed to an advertiser in another one.
  if (typeof cleaned.advertiser_id === "string" && cleaned.advertiser_id) {
    const { data: newOwner } = await supabase
      .from("advertisers")
      .select("id, tenant_id")
      .eq("id", cleaned.advertiser_id)
      .maybeSingle();
    if (!newOwner || newOwner.tenant_id !== profile.tenant_id) {
      return {
        ok: false,
        error: "That customer is not in this tenant.",
        code: "forbidden",
      };
    }
  }
  // The cost row is its own write, so an update that ONLY changes the
  // supplier fee is legitimate and must not trip "No updatable fields".
  const touchesFee = payload.supplier_fee_pct !== undefined;
  if (Object.keys(cleaned).length === 0 && !touchesFee) {
    return { ok: false, error: "No updatable fields" };
  }

  if (Object.keys(cleaned).length > 0) {
    cleaned.updated_at = new Date().toISOString();
    // .select() and count the rows: an UPDATE matching NOTHING is not an
    // error in PostgREST, so without this an RLS refusal, a deleted row or a
    // stale id all reported success and the screen re-rendered the old value.
    const { data: rows, error: updateError } = await supabase
      .from("ad_accounts")
      .update(cleaned)
      .eq("id", accountId)
      .eq("tenant_id", profile.tenant_id)
      .select("id");
    if (updateError) return { ok: false, error: updateError.message };
    const wrote = wroteSomething(rows);
    if (!wrote.ok) return wrote;
  }

  const feeRes = await upsertSupplierFee(
    supabase,
    profile,
    accountId,
    payload.supplier_fee_pct,
  );
  if (!feeRes.ok) {
    // The ad-account fields (if any) did save. Say so rather than reporting
    // a clean success or a total failure — neither would be true.
    return Object.keys(cleaned).length > 0
      ? { ok: true, data: null, warning: `Saved, but the supplier fee was not: ${feeRes.error}` }
      : { ok: false, error: feeRes.error, code: "forbidden" };
  }

  return { ok: true, data: null };
}

// ─────────────────────────────────────────
// ad_account_requests: admin reject
// ─────────────────────────────────────────
export async function rejectAdAccountRequest(
  requestId: string,
  reason: string,
  ifUpdatedAt?: string,
): Promise<
  ActionResult<{ refunded: number; currency: string; perkRestored: boolean }>
> {
  if (typeof requestId !== "string" || requestId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  const { data: req } = await supabase
    .from("ad_account_requests")
    // advertiser_id too: the refusal refunds the fee, and the customer
    // is now told about it.
    .select("id, tenant_id, status, advertiser_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found" };
  if (req.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  if (req.status === "completed") {
    return { ok: false, error: "Request already completed" };
  }
  if (!(await checkVersion(supabase, "ad_account_requests", requestId, ifUpdatedAt))) {
    return {
      ok: false,
      error: "This request was changed by someone else. Reload and retry.",
      code: "conflict",
    };
  }

  const trimmedReason = typeof reason === "string" ? reason.trim() : "";

  // REJECTING GIVES THE FEE BACK. Requesting an ad account costs the
  // customer 50 EUR, taken from their wallet the moment they send it — the
  // form says exactly that. This used to write `status = 'rejected'` and
  // nothing else, so PSM declined to provide the thing and kept the money,
  // with nothing on any screen saying so.
  //
  // One RPC, one transaction: the rejection, the refund and the free-request
  // perk all move together, because two steps is how the second one gets
  // forgotten — which is what happened.
  const { data: refund, error: rpcError } = await supabase.rpc(
    "ad_account_request_reject_refund",
    { p_request_id: requestId, p_reason: trimmedReason || null },
  );
  if (rpcError) {
    // THE FUNCTION MAY NOT BE THERE YET. Migrations are pasted by hand
    // while code deploys in two minutes, so this action can reach a
    // database that has not got its RPC — and then no request can be
    // rejected at all.
    //
    // The tempting fallback is the old behaviour: write status =
    // 'rejected' and move on. That is exactly what this commit replaced,
    // because it declines to provide the thing and keeps the customer's
    // 50 EUR with nothing on any screen saying so. An admin blocked for
    // the minute it takes to paste a migration is a better outcome than a
    // customer quietly 50 EUR down.
    //
    // So: refuse, and name the file.
    if (
      rpcError.code === "42883" ||
      /could not find|does not exist/i.test(rpcError.message ?? "")
    ) {
      return {
        ok: false,
        error:
          "Rejecting also refunds the 50 EUR request fee, and that function is not installed yet. Apply migration 20260918220000_refund_rejected_request_fee.sql, then reject again — nothing has changed on this request.",
      };
    }
    return { ok: false, error: safeErrorMessage(rpcError) };
  }

  const paid = refund as {
    refunded?: number;
    currency?: string;
    perk_restored?: boolean;
  } | null;

  // ── EUR 50 GOING BACK IS NEWS ─────────────────────────────────────
  //
  // The fee was taken with no invoice and no wallet line, and putting
  // it back is just as quiet -- the balance goes up and nothing says
  // why. That is the same complaint from the other direction, and the
  // customer is the one who has to reconcile it.
  if (Number(paid?.refunded ?? 0) > 0) {
    await notifyAdvertiser(supabase, {
      advertiserId: (req as { advertiser_id?: string | null } | null)
        ?.advertiser_id,
      tenantId: profile.tenant_id,
      type: "request_fee_refunded",
      payload: {
        amount: paid?.refunded ?? null,
        currency: paid?.currency ?? "EUR",
        reason: trimmedReason || null,
      },
    });
  }

  return {
    ok: true,
    data: {
      refunded: Number(paid?.refunded ?? 0),
      currency: String(paid?.currency ?? "EUR"),
      perkRestored: !!paid?.perk_restored,
    },
  };
}

// ─────────────────────────────────────────
// setAdAccountRequestStatus — allow-listed status transitions
// ─────────────────────────────────────────
// 'rejected' AND 'cancelled' ARE DELIBERATELY ABSENT.
//
// Requesting an ad account costs the customer 50 EUR, taken from the
// wallet the moment they send it. rejectAdAccountRequest gives it back in
// one transaction. This action is a plain status write with no fee
// handling, so allowing those two values here was a second door to the
// same outcome with the refund missing — and worse, one that closes the
// first: ad_account_request_reject_refund refuses a row that is already
// rejected, so the 50 EUR could never be returned through the app
// afterwards.
//
// The live screen only ever sends in_progress/pending, so this was
// reachable only by calling the server action directly — which any
// authenticated admin can do. A door nobody walks through is still a door.
const REQUEST_STATUS = [
  "pending",
  "payment_pending",
  "in_progress",
  "completed",
] as const;
type RequestStatus = (typeof REQUEST_STATUS)[number];

export async function setAdAccountRequestStatus(
  requestId: string,
  status: RequestStatus,
  ifUpdatedAt?: string,
): Promise<ActionResult> {
  // ── COMPLETED IS THE END ────────────────────────────────────────────
  //
  // The list above deliberately excludes rejected and cancelled, with a
  // note that a door nobody walks through is still a door. `completed`
  // was left in, and it is the same door: set a completed request back
  // to pending and createAdAccountFromRequest's two guards — the status
  // check and the compare-and-swap on it — both pass again. A SECOND ad
  // account gets created against ONE EUR 50 fee, and the allowance
  // counter that decides whether the next request is free is then wrong
  // too.
  //
  // Nothing in the UI offers this; it is reachable by calling the action.
  if (status !== "completed") {
    const supabaseCheck = await createClient();
    const { data: current } = await supabaseCheck
      .from("ad_account_requests")
      .select("status")
      .eq("id", requestId)
      .maybeSingle();
    if (current && String(current.status) === "completed") {
      return {
        ok: false,
        error:
          "This request is already completed. Create a new request rather than reopening this one.",
      };
    }
  }
  if (typeof requestId !== "string" || requestId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }
  if (!REQUEST_STATUS.includes(status)) {
    return { ok: false, error: "Invalid status" };
  }
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  const { data: req } = await supabase
    .from("ad_account_requests")
    .select("id, tenant_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found" };
  if (req.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  if (!(await checkVersion(supabase, "ad_account_requests", requestId, ifUpdatedAt))) {
    return {
      ok: false,
      error: "This request was changed by someone else. Reload and retry.",
      code: "conflict",
    };
  }

  const { data: rows, error } = await supabase
    .from("ad_account_requests")
    .update({ status })
    .eq("id", requestId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  const wrote = wroteSomething(rows);
  if (!wrote.ok) return wrote;
  return { ok: true, data: null };
}

// ─────────────────────────────────────────
// createAdAccountFromRequest — combined operation:
// create the ad_account and mark the request completed atomically
// (best-effort — Supabase JS client can't do multi-statement tx from
// server actions; we roll back the account if the request update fails)
// ─────────────────────────────────────────
export async function createAdAccountFromRequest(
  requestId: string,
  accountInput: AdAccountInsertInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  if (typeof requestId !== "string" || requestId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }

  const { data: req } = await supabase
    .from("ad_account_requests")
    .select("id, tenant_id, status, advertiser_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found" };
  if (req.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  if (req.status === "completed") {
    return { ok: false, error: "Request already completed" };
  }

  // ── NOT WHILE THE FEE IS STILL UNPAID ───────────────────────────────
  //
  // The review dialog offers Create Ad Account on payment_pending, and
  // this action checked only that the status was not completed or
  // rejected — never whether the invoice raised for it had been paid. So
  // the account is delivered, the request is marked completed, and the
  // EUR 50 invoice is left unpaid and orphaned: on no queue, not
  // collected by the auto-debit (which only takes invoices carrying a
  // subscription_id), and on no screen. The account was given away for
  // nothing and nothing says so.
  if (req.status === "payment_pending") {
    const { data: openFees } = await supabase
      .from("invoices")
      .select("id, items, status")
      .eq("advertiser_id", req.advertiser_id)
      .eq("type", "ad_account_fee")
      .eq("status", "unpaid")
      .limit(50);
    const unpaid = (openFees ?? []).find((inv) => {
      const items = (inv as { items?: unknown }).items;
      return (
        Array.isArray(items) &&
        items.some(
          (it) =>
            (it as { ad_account_request_id?: string })
              ?.ad_account_request_id === requestId,
        )
      );
    });
    if (unpaid) {
      return {
        ok: false,
        error:
          "The fee for this request has not been paid yet. Wait for the invoice to settle, or void it first if you are waiving the fee.",
      };
    }
  }

  // A rejected request is not a request any more. Without this, admin B
  // rejecting while admin A has the review dialog open did not stop A from
  // creating the account — the customer then held a rejection AND an
  // account, and the 50 euro fee was returned in neither case.
  if (req.status === "rejected") {
    return {
      ok: false,
      error:
        // NOT "set it back to pending": setAdAccountRequestStatus
        // deliberately excludes `rejected` from its transitions, because
        // the EUR 50 refund has already been made and putting the row
        // back would charge for it a second time. The UI offers "Back to
        // pending" only for in_progress. So the remedy this sentence
        // named did not exist, and the admin was left with a request
        // that could not go forward or back.
        "Somebody rejected this request while you had it open, and the request fee has already been refunded. A rejected request can't be reopened — ask the customer to file a new one so the fee is taken correctly.",
    };
  }

  // Force the correct advertiser_id from the request row.
  const created = await createAdAccountAsAdmin({
    ...accountInput,
    advertiser_id: req.advertiser_id,
  });
  if (!created.ok) return created;

  // CLAIM IT. The status predicate is the whole guard: two admins who both
  // read `pending` both got here, both created an account and both marked
  // the request completed — one request, two ad accounts, two ok:true.
  // Its siblings rejectAdAccountRequest and setAdAccountRequestStatus both
  // take ifUpdatedAt; this one was missed, and a row-version check would
  // not have been enough anyway — the second write has to fail because the
  // row is no longer claimable, not because it changed.
  const { data: reqRows, error: reqError } = await supabase
    .from("ad_account_requests")
    .update({ status: "completed", rejection_reason: null })
    .eq("id", requestId)
    .eq("tenant_id", profile.tenant_id)
    .neq("status", "completed")
    .select("id");

  // The same rollback for a write that MATCHED NOTHING as for one that
  // errored. Leaving the request open beside a created account is how the
  // next admin creates a second one for the same request.
  if (reqError || !reqRows || reqRows.length === 0) {
    // COUNT THE ROWS. If this matches nothing, the advertiser keeps a
    // real, visible ad account while the admin is told it was rolled back
    // — and the retry creates a second one. A rollback runs on the same
    // client whose write just failed, which is precisely when it is least
    // trustworthy.
    const { data: rolledBack } = await supabase
      .from("ad_accounts")
      .delete()
      .eq("id", created.data.id)
      .select("id");
    if ((rolledBack ?? []).length === 0) {
      console.error(
        `ad account rollback matched no rows — ${created.data.id} still exists and the customer can see it`,
      );
    }
    return {
      ok: false,
      error:
        reqError?.message ??
        "The account was not created: the request could not be marked completed, so it was rolled back. Reload and try again.",
    };
  }
  return created;
}
