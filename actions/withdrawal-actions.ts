"use server";

import { createClient } from "@/lib/supabase/server";
import { pageAllRows, pageAllRowsTolerant } from "@/lib/page-all-rows";
import { enqueueSupplierWithdrawPush } from "@/lib/integrations/enqueue";
import { safeErrorMessage } from "@/lib/pure-error";
import { landedOnAccount } from "@/lib/pure-topup-landed";
import { LIMITS, rateLimitCheck } from "@/lib/rate-limit";
import { resolveAdminContext, resolveUserContext } from "./_shared";
import {
  isAccountLocked,
  accountLockedReason,
} from "@/lib/pure-account-status";
import { notifyAdvertiser } from "@/lib/notify-advertiser";

type ActionResult<T = null> =
  // `warning` is a success that came with something the caller has to be
  // told — here: the wallet was credited but the supplier was not told
  // to take the money off the ad account. Surfaced by toastResult().
  | { ok: true; data: T; warning?: string }
  | { ok: false; error: string };

// Per-user throttle for a customer-initiated financial request.
// Returns the caller id (for reuse) or an error result.
async function throttleFinancial(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return { ok: false, error: "Unauthorized" };
  const allowed = await rateLimitCheck(LIMITS.financialRequest, `user:${uid}`);
  if (!allowed) {
    return { ok: false, error: "Too many requests — try again later." };
  }
  return { ok: true, userId: uid };
}


// ─────────────────────────────────────────
// fundedUsd — what is actually ON an ad account, in USD
// ─────────────────────────────────────────
//
// ── THE GUARD THAT WAS NEVER THERE ──────────────────────────────────
//
// Neither RPC checks a balance. ad_account_withdrawal_request validates
// ownership and nothing else, and ad_account_withdrawal_approve does
// `usd_balance + v_wd.amount` unconditionally. The account STATUS was
// the only gate, and once `disabled` had to be withdrawable — it does,
// it is the step before releasing a supplier account back to the pool —
// the gate came down to banned/closed.
//
// So an advertiser could ask for 5,000 off an account that was never
// funded, and an approving admin, who is shown neither a balance nor a
// status on that screen, credited a wallet out of nothing.
//
// Funded = completed top-ups minus withdrawals already taken or asked
// for. Money actually SPENT at the platform is not in our database, so
// this is a ceiling and not a balance — but "never put on the account
// in the first place" is the case that creates money, and this closes
// it exactly.
//
// FAILS CLOSED. A read we could not make is not a zero and it is not an
// unlimited balance: three guards written the same week each discarded
// their read error and fell through to the permissive branch, which is
// how a guard becomes decoration.
async function fundedUsd(
  supabase: Awaited<ReturnType<typeof createClient>>,
  adAccountId: string,
  /** The account's OWN currency. What lands on it is what can come off it. */
  accountCurrency: string,
): Promise<
  | { ok: true; funded: number; otherCurrency: number }
  | { ok: false; error: string }
