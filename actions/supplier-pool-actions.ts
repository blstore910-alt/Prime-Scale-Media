"use server";

import { feeIsAPrice, isTenantOwner } from "@/actions/_fee-is-a-price";
import { platformGroupFromSlug } from "@/lib/types/ad-account-type";

import { isAccountLocked } from "@/lib/pure-account-status";

import { createClient } from "@/lib/supabase/server";
import { syncSupplierPool } from "@/lib/integrations/sync-pool";
import { cookies } from "next/headers";
import { checkVersion, maintenanceGuard, type ActionResult } from "./_shared";
import { isSupplier1Live } from "@/lib/integrations/autopush";
import { getSupplier1Adapter } from "@/lib/integrations/supplier1";
import { safeErrorMessage } from "@/lib/pure-error";
import type { SupplierAdAccount } from "@/lib/types/supplier-ad-account";
import { pageAllRows } from "@/lib/page-all-rows";

// Admin context: maintenance guard + admin role + tenant, mirroring the other
// admin actions (multi-profile users are disambiguated by the profile_id
// cookie, and a deactivated admin loses access).
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
    ? (profiles.find((p) => p.id === existingProfile) ?? profiles[0])
    : profiles[0];
  if (profile.role !== "admin" || !profile.tenant_id) {
    return { ok: false as const, error: "Forbidden" };
  }
  if (profile.is_active === false || (profile.status ?? "active") === "inactive") {
    return { ok: false as const, error: "Account is inactive" };
  }
  return { ok: true as const, supabase, profile };
}

// ─────────────────────────────────────────
// listSupplierAdAccounts — read the pool
// ─────────────────────────────────────────
export async function listSupplierAdAccounts(): Promise<
  ActionResult<SupplierAdAccount[]>
> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  // Explicit column list, not '*': the table carries a `raw` jsonb blob (the
  // whole supplier payload, kept for debugging) that the UI never reads.
  // Shipping it for up to 1000 rows inflated the payload several times over.
  // Paged in full rather than capped at 1000. The screen derives its own
  // COUNTS from this list — "Unassigned (N)", "Allocated (N)" — and presents
  // them as fact, so a silent truncation would not merely hide inventory, it
  // would misstate how much of it is free. PostgREST caps a response at 1000
  // by default and says nothing about having done so.
  const PAGE = 1000;
  const rows: SupplierAdAccount[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("supplier_ad_accounts")
      .select(
        "id, tenant_id, provider, external_id, name, bm_id, platform, currency, timezone, status, fee_percentage, balance_cents, supplier_assigned_to, ad_account_id, advertiser_id, assigned_at, assigned_by, notes, synced_at, created_at, updated_at",
      )
      .eq("tenant_id", profile.tenant_id)
      .order("advertiser_id", { ascending: true, nullsFirst: true })
      .order("synced_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) return { ok: false, error: error.message };
    const page = (data ?? []) as SupplierAdAccount[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return { ok: true, data: rows };
}

// ─────────────────────────────────────────
// syncSupplierAdAccounts — pull the supplier's ad accounts into the pool
// ─────────────────────────────────────────
// Upserts on (tenant_id, provider, external_id) so re-syncing refreshes the
// mirrored fields and NEVER clobbers an existing allocation (advertiser_id /
// ad_account_id / assigned_at are simply not part of the upsert payload).
export async function syncSupplierAdAccounts(): Promise<
  ActionResult<{ fetched: number; upserted: number }>
> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  // ── NOT FROM THE MOCK. NOT INTO THE REAL POOL. ─────────────────────
  //
  // getSupplier1Adapter() falls back to mockSupplier1Adapter whenever
  // SUPPLIER1_MODE is not "live", and those variables are set on Preview
  // only — so on production this button was pulling a fixed made-up
  // dataset and UPSERTING it into supplier_ad_accounts, with status
  // "active", which is the status the allocator accepts. Then it toasted
  // "Synced 2 ad account(s) from the supplier."
  //
  // An admin allocates supplier1-mock-001 to a real customer. The
  // customer funds it. The money leaves their wallet, the push goes to
  // an account that does not exist, and there is nothing on any screen
  // that looks wrong.
  //
  // Reading a mock is harmless; writing one into the pool the allocator
  // draws from is not. So the refusal is here, at the write, rather than
  // in the adapter — the same mock is still what the worker and the
  // tests read.
  if (!isSupplier1Live()) {
    return {
      ok: false,
      error:
        "The supplier connection isn't configured on this environment, so there is nothing real to sync. Syncing here would put made-up accounts into the pool.",
      code: "invalid",
    };
  }

  // The work itself lives in lib/integrations/sync-pool.ts so the scheduled
  // run and this button do exactly the same thing. They used to diverge: the
  // worker's sync_ad_accounts job fetched the list and wrote nothing.
  const res = await syncSupplierPool(
    supabase,
    getSupplier1Adapter(),
    profile.tenant_id,
  );
  if (!res.ok) return { ok: false, error: res.error };

  const { fetched, upserted, newExternalIds, statusChanges } = res.data;
  const notes: string[] = [];
  if (newExternalIds.length) notes.push(`${newExternalIds.length} new`);
  if (statusChanges.length) notes.push(`${statusChanges.length} changed status`);

  return {
    ok: true,
    data: { fetched, upserted },
    // "47 accounts synced" is noise. What changed is the thing worth saying.
    warning: notes.length ? notes.join(", ") : undefined,
  };
}

// ─────────────────────────────────────────
// addManualPoolAccount — put an ad account WE hold into the pool
// ─────────────────────────────────────────
// The pool is "all allocatable inventory", not just the supplier's. Manual
// rows carry provider='manual' so syncSupplierAdAccounts (which upserts on
// (tenant, provider='supplier1', external_id)) never touches or overwrites
// them.
export async function addManualPoolAccount(input: {
  name: string;
  externalId?: string;
  platform?: string;
  currency?: string;
  timezone?: string;
  bmId?: string;
  feePercentage?: number;
  notes?: string;
}): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  const name = (input?.name ?? "").trim();
  if (!name) return { ok: false, error: "Name is required", code: "invalid" };

  const fee = input.feePercentage != null ? Number(input.feePercentage) : null;
  if (fee != null && (!Number.isFinite(fee) || fee < 0 || fee > 100)) {
    return { ok: false, error: "Fee must be between 0 and 100", code: "invalid" };
  }

  // A manual account still needs a stable identifier for the uniqueness
  // constraint — use the operator's own id (BM/account id) when given.
  const externalId =
    (input.externalId ?? "").trim() || `manual-${crypto.randomUUID().slice(0, 8)}`;

  const { data, error } = await supabase
    .from("supplier_ad_accounts")
    .insert({
      tenant_id: profile.tenant_id,
      provider: "manual",
      external_id: externalId,
      name,
      bm_id: (input.bmId ?? "").trim() || null,
      platform: (input.platform ?? "").trim() || null,
      currency: (input.currency ?? "").trim().toUpperCase() || null,
      timezone: (input.timezone ?? "").trim() || null,
      status: "active",
      fee_percentage: fee,
      notes: (input.notes ?? "").trim() || null,
      synced_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    const dup = /duplicate|unique/i.test(error.message)
      ? "An account with that identifier is already in the pool."
      : error.message;
    return { ok: false, error: dup };
  }
  return { ok: true, data: { id: data.id } };
}

// ─────────────────────────────────────────
// assignSupplierAdAccount — allocate a pooled account to an advertiser
// ─────────────────────────────────────────
// Creates the real public.ad_accounts row the advertiser will see, then stamps
// the allocation onto the pool row. The supplier's external id is carried in
// ad_accounts.metadata so top-up/withdraw pushes can address it later.
export async function assignSupplierAdAccount(input: {
  poolId: string;
  advertiserId: string;
  fee?: number;
  /** What WE pay the supplier. Defaults to the supplier's own reported fee. */
  supplierFeePct?: number | null;
  name?: string;
  /** An ad-account TYPE slug. Without it the family's only active type
   *  is used, and a family with several is left unresolved rather than
   *  guessed -- the slug decides which bank the customer is told to pay. */
  platform?: string;
}): Promise<ActionResult<{ ad_account_id: string }>> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  if (typeof input?.poolId !== "string" || !input.poolId) {
    return { ok: false, error: "poolId required", code: "invalid" };
  }
  if (typeof input?.advertiserId !== "string" || !input.advertiserId) {
    return { ok: false, error: "advertiserId required", code: "invalid" };
  }

  // Pool row must exist, belong to this tenant, and still be unallocated.
  const { data: pool } = await supabase
    .from("supplier_ad_accounts")
    .select(
      "id, tenant_id, provider, external_id, name, bm_id, platform, currency, timezone, fee_percentage, advertiser_id, status",
    )
    .eq("id", input.poolId)
    .maybeSingle();
  if (!pool) return { ok: false, error: "Pool account not found", code: "not_found" };
  if (pool.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }
  // ── SUSPENDED INVENTORY IS NOT INVENTORY ────────────────────────────
  //
  // The pool screen says this in its own words — "a suspended account in
  // the pool is inventory you must NOT allocate" — and then left it to
  // the admin to remember the filter: the default view is Unassigned /
  // Any status, and the "Unallocated inventory" count includes suspended
  // rows. This select did not even ask for `status`, so nothing here
  // could check it. Allocating one creates a real ad account the
  // customer sees, and the supplier then rejects or silently drops its
  // top-ups.
  //
  // isAccountLocked is the app's single source of truth for what counts
  // as unusable.
  if (isAccountLocked(pool.status)) {
    return {
      ok: false,
      error: `That pool account is ${String(pool.status ?? "not usable")} at the supplier, so it cannot be allocated. Release it or pick another.`,
      code: "invalid",
    };
  }

  if (pool.advertiser_id) {
    return {
      ok: false,
      error: "This ad account is already allocated to an advertiser.",
      code: "conflict",
    };
  }

  // Advertiser must be in the same tenant.
  const { data: adv } = await supabase
    .from("advertisers")
    .select("id, tenant_id")
    .eq("id", input.advertiserId)
    .maybeSingle();
  if (!adv) return { ok: false, error: "Advertiser not found", code: "not_found" };
  if (adv.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }

  // The fee is what PSM earns on every future top-up on this account, so an
  // ambiguous fee is refused rather than defaulted. Falling back to 0 when the
  // pool row had no supplier fee (a manual row added with the field blank, or
  // a synced row whose fee came back null — both shown as "—" in the table)
  // silently created an account PSM earns nothing on, while the modal's label
  // promised "defaults to the supplier's".
  if (input.fee == null && pool.fee_percentage == null) {
    return {
      ok: false,
      error:
        "This account has no supplier fee — enter the fee to charge on top-ups.",
      code: "invalid",
    };
  }
  // ── OUR COST IS NOT THEIR FEE ───────────────────────────────────────
  //
  // This fell back to `pool.fee_percentage`, which is what WE PAY the
  // supplier — so an allocation that arrived without a fee (the client
  // sends nothing when the customer has no plan rate) wrote our own cost
  // onto the ad account as the customer's rate. Every future top-up then
  // charges exactly what it costs: zero margin, permanently, and only
  // findable by comparing ad_accounts.fee against
  // ad_account_costs.supplier_fee_pct.
  //
  // A fee we were not given is a refusal, not a default.
  if (input.fee == null) {
    return {
      ok: false,
      error:
        "No fee was given for this allocation, and this customer has no plan rate to fall back on. Enter the fee to charge them on top-ups.",
      code: "invalid",
    };
  }
  const fee = Number(input.fee);
  if (!Number.isFinite(fee) || fee < 0 || fee > 100) {
    return { ok: false, error: "Fee must be between 0 and 100", code: "invalid" };
  }
  // ── THE SAME RULE AS BOTH OTHER WRITERS OF ad_accounts.fee ─────────
  //
  // This inserts `fee` straight into ad_accounts, bypassing
  // createAdAccountAsAdmin and therefore the gate that was put on it --
  // and the pool's own "Fee % we charge" box had no disabled either. So
  // the price rule, which exists because ad_accounts.fee outranks the
  // plan on every future top-up, was fully open on this screen.
  // ── THE TYPE THIS ACCOUNT ACTUALLY IS ─────────────────────────────
  //
  // Neither caller passes `input.platform`, so the type-default arm of
  // feeIsAPrice was dead here -- only a plan rate could ever be allowed,
  // and an advertiser with NO advertiser_plans row (which the phase-4
  // migration says is most of the existing estate) left an employee
  // admin with a disabled fee box, a disabled Allocate button, and a
  // tooltip telling them to type a fee they cannot type.
  //
  // The pool row knows its own type. That is the one to ask about.
  // ── THE POOL ROW FIRST, NOT THE PAYLOAD ───────────────────────────
  //
  // `input.platform` won, and a server action's arguments are whatever
  // the client POSTs -- so an employee admin sending
  // { fee: 25, platform: "a-type-they-just-made" } had the allowance
  // looked up against their own value and got 25 through in ONE call.
  // The pool row knows what this account actually is; the caller's slug
  // is only used further down, where it IS validated against
  // ad_account_types for this tenant.
  const resolvedPlatform =
    String((pool as { platform?: unknown }).platform ?? "") ||
    (typeof input.platform === "string" && input.platform) ||
    null;
  if (
    await feeIsAPrice(supabase, {
      advertiserId: input.advertiserId,
      platform: resolvedPlatform,
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
          "That fee is not this customer's agreed rate, and only the super-admin can set a different one. Leave it blank to use their plan rate, or ask the owner.",
        code: "forbidden",
      };
    }
  }

  // What WE pay the supplier. Seeded from the supplier's own reported figure
  // so the common case needs no typing, but stored on the ad account rather
  // than read from the pool row at display time — the pool row is a mirror
  // that every sync overwrites, and it can be released while the advertiser's
  // account lives on. NULL stays NULL: "not recorded" is not "they charge us
  // nothing", and a 0 default would make every account claim full margin.
  const supplierFeeRaw =
    input.supplierFeePct !== undefined
      ? input.supplierFeePct
      : pool.fee_percentage;
  let supplierFeePct: number | null = null;
  if (supplierFeeRaw != null && supplierFeeRaw !== "") {
    supplierFeePct = Number(supplierFeeRaw);
    if (!Number.isFinite(supplierFeePct) || supplierFeePct < 0 || supplierFeePct > 100) {
      return {
        ok: false,
        error: "Supplier fee must be between 0 and 100",
        code: "invalid",
      };
    }
  }

  // CLAIM FIRST, then create. The order matters: these are two separate
  // writes, and the claim is the only point of mutual exclusion. Creating the
  // ad_accounts row first meant the admin who LOST the race — or any failure
  // on the second statement — left a real, advertiser-visible ad account
  // behind that no pool row referenced, while being told the allocation
  // failed. Claiming first means a lost race costs nothing, and the only
  // failure left to compensate for (the insert) is one we can undo.
  const { data: claimed, error: claimError } = await supabase
    .from("supplier_ad_accounts")
    .update({
      advertiser_id: input.advertiserId,
      assigned_at: new Date().toISOString(),
      assigned_by: profile.id,
    })
    .eq("id", pool.id)
    .eq("tenant_id", profile.tenant_id)
    .is("advertiser_id", null)
    .select("id");
  if (claimError) return { ok: false, error: claimError.message };
  if (!claimed || claimed.length === 0) {
    return {
      ok: false,
      error: "Someone else just allocated this ad account. Reload and retry.",
      code: "conflict",
    };
  }

  // The tenant's own type for this platform family. A supplier emits a
  // family ("meta-ads"); the app works in types ("eu-meta-psm"). Prefer
  // an active type of that family, by sort order, and fall back to the
  // family name only when the tenant has none — a wrong-looking slug is
  // better than a null one, and the settings screen can correct it.
  // ── A GUESS IS WORSE THAN "UNKNOWN" HERE ──────────────────────────
  //
  // This resolved the family to "the first active type by sort_order",
  // and called it the tenant's default. There is no default: sort_order
  // is a display order, and the seed ships hk-meta-premium at 1 and
  // eu-meta-psm at 5. So every pool-allocated Meta account -- EU ones
  // included -- was stamped hk-meta-premium.
  //
  // That is not a cosmetic mislabel. BANK_BY_TYPE_SLUG routes
  // eu-meta-psm-gh to one beneficiary and the HK types to another, so a
  // wrong slug tells the customer to wire real money to the wrong
  // company. It also shows the admin a confident supplier pill pointing
  // at the wrong dashboard for a manual top-up.
  //
  // So: take the type the caller chose; otherwise use the family's only
  // active type when there IS only one; otherwise leave the family name
  // in place and say so. A family name matches no bank rule, so the
  // customer's top-up screen says it cannot name a beneficiary yet --
  // which is true, and sends them to ask rather than to pay the wrong
  // account.
  const family = platformGroupFromSlug(String(pool.platform ?? ""));
  let typeSlug = String(pool.platform ?? "");
  let typeUnresolved = false;

  const chosen = String(input.platform ?? "").trim();
  if (chosen) {
    const { data: picked } = await supabase
      .from("ad_account_types")
      .select("slug")
      .eq("tenant_id", profile.tenant_id)
      .eq("slug", chosen)
      .maybeSingle();
    if (!picked) {
      return {
        ok: false,
        error: `"${chosen}" is not an ad-account type on this tenant.`,
        code: "invalid",
      };
    }
    typeSlug = chosen;
  } else if (family) {
    const { data: types } = await supabase
      .from("ad_account_types")
      .select("slug, platform_group, is_active, sort_order")
      .eq("tenant_id", profile.tenant_id)
      .eq("platform_group", family)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(5);
    const list = (types ?? []) as { slug?: string }[];
    if (list.length === 1 && list[0]?.slug) {
      typeSlug = list[0].slug;
    } else if (list.length > 1) {
      typeUnresolved = true;
    }
  }

  const { data: created, error: createError } = await supabase
    .from("ad_accounts")
    .insert({
      name: input.name?.trim() || pool.name || `Account ${pool.external_id}`,
      advertiser_id: input.advertiserId,
      tenant_id: profile.tenant_id,
      bm_id: pool.bm_id,
      // ── A FAMILY IS NOT A TYPE ────────────────────────────────────
      //
      // pool.platform is what the supplier adapter emits: "meta-ads",
      // "tiktok-ads", "google-ads". Every other consumer of
      // ad_accounts.platform reads it as an ad-account TYPE slug
      // (eu-meta-psm, hk-meta-premium, …), and none of those three
      // family names is one. Three features therefore failed silently
      // on every pool-allocated account:
      //
      //   * useSupplierLinks finds no type, so the admin verifying that
      //     account's top-up is shown NO supplier pill — the exact gap
      //     that hook exists to close;
      //   * resolveEffectiveFeePct's premium branch can never be true,
      //     so the premium discount never applies;
      //   * BANK_BY_TYPE_SLUG has no entry, so the customer's wallet
      //     top-up screen cannot name a beneficiary bank.
      //
      // Resolved to a real type of the same family, preferring the
      // tenant's own default for that family. The create-from-request
      // path already does this; only the pool path did not.
      platform: typeSlug,
      currency: pool.currency,
      timezone: pool.timezone,
      // Non-nullable in lib/types/account.ts and required by the ad-account
      // form; the sibling createAdAccountAsAdmin defaults it the same way.
      start_date: new Date().toISOString(),
      // ── A STATUS, HERE TOO ──────────────────────────────────────────
      //
      // createAdAccountAsAdmin was fixed for this and its comment names
      // the path that was not: the pool allocation. isAccountLocked(null)
      // is true, so an allocated account was born unfundable — the
      // customer's picker drops it, both top-up paths refuse it, a
      // withdrawal refuses it — while releaseSupplierAdAccount reads
      // (status ?? "active") and therefore calls the SAME row still
      // running and refuses the release. Two guards contradicting each
      // other on one row, and the only cure was to open the edit form
      // and save.
      status: "active",
      // ── AND THE FUNDING FLOOR ─────────────────────────────────────
      //
      // createAdAccountAsAdmin defaults this to 0 and its comment names
      // the fault: the top-up form falls back to 300 when min_topup is
      // null, so the customer's FIRST top-up on a pool-allocated
      // account was refused with "Minimum Amount: 300" — and "put 1 in
      // and confirm the figure that lands" is step one of the
      // ad-account journey. The pool path never set it.
      min_topup: 0,
      fee,
      created_by: profile.user_id,
      // NOTHING about the supplier goes on this row. The advertiser reads
      // their own ad_accounts through RLS with select("*"), so anything put
      // here is delivered to the customer's browser — and the supplier must
      // never be visible to a customer under any name. The provenance is
      // recorded below in the admin-only cost table instead.
    })
    .select("id")
    .single();

  if (createError || !created) {
    // Release the claim so the account goes back in the pool instead of being
    // stuck allocated-to-nothing.
    const { data: releasedRows } = await supabase
      .from("supplier_ad_accounts")
      .update({
        advertiser_id: null,
        assigned_at: null,
        assigned_by: null,
      })
      .eq("id", pool.id)
      .eq("tenant_id", profile.tenant_id)
      .select("id");
    // The release is what puts the account back in the pool. If it matched
    // nothing the account is stuck allocated-to-nobody and will never be
    // offered again — silent, and only findable by reading the table. Say so
    // in the log next to the failure that caused it.
    if (!releasedRows || releasedRows.length === 0) {
      console.error(
        "pool allocate rollback wrote no rows — account may be stuck claimed:",
        pool.id,
      );
    }
    console.error("pool allocate insert failed:", safeErrorMessage(createError));
    return { ok: false, error: createError?.message ?? "Could not create ad account" };
  }

  // Link the two. Best-effort: the allocation itself already holds, and
  // leaving ad_account_id unset only affects the auto-push lookup, which is
  // recoverable by re-allocating.
  const { data: linkRows, error: linkError } = await supabase
    .from("supplier_ad_accounts")
    .update({ ad_account_id: created.id })
    .eq("id", pool.id)
    .eq("tenant_id", profile.tenant_id)
    .select("id");
  // Best-effort by design, but a write that matched NOTHING has exactly the
  // same consequence as one that errored, and only the errored one was being
  // logged.
  if (linkError || !linkRows || linkRows.length === 0) {
    console.error(
      "pool link failed:",
      linkError ? safeErrorMessage(linkError) : "no rows matched",
    );
  }

  // What WE pay AND where the account came from both go in the admin-only
  // cost table, never on the ad_accounts row — an advertiser can read their
  // own ad_accounts through RLS.
  let warning: string | undefined;
  const { error: costError } = await supabase.from("ad_account_costs").upsert(
    {
      ad_account_id: created.id,
      tenant_id: profile.tenant_id,
      ...(supplierFeePct != null ? { supplier_fee_pct: supplierFeePct } : {}),
      supplier_source: pool.provider,
      supplier_external_id: pool.external_id,
      pool_id: pool.id,
    },
    { onConflict: "ad_account_id" },
  );
  if (costError) {
    console.error("cost row failed:", safeErrorMessage(costError));
    // Say which half failed — a missing fee costs us margin reporting, a
    // missing link costs us the provenance trail. Neither undoes the
    // allocation, which already holds.
    warning = `Allocated, but the supplier fee and provenance were not saved: ${costError.message}`;
  }
  if (typeUnresolved) {
    const note = `This tenant has several active ${family} types, so the account was created against "${typeSlug}" rather than a guess. Set its type on the account before the customer tops it up -- the type decides which bank they are told to pay.`;
    warning = warning ? `${warning} ${note}` : note;
  }

  return { ok: true, data: { ad_account_id: created.id }, warning };
}

