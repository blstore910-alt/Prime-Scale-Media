"use server";

import { createClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
import { LIMITS, rateLimitCheck } from "@/lib/rate-limit";
import { resolveAdminContext, resolveUserContext } from "./_shared";
import {
  isAccountLocked,
  accountLockedReason,
} from "@/lib/pure-account-status";

type ActionResult<T = null> =
  | { ok: true; data: T }
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
  const fundedIn = (acct.currency ?? "USD").trim().toUpperCase();
  const accountCurrency = "USD";
  if (input.currency !== accountCurrency) {
    return {
      ok: false,
      error:
        fundedIn === "USD"
          ? `Money on ${acct.name ?? "this account"} is held in USD, so it comes back as USD.`
          : `${acct.name ?? "This account"} was funded in ${fundedIn}, but the balance on it is held in USD — that is what the platform spends. It comes back as USD; you can exchange it in your wallet afterwards.`,
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
  const { error } = await supabase.rpc("ad_account_withdrawal_approve", {
    p_withdrawal_id: withdrawalId,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
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
  const { error } = await supabase.rpc("ad_account_withdrawal_reject", {
    p_withdrawal_id: withdrawalId,
    p_reason: reason ?? null,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}