> {
  const [topups, withdrawals] = await Promise.all([
    // ── A STRUCK-OUT TOP-UP IS NOT FUNDING ───────────────────────────
    // is_deleted is the only way to strike out a COMPLETED top-up, and
    // every other reader of this table honours it. Left out here, a
    // EUR 10,000 top-up verified onto the wrong account and then struck
    // out still counted as money ON the account — so it could be
    // withdrawn to a wallet, which is money out of nothing inside the
    // guard that exists to stop money out of nothing.
    //
    // PAGED, because PostgREST caps a response at 1,000 rows. Missing
    // top-ups only under-counts (fails closed); missing WITHDRAWALS
    // inflates the balance, which fails open.
    // topup_usd AND currency, because topup_amount alone is ambiguous:
    // it is USD on the admin paths and the PAYMENT currency on the
    // customer's own. landedOnAccount reads topup_usd to tell them
    // apart, and without these three columns it cannot.
    pageAllRowsTolerant<{
      topup_amount: unknown;
      topup_usd: unknown;
      currency: unknown;
    }>(
      (from, to) =>
        supabase
          .from("top_ups")
          .select("topup_amount, topup_usd, currency")
          .eq("account_id", adAccountId)
          .eq("status", "completed")
          .not("is_deleted", "is", true)
          .order("id", { ascending: true })
          .range(from, to),
      (from, to) =>
        supabase
          .from("top_ups")
          .select("topup_amount, topup_usd, currency")
          .eq("account_id", adAccountId)
          .eq("status", "completed")
          .order("id", { ascending: true })
          .range(from, to),
    ),
    pageAllRows<{ amount: unknown; status: unknown }>((from, to) =>
      supabase
        .from("ad_account_withdrawals")
        .select("amount, status")
        .eq("ad_account_id", adAccountId)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  if (topups.error) {
    return {
      ok: false,
      error:
        "We could not read what is on this account just now — try again in a moment.",
    };
  }
  if (withdrawals.error) {
    return {
      ok: false,
      error:
        "We could not read this account's withdrawals just now — try again in a moment.",
    };
  }

  // ── SUM THE ROWS THAT ARE IN THIS ACCOUNT'S OWN CURRENCY ──────────
  //
  // This summed `topup_amount` raw and called the result USD. For a
  // customer-filed row that column is the PAYMENT currency: a EUR
  // account funded EUR 100 at 3% stores 97.00 EUR, and the dollar
  // figure lives in topup_usd. So the ceiling was euros wearing a
  // dollar sign — AA-PSM0005-EU-01 holds EUR 194.00 and the withdrawal
  // path offered "$194.00", which approving would have credited as 194
  // dollars for 194 euros.
  //
  // landedOnAccount is the discriminator and it is not a guess:
  // topup_usd present <=> the customer filed it, and then topup_amount
  // is in `currency`.
  //
  // Rows in ANOTHER currency are counted separately rather than
  // converted. Converting here would be this app's second exchange
  // rate, and the wallet is the only place allowed to change one
  // currency into another.
  let inCurrency = 0;
  let otherCurrency = 0;
  for (const r of topups.rows) {
    const landed = landedOnAccount(r as Parameters<typeof landedOnAccount>[0]);
    const amt = Number(landed.amount) || 0;
    if (landed.currency === accountCurrency) inCurrency += amt;
    else otherCurrency += amt;
  }
  const inUsd = inCurrency;
  // Pending counts against the balance too. Two requests for the whole
  // balance are each valid on their own and only one of them is.
  const outUsd = withdrawals.rows.reduce((sum, r) => {
    const row = r as { amount?: unknown; status?: unknown };
    const status = String(row.status ?? "").toLowerCase();
    if (status === "rejected" || status === "cancelled") return sum;
    return sum + (Number(row.amount) || 0);
  }, 0);

  return { ok: true, funded: inUsd - outUsd, otherCurrency };
}

const usd = (v: number) =>
  "$" +
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);

// ─────────────────────────────────────────
// requestAdAccountWithdrawal — advertiser
// Pulls balance from one of their ad accounts back to their wallet.
// The RPC validates account ownership; no auto balance check (admin
// is the gate until Supplier 1 is wired).
// ─────────────────────────────────────────
export async function requestAdAccountWithdrawal(input: {
  ad_account_id: string;
  amount: number;
  currency: "USD" | "EUR";
  reason?: string;
}): Promise<ActionResult<{ id: string }>> {
  // resolveUserContext, NOT resolveAdminContext. This is the advertiser's own
  // action — it is what the "Withdraw to wallet" form on their ad account
  // calls. It was hardened with the admin guard by mistake, which meant every
  // customer withdrawal request was refused with "Forbidden" from the moment
  // that shipped; the only people it let through were admins, who do not use
  // this form. The freeze and the deactivated-account refusal are the parts
  // that were actually wanted, and resolveUserContext carries both. Ownership
  // of the ad account is validated by the RPC below, as it always was.
  const auth = await resolveUserContext();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { supabase } = auth.ctx;
  const gate = await throttleFinancial(supabase);
  if (!gate.ok) return gate;

  const amount = Number(input?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a positive amount." };
  }
  if (input.currency !== "USD" && input.currency !== "EUR") {
    return { ok: false, error: "Unsupported currency." };
  }
  if (typeof input.ad_account_id !== "string" || !input.ad_account_id) {
    return { ok: false, error: "Pick an ad account." };
  }

  // ── The ACCOUNT's currency, never the caller's ──────────────────────
  // This was a free choice: the dialog offered USD and EUR in a dropdown,
  // the action checked only that it was one of the two, and the RPC's
  // approve branch credits the wallet 1:1 in whatever came through —
  // `if v_wd.currency = 'USD' then usd_balance + amount elsif ... eur_balance
  // + amount`. It never reads ad_accounts.currency.
  //
  // Money on an ad account is USD by construction. So a customer with
  // $1,000 on a USD account could flip the dropdown to EUR, ask for 1000,
  // and an approving admin credited €1,000 — worth $1,162.79 at 0.86. A
  // 16.3% gain per round trip, repeatable, and invisible to the admin
  // because the withdrawals screen shows the account NAME and the
  // requested currency, not the account's own currency.
  //
  // The currency is not the customer's to choose. It is a property of the
  // account the money is on, so it is read from there and the caller's
  // value is only used to catch a mismatch and say so.
  const { data: acct, error: acctErr } = await supabase
    .from("ad_accounts")
    .select("id, name, currency, status")
    .eq("id", input.ad_account_id)
    .maybeSingle();
  if (acctErr) return { ok: false, error: safeErrorMessage(acctErr) };
  if (!acct) return { ok: false, error: "That ad account was not found." };

  // ── A SWITCHED-OFF ACCOUNT MOVES NO MONEY ───────────────────────────
  //
  // The sheet gates the button on this now, and a button is not a
  // boundary: the RPC checks ownership and never looks at status, so a
  // withdrawal from a banned or closed account was created as `pending`
  // and an admin could approve it — crediting the wallet from an account
  // the platform had already shut. Nothing on the approve screen shows
  // the status either.
  //
  // An unknown status counts as locked. See lib/pure-account-status.
  // ── DISABLED HAS TO STAY EMPTIABLE ──────────────────────────────────
  //
  // `disabled` is the admin's own off-switch, and it is also what the
  // pool-release guard REQUIRES before a supplier account can be handed
  // back. Treating it as a reason to refuse a withdrawal closed the only
  // door the money has: switch the account off to release it, and the
  // balance is now stranded on it — the release then happens anyway,
  // because that guard reads the status and not the balance, and the
  // next advertiser gets the row with somebody else's money on it.
  //
  // So the rule is the other way round: you empty it FIRST and release
  // it after. A withdrawal off a disabled account is exactly that step.
  //
  // banned and closed stay refused: those are the platform's word, not
  // ours, and the money is not ours to move on our own say-so.
  const acctStatus = String(
    (acct as { status?: string | null }).status ?? "",
  ).toLowerCase();
  if (acctStatus === "banned" || acctStatus === "closed") {
    return {
      ok: false,
      error:
        accountLockedReason((acct as { status?: string | null }).status) +
        " Nothing can be withdrawn from it — message us if that looks wrong.",
    };
  }

  // ── THE BALANCE IS USD. THE ACCOUNT'S CURRENCY IS NOT THE BALANCE'S ──
  //
  // The previous fix anchored the withdrawal to ad_accounts.currency and
  // closed nothing, because that column is the currency the account is
  // FUNDED in, not the currency the balance is held in. An ad-account
  // balance is top_ups.topup_amount, and that column is USD for every
  // payment currency — utils-pure.ts converts on the way in, the account
  // sheet prints it with a $, and the test suite asserts it.
  //
  // So on a EUR account the two agreed, the guard passed, and the exploit
  // survived untouched:
  //
  //   fund a EUR account with EUR 1,000  ->  $1,139.53 lands on it
  //   withdraw 1139.53, "comes back as EUR"
  //   approve  ->  eur_balance += 1139.53
  //
  // +13.95% per round trip, repeatable, and still invisible on the
  // withdrawals screen.
  //
  // The balance is USD, so the withdrawal is USD. A customer who wants it
  // in euros converts it in their wallet afterwards, where a real rate is
  // applied and recorded — which is the only place in this app that is
  // allowed to change one currency into another.
  // ── THE ACCOUNT'S OWN CURRENCY, NOT A HARD-CODED USD ─────────────
  //
  // This pinned the withdrawal to USD whatever the account was, on the
  // premise that "the balance on an ad account is held in USD". The
  // data says otherwise: a customer-filed funding stores the landed
  // amount in the PAYMENT currency (EUR 194.00 on AA-PSM0005-EU-01)
  // and the dollar figure separately in topup_usd (222.38).
  //
  // So the old rule handed back the euro NUMBER as dollars: EUR 194 in,
  // USD 194 out, about EUR 25 short, every round trip. And it
  // contradicted the account's own screen, which says Currency: EUR.
  //
  // An ad account has one currency for its life. What went on in euros
  // comes back in euros, into the EUR wallet — which is exactly what
  // ad_account_withdrawal_approve already does: it branches on the
  // withdrawal's currency and credits eur_balance or usd_balance. The
  // RPC was right; only the caller was wrong.
  const fundedIn = (acct.currency ?? "USD").trim().toUpperCase();
  const accountCurrency = fundedIn === "EUR" ? "EUR" : "USD";
  if (input.currency !== accountCurrency) {
    return {
      ok: false,
      error: `${acct.name ?? "This account"} is in ${accountCurrency}, so money comes back in ${accountCurrency}. Exchange it in your wallet afterwards if you need the other one.`,
    };
  }

  // What is on it. A cent of tolerance, because these are numeric
  // columns summed in JS and an exact-equality refusal on a full
  // withdrawal would be a bug of its own.
  const available = await fundedUsd(supabase, input.ad_account_id, accountCurrency);
  if (!available.ok) return { ok: false, error: available.error };
  if (available.funded <= 0.005) {
    return {
      ok: false,
      error: `There is nothing on ${acct.name ?? "this account"} to withdraw.`,
    };
  }
  if (amount > available.funded + 0.005) {
    return {
      ok: false,
      error: `${acct.name ?? "This account"} has ${usd(
        available.funded,
      )} available — that already allows for any withdrawal still waiting on us.`,
    };
  }

  const { data, error } = await supabase.rpc("ad_account_withdrawal_request", {
    p_ad_account_id: input.ad_account_id,
    p_amount: amount,
    p_currency: accountCurrency,
    p_reason: input.reason ?? null,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, data: { id: row?.id } };
}

// ─────────────────────────────────────────
// approveAdAccountWithdrawal — admin
// Credits the advertiser wallet and marks the withdrawal approved.
// ─────────────────────────────────────────
export async function approveAdAccountWithdrawal(
  withdrawalId: string,
): Promise<ActionResult> {
  // resolveAdminContext, not maintenanceGuard alone. These actions used to
  // go straight to the RPC and lean on its own `role = 'admin'` check — and
  // NO money RPC in the schema tests is_active or status alongside the role.
  // So a deactivated admin kept every power they had, which is precisely the
  // thing deactivating them is meant to remove. This guard checks the role,
  // the tenant AND that the account is still active, and it carries the
  // maintenance freeze with it.
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof withdrawalId !== "string" || !withdrawalId) {
    return { ok: false, error: "Invalid input" };
  }
  const { supabase } = auth.ctx;

  // ── CHECKED AGAIN HERE, BECAUSE THIS IS WHERE THE MONEY MOVES ─────
  //
  // The request-side check is a courtesy to the customer; this one is
  // the guard. A request can sit for days while the account is emptied
  // by another withdrawal, and the RPC credits the wallet without
  // looking. The admin's own screen shows neither a balance nor the
  // account status, so there is nobody else in this path who could
  // notice.
  const { data: wd, error: wdErr } = await supabase
    .from("ad_account_withdrawals")
    // advertiser_id, currency and the account's name too: the customer
    // is told about this now, and a notice that cannot name the account
    // or the amount is barely a notice.
    // tenant_id too: it was NOT in this list and `wd.tenant_id` is
    // handed to notifyAdvertiser further down, so every
    // withdrawal_approved notification was written with tenant_id NULL
    // -- an orphan row in a financial-notification table. The sibling
    // rejectAdAccountWithdrawal selects it and gets it right.
    .select(
      "id, ad_account_id, advertiser_id, tenant_id, amount, currency, status, ad_account:ad_accounts(name)",
    )
    .eq("id", withdrawalId)
    .maybeSingle();
  if (wdErr) return { ok: false, error: safeErrorMessage(wdErr) };
  if (!wd) return { ok: false, error: "That withdrawal was not found." };

  const row = wd as {
    ad_account_id?: string | null;
    amount?: unknown;
    status?: unknown;
  };
  const wanted = Number(row.amount) || 0;
  const accountId = String(row.ad_account_id ?? "");
  if (accountId) {
    // The withdrawal's OWN currency, which is the account's — the same
    // one ad_account_withdrawal_approve branches on when it credits the
    // wallet. Comparing a euro amount against a dollar ceiling is how
    // this went wrong on the request side.
    const wdCurrency =
      String((row as { currency?: unknown }).currency ?? "USD")
        .trim()
        .toUpperCase() === "EUR"
        ? "EUR"
        : "USD";
    const available = await fundedUsd(supabase, accountId, wdCurrency);
    if (!available.ok) return { ok: false, error: available.error };
    // This row's own amount is inside `funded` already (it is pending),
    // so add it back before comparing — otherwise every withdrawal
    // looks like it overdraws itself.
    const withoutThis =
      String(row.status ?? "").toLowerCase() === "pending"
        ? available.funded + wanted
        : available.funded;
    if (wanted > withoutThis + 0.005) {
      return {
        ok: false,
        error: `This asks for ${usd(wanted)} and the account holds ${usd(
          Math.max(withoutThis, 0),
        )}. Approving it would credit the wallet with money that was never on the account.`,
      };
    }
  }

  const { error } = await supabase.rpc("ad_account_withdrawal_approve", {
    p_withdrawal_id: withdrawalId,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };

  // ── THE CUSTOMER ASKED FOR THIS MONEY BACK ────────────────────────
  //
  // It has just landed in their wallet and nothing told them. Until
  // now the request itself was invisible on every customer screen, so
  // the whole journey -- ask, wait, receive -- happened without a
  // single word reaching them.
  await notifyAdvertiser(supabase, {
    advertiserId: (wd as { advertiser_id?: string | null } | null)
      ?.advertiser_id,
    tenantId: (wd as { tenant_id?: string | null } | null)?.tenant_id ?? null,
    type: "withdrawal_approved",
    payload: {
      amount: (wd as { amount?: unknown } | null)?.amount ?? null,
      currency:
        (wd as { currency?: string | null } | null)?.currency ?? "USD",
      account_name:
        (wd as { ad_account?: { name?: string | null } | null } | null)
          ?.ad_account?.name ?? null,
    },
  });

  // ── AND TELL THE SUPPLIER TO TAKE IT OFF ──────────────────────────
  //
  // The wallet has just been credited. Until now nothing asked the
  // supplier to remove the same money from the ad account, so it
  // existed in both places: the customer could spend it from the wallet
  // AND the account still held it, and releasing that account back to
  // the pool handed the balance to the next customer — the release
  // guard computes funded from OUR rows, which now say zero.
  //
  // Reported rather than thrown: the money has already moved on our
  // side and refusing here would not put it back. A refusal (a manual
  // account, a currency we will not convert, the push gate closed) is
  // an instruction to the admin, not a failure of the approval.
  const pushed = await enqueueSupplierWithdrawPush(supabase, {
    withdrawalId,
    tenantId: String(auth.ctx.profile.tenant_id),
  });

  return {
    ok: true,
    data: null,
    warning: pushed.enqueued
      ? undefined
      : `The wallet is credited, but the supplier was not told to take it off the ad account: ${pushed.reason}. Do that by hand, or the money is on both.`,
  };
}

// ─────────────────────────────────────────
// rejectAdAccountWithdrawal — admin
// ─────────────────────────────────────────
export async function rejectAdAccountWithdrawal(
  withdrawalId: string,
  reason?: string,
): Promise<ActionResult> {
  // resolveAdminContext, not maintenanceGuard alone. These actions used to
  // go straight to the RPC and lean on its own `role = 'admin'` check — and
  // NO money RPC in the schema tests is_active or status alongside the role.
  // So a deactivated admin kept every power they had, which is precisely the
  // thing deactivating them is meant to remove. This guard checks the role,
  // the tenant AND that the account is still active, and it carries the
  // maintenance freeze with it.
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof withdrawalId !== "string" || !withdrawalId) {
    return { ok: false, error: "Invalid input" };
  }
  const { supabase } = auth.ctx;
  // Read it BEFORE the write, while it is still addressable: the RPC
  // returns nothing and the row's advertiser is what the notification
  // needs.
  const { data: wdRow } = await supabase
    .from("ad_account_withdrawals")
    .select(
      "advertiser_id, tenant_id, amount, currency, ad_account:ad_accounts(name)",
    )
    .eq("id", withdrawalId)
    .maybeSingle();

  const { error } = await supabase.rpc("ad_account_withdrawal_reject", {
    p_withdrawal_id: withdrawalId,
    p_reason: reason ?? null,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };

  // ── AND THE CUSTOMER IS TOLD ───────────────────────────────────────
  //
  // The approve path notifies and this one did not, so a customer who
  // asked for their money back saw nothing when it was pending and
  // nothing when it was refused -- their only withdrawal surface is
  // filtered to `approved`. They wait, then ask, and nobody can point
  // at where it says so, because it does not.
  await notifyAdvertiser(supabase, {
    advertiserId: (wdRow as { advertiser_id?: string | null } | null)
      ?.advertiser_id,
    tenantId: (wdRow as { tenant_id?: string | null } | null)?.tenant_id ?? null,
    type: "withdrawal_rejected",
    payload: {
      amount: (wdRow as { amount?: unknown } | null)?.amount ?? null,
      currency:
        (wdRow as { currency?: string | null } | null)?.currency ?? "USD",
      account_name:
        (wdRow as { ad_account?: { name?: string | null } | null } | null)
          ?.ad_account?.name ?? null,
      reason: reason ?? null,
    },
  });
  return { ok: true, data: null };
}

/**
 * The balance the PLATFORM actually holds for one ad account.
 *
 * ──────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * The withdrawal ceiling on both sides of this journey is
 * "everything we funded, minus everything already asked back". It does
 * NOT subtract what the account has SPENT, because nothing anywhere
 * read the real balance. So an account funded EUR 194 that has spent
 * EUR 150 offers EUR 194 back, and the approve guard uses the same
 * expression — it would credit the wallet with money the platform does
 * not hold.
 *
 * The owner's rule: if there is an API, read it AND the admin approves;
 * if there is no API, the admin checks it themselves and approves.
 * Either way a person signs off. This is the first half.
 *
 * ── IT REFUSES RATHER THAN INVENTS ───────────────────────────────────
 *
 * In mock mode the adapter answers with a made-up figure. Printing that
 * as "the balance at the platform" would be exactly the confident-wrong
 * -number fault this whole sweep is about, on the screen where somebody
 * releases money. So a balance is only ever returned when the supplier
 * is genuinely `live`; every other state comes back as `available:
 * false` with the reason, and the admin checks the portal.
 * ──────────────────────────────────────────────────────────────────────
 */
export async function readAdAccountLiveBalance(adAccountId: string): Promise<
  | { ok: true; data: { available: false; reason: string } }
  | {
      ok: true;
      data: { available: true; amount: number; currency: string };
    }
  | { ok: false; error: string }
> {
  const res0 = await resolveAdminContext();
  if (!res0.ok) return { ok: false, error: res0.error };
  const { supabase, profile } = res0.ctx;

  // The account has to be this tenant's before we go anywhere near the
  // supplier with its id.
  const { data: acct, error: acctError } = await supabase
    .from("ad_accounts")
    .select("id, tenant_id")
    .eq("id", adAccountId)
    .maybeSingle();
  if (acctError) return { ok: false, error: safeErrorMessage(acctError) };
  if (!acct) return { ok: false, error: "Ad account not found" };
  if (acct.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  const { supplier1Mode } = await import("@/lib/integrations/autopush");
  const mode = supplier1Mode();
  if (mode !== "live") {
    return {
      ok: true,
      data: {
        available: false,
        reason: `the supplier is in ${mode || "mock"} mode, so there is no real balance to read \u2014 check it in the portal`,
      },
    };
  }

  // Only accounts that came from the supplier pool have an id there.
  const { data: pool, error: poolError } = await supabase
    .from("supplier_ad_accounts")
    .select("external_id")
    .eq("ad_account_id", adAccountId)
    .eq("provider", "supplier1")
    .maybeSingle();
  if (poolError) return { ok: false, error: safeErrorMessage(poolError) };
  if (!pool?.external_id) {
    return {
      ok: true,
      data: {
        available: false,
        reason:
          "this account is not supplier-managed, so there is no API to ask \u2014 check the balance by hand",
      },
    };
  }

  const { getSupplier1Adapter } = await import("@/lib/integrations/supplier1");
  const res = await getSupplier1Adapter().getBalance(String(pool.external_id));
  if (!res.ok) {
    return {
      ok: true,
      data: {
        available: false,
        reason: `we could not read it just now (${res.error ?? "no reason given"}) \u2014 check the portal`,
      },
    };
  }
  return {
    ok: true,
    data: {
      available: true,
      amount: Number(res.data.balance_cents) / 100,
      currency: String(res.data.currency ?? "USD").toUpperCase(),
    },
  };
}