// ─────────────────────────────────────────
// releaseSupplierAdAccount — put an allocated account back in the pool
// ─────────────────────────────────────────
// Clears the allocation stamp. REFUSES while the advertiser's ad_accounts row
// is still active, because releasing does real damage in that state: the
// auto-push path resolves the supplier's id by looking the pool row up on
// ad_account_id (lib/integrations/enqueue.ts), so nulling it makes every
// future top-up on that live account fall through to "not supplier-managed"
// and stop being pushed — silently. Worse, the pool row could then be
// allocated to a SECOND advertiser with no warning on either screen.
export async function releaseSupplierAdAccount(
  poolId: string,
  ifUpdatedAt?: string,
): Promise<ActionResult> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  const { data: pool } = await supabase
    .from("supplier_ad_accounts")
    .select("id, tenant_id, ad_account_id, advertiser_id")
    .eq("id", poolId)
    .maybeSingle();
  if (!pool) return { ok: false, error: "Pool account not found", code: "not_found" };
  if (pool.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }

  // Optimistic concurrency (CLAUDE.md mutation rule 4) — the pool list has a
  // 30s staleTime, so acting on a stale row is routine.
  const fresh = await checkVersion(
    supabase,
    "supplier_ad_accounts",
    poolId,
    ifUpdatedAt,
  );
  if (!fresh) {
    return {
      ok: false,
      error: "This pool account changed since you loaded it. Reload and retry.",
      code: "conflict",
    };
  }

  // ── A NULL LINK IS NOT PERMISSION ────────────────────────────────
  //
  // Both guards below — "is the ad account stopped" and "is there still
  // money on it" — used to sit inside this branch, so a pool row whose
  // ad_account_id is null was released with NO checks at all. And that
  // is a state allocation can leave behind: the link write is
  // best-effort (see "pool link failed" below), so an allocation can
  // succeed with advertiser_id set and ad_account_id null. Releasing
  // then hands the row to the next customer while the first customer's
  // ad_accounts row is still live and fundable — two customers on one
  // real supplier account, which no per-row guard can ever see.
  //
  // An allocated row with no link is refused, and says what to do.
  if (!pool.ad_account_id && pool.advertiser_id) {
    return {
      ok: false,
      error:
        "This pool row is allocated but not linked to an ad account, so we cannot check whether it still holds money. Find the customer's ad account, empty it and stop it, then link or remove this row by hand.",
      code: "invalid",
    };
  }

  if (pool.ad_account_id) {
    // ── EMPTY IT FIRST ────────────────────────────────────────────────
    //
    // This guard reads the STATUS and not the balance, so a supplier
    // account could be handed back to the pool — and on to the next
    // advertiser — with the previous one's money still on it. The only
    // trace was a negative Funded column on a row nobody looks at again.
    //
    // Funded is completed top-ups minus approved withdrawals, in USD,
    // which is the same figure /accounts shows. Above zero means there
    // is something on the account to get out first.
    {
      // ── A FAILED READ IS NOT "IT IS EMPTY" ──────────────────────
      //
      // Neither error was captured. A refused top_ups read gave
      // `tops === null`, so funded became `0 - withdrawals`, which is
      // never above the threshold -- the guard passed and the account
      // was released with the customer's money still on it. That is
      // precisely the outcome the paragraph above says this exists to
      // prevent, and the money then goes to whoever gets the account
      // next.
      //
      // And pageAllRows, not .limit(1000): this file pages its own
      // listing for exactly this reason ("PostgREST caps a response at
      // 1000 by default and says nothing about having done so"), while
      // the money guard took the cap. A long-lived account past a
      // thousand top-ups would under-count what is on it.
      const tops = await pageAllRows<{ topup_amount?: unknown }>(
        (from: number, to: number) =>
        supabase
          .from("top_ups")
          .select("topup_amount")
          .eq("account_id", pool.ad_account_id!)
          .eq("status", "completed")
          .not("is_deleted", "is", true)
          .order("id", { ascending: true })
          .range(from, to),
      );
      if (tops.error) {
        return {
          ok: false,
          error:
            "We couldn't check what this account still holds, so it has not been released. Try again in a moment.",
          code: "conflict",
        };
      }
      const wds = await pageAllRows<{ amount?: unknown }>(
        (from: number, to: number) =>
        supabase
          .from("ad_account_withdrawals")
          .select("amount")
          .eq("ad_account_id", pool.ad_account_id!)
          .eq("status", "approved")
          .order("id", { ascending: true })
          .range(from, to),
      );
      if (wds.error) {
        return {
          ok: false,
          error:
            "We couldn't check what has already been withdrawn from this account, so it has not been released. Try again in a moment.",
          code: "conflict",
        };
      }
      const funded =
        tops.rows.reduce(
          (a, t) => a + (Number((t as { topup_amount?: unknown }).topup_amount) || 0),
          0,
        ) -
        wds.rows.reduce(
          (a, w) => a + (Number((w as { amount?: unknown }).amount) || 0),
          0,
        );
      if (funded > 0.005) {
        return {
          ok: false,
          error: `This account still holds about $${funded.toFixed(
            2,
          )}. Withdraw it back to the advertiser's wallet first — once it is released, that money goes with it to whoever gets the account next.`,
          code: "invalid",
        };
      }
    }

    const { data: acct } = await supabase
      .from("ad_accounts")
      .select("id, name, status")
      .eq("id", pool.ad_account_id)
      .maybeSingle();
    // The statuses that actually mean "not running", not the single word
    // 'inactive'. This asked for a value NOTHING WRITES ANY MORE: the ad
    // account status model (lib/ad-account-status.ts) makes 'inactive' a
    // DERIVED fact — no top-up in 30 days — and an admin chooses between
    // Active, Disabled and Banned. So the guard could never pass: the admin
    // went to the Ad Accounts screen, picked the only off-switch there is
    // (Disabled), came back, and got the same refusal, with an error naming
    // a remedy the UI cannot perform. A supplier account could not be
    // released from a linked ad account at all.
    const STOPPED = ["disabled", "banned", "paused", "suspended", "inactive"];
    const acctStatus = (acct?.status ?? "active").trim().toLowerCase();
    if (acct && !STOPPED.includes(acctStatus)) {
      return {
        ok: false,
        error: `"${acct.name ?? "The linked ad account"}" is still running. Set it to Disabled or Banned on the Ad Accounts screen first — releasing now would stop its top-ups reaching the supplier.`,
        code: "conflict",
      };
    }
  }

  // Guarded on the advertiser we read, so a concurrent re-allocation isn't
  // wiped by a stale release.
  const query = supabase
    .from("supplier_ad_accounts")
    .update({
      // ── THE CUSTOMER'S ROW IS NOT TOUCHED ──────────────────────────
      //
      // Only the POOL row is unlinked. The customer's ad_accounts row
      // keeps its name, its status and every one of its top-ups, so
      // their history survives being handed back: an account that once
      // held six figures still says so on their screen, switched off.
      // That is deliberate, and the customer card prints "Funded to
      // date" for exactly this.
      //
      // The release is already refused unless that account is stopped
      // (see the status guard above), so it cannot be left looking live
      // on somebody who no longer has it.
      ad_account_id: null,
      advertiser_id: null,
      assigned_at: null,
      assigned_by: null,
    })
    .eq("id", poolId)
    .eq("tenant_id", profile.tenant_id);
  const { data: releasedRows, error } = await (pool.advertiser_id
    ? query.eq("advertiser_id", pool.advertiser_id)
    : query
  ).select("id");
  if (error) return { ok: false, error: error.message };
  if (pool.advertiser_id && (!releasedRows || releasedRows.length === 0)) {
    return {
      ok: false,
      error: "This ad account was just re-allocated. Reload and retry.",
      code: "conflict",
    };
  }
  return { ok: true, data: null };
}
