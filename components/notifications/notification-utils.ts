import { Notification, NotificationType } from "@/lib/types/notification";

type NotificationPayloadObject = Record<string, unknown>;

function asObject(value: unknown): NotificationPayloadObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as NotificationPayloadObject;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : null;
}

/** "€12.40" / "$38.75" — the shape the rest of this file writes by hand. */
function money2(amount: unknown, currency: unknown): string {
  const cur = String(asString(currency) ?? "EUR").toUpperCase();
  const sym = cur === "USD" ? "$" : "€";
  const n = Number(amount);
  return Number.isFinite(n) ? `${sym}${n.toFixed(2)}` : `${sym}—`;
}

export function parseNotificationPayload(
  notification: Notification | null | undefined,
): NotificationPayloadObject {
  if (!notification) return {};

  const raw = notification.payload ?? notification.data;
  if (!raw) return {};

  if (typeof raw === "string") {
    try {
      return asObject(JSON.parse(raw));
    } catch {
      return {};
    }
  }

  return asObject(raw);
}

export function getTopupIdFromNotification(
  notification: Notification | null | undefined,
): string | null {
  const payload = parseNotificationPayload(notification);
  return asString(payload.topup_id);
}

export function getAdAccountRequestIdFromNotification(
  notification: Notification | null | undefined,
): string | null {
  const payload = parseNotificationPayload(notification);
  return asString(payload.ad_account_request_id);
}

export function getWalletTopupIdFromNotification(
  notification: Notification | null | undefined,
): string | null {
  const payload = parseNotificationPayload(notification);
  return (
    asString(payload.wallet_topup_id) ??
    asString(payload.topup_id) ??
    asString(payload.wallet_transaction_id)
  );
}

export function getNotificationCopy(notification: Notification): {
  title: string;
  description: string;
} {
  const type = notification.type as NotificationType;

  switch (type) {
    case "topup_completed":
      return {
        title: "Top-up Completed",
        description: "Your top-up has been verified successfully.",
      };
    // ── AND THE ONE WHERE THE MONEY ACTUALLY ARRIVES ───────────────
    //
    // With the figure in it. subscription_invoice carries `amount` and
    // `currency` and prints a generic sentence; this one is the money
    // landing in the customer's wallet, so it says how much.
    case "wallet_topup_completed": {
      const p = parseNotificationPayload(notification);
      const amount = asString(p.amount);
      const currency = String(asString(p.currency) ?? "EUR").toUpperCase();
      const sym = currency === "USD" ? "$" : "€";
      return {
        title: "Money is in your wallet",
        description: amount
          ? `We confirmed your transfer and credited ${sym}${Number(amount).toFixed(2)} to your ${currency} wallet.`
          : "We confirmed your transfer and credited it to your wallet.",
      };
    }
    case "wallet_topup_rejected": {
      const p = parseNotificationPayload(notification);
      const reason = asString(p.reason);
      return {
        title: "Wallet top-up refused",
        description: reason
          ? reason
          : "We could not confirm this transfer. Nothing has been credited — check the reference you used and file it again.",
      };
    }
    case "topup_created":
      return {
        title: "Top-up Requires Verification",
        description: "A new top-up request is waiting for admin approval.",
      };
    case "ad_account_request_created":
      return {
        title: "New Ad Account Request",
        description: "Review this request and create an ad account if valid.",
      };
    case "user_profile_created":
      return {
        title: "New User Profile",
        description: "A user profile was created. Click to view users.",
      };
    case "wallet_topup_created":
      return {
        title: "Wallet Top-up Request",
        description: "A wallet top-up is pending approval.",
      };
    case "topup_rejected": {
      const p = notification.payload as
        | { reason?: string | null; amount?: unknown; currency?: string | null }
        | null;
      const why = String(p?.reason ?? "").trim();
      return {
        title: "Ad-account top-up refused",
        description: why
          ? `We couldn't put this money on your ad account. ${why}`
          : "We couldn't put this money on your ad account. Your wallet is unchanged.",
      };
    }

    case "withdrawal_rejected": {
      // The type is declared, the payload carries the reason, and the
      // Settings toggle reads "Withdrawal refused -- The reason is
      // included" -- and there was no case here, so it fell to the
      // default: "New Notification / You have a new notification."
      // The customer's only other withdrawal surface is filtered to
      // `approved`, so a refusal appeared NOWHERE in the app. They ask
      // for EUR 8,000 back, we say no with a reason, and every screen
      // they own is mute.
      const p = notification.payload as
        | {
            amount?: unknown;
            currency?: string | null;
            account_name?: string | null;
            reason?: string | null;
          }
        | null;
      const where = String(p?.account_name ?? "").trim();
      const why = String(p?.reason ?? "").trim();
      return {
        title: "We couldn't make that withdrawal",
        description: [
          where
            ? `What you asked back from ${where} has not been returned.`
            : "What you asked back from your ad account has not been returned.",
          why || "Message us and we will explain.",
        ].join(" "),
      };
    }

    case "wallet_adjusted": {
      // Up or down, in their words, with our reason attached. A balance
      // that moves with no explanation is the thing that makes people
      // write in.
      const p = notification.payload as
        | { delta?: unknown; currency?: string | null; reason?: string | null }
        | null;
      const d = Number(p?.delta ?? 0);
      const cur = String(p?.currency ?? "EUR").toUpperCase();
      const sym = cur === "USD" ? "$" : "€";
      const figure = `${sym}${Math.abs(d).toFixed(2)}`;
      const why = String(p?.reason ?? "").trim();
      const lead =
        d < 0
          ? `We corrected your wallet down by ${figure}.`
          : `We corrected your wallet up by ${figure}.`;
      return {
        title: d < 0 ? "Your wallet was corrected down" : "Your wallet was corrected up",
        description: why ? `${lead} ${why}` : lead,
      };
    }
    case "wallet_refunded": {
      const p = notification.payload as
        | { amount?: unknown; currency?: string | null }
        | null;
      const cur = String(p?.currency ?? "EUR").toUpperCase();
      const sym = cur === "USD" ? "$" : "€";
      const amt = Number(p?.amount ?? 0);
      return {
        title: "Your balance is on its way to your bank",
        description: `${sym}${amt.toFixed(2)} has left your wallet and is being transferred. Bank transfers take a few working days.`,
      };
    }
    case "withdrawal_approved": {
      const p = notification.payload as
        | { amount?: unknown; currency?: string | null; account_name?: string | null }
        | null;
      const where = String(p?.account_name ?? "").trim();
      return {
        title: "Money is back in your wallet",
        description: where
          ? `What you asked back from ${where} has landed in your wallet.`
          : "What you asked back from your ad account has landed in your wallet.",
      };
    }

    case "ad_account_request_approved": {
      // WE TOLD THEM WHEN WE SAID NO AND NEVER WHEN WE SAID YES. A
      // customer paid EUR 50, waited, and the only way to find out the
      // account existed was to open /accounts and notice a new row.
      const p = notification.payload as
        | { account_name?: string | null; platform?: string | null }
        | null;
      const name = String(p?.account_name ?? "").trim();
      return {
        title: "Your ad account is ready",
        description: name
          ? `${name} is set up and you can fund it from your wallet.`
          : "The ad account you asked for is set up and you can fund it from your wallet.",
      };
    }

    case "request_fee_refunded": {
      // The same refusal, with or without money coming back. Promising a
      // refund that was never charged is worse than saying nothing.
      const p = notification.payload as
        | { reason?: string | null; amount?: number | string | null }
        | null;
      const why = String(p?.reason ?? "").trim();
      const back = Number(p?.amount ?? 0) > 0;
      const lead = back
        ? "We couldn't set this account up, so the fee is back in your wallet."
        : "We couldn't set this account up. Nothing was charged for it.";
      return {
        title: back
          ? "Your request fee is back"
          : "Your account request was refused",
        description: why ? `${lead} ${why}` : lead,
      };
    }

    case "billing_run_failed":
      return {
        title: "Billing run failed",
        description:
          "Last night's subscription billing did not complete, so nobody was invoiced or debited. It is safe to re-run — but it will not fix itself.",
      };
    case "supplier_low_balance":
      return {
        title: "Supplier balance low",
        description:
          "The ad-account supplier's spendable balance is below the threshold — top up soon.",
      };
    case "supplier_pool_changed": {
      // The scheduled pool sync builds a real summary — "2 new ad account(s)
      // in the pool · seamx-9001: active → suspended" — and this map did not
      // know the type, so every one of them rendered as the default "You have
      // a new notification." The whole point of only notifying when something
      // changed is to say WHAT changed.
      const p = (notification.payload ?? {}) as {
        summary?: string;
        new_accounts?: number;
        status_changes?: number;
      };
      const added = Number(p.new_accounts ?? 0);
      const changed = Number(p.status_changes ?? 0);
      const parts: string[] = [];
      if (added) parts.push(`${added} new`);
      if (changed) parts.push(`${changed} changed status`);
      return {
        title: parts.length
          ? `Ad account pool: ${parts.join(", ")}`
          : "Ad account pool updated",
        description:
          p.summary ||
          "The supplier's inventory changed — open the pool to see what is free to allocate.",
      };
    }
    // ── THE THREE THE CUSTOMER GETS MOST ──────────────────────────────
    //
    // This function is what the live customer shells render
    // (adv-app and aff-app both call it), and it had no case for any of
    // the billing types — so "we couldn't collect your subscription"
    // arrived as "New Notification / You have a new notification." under
    // an empty state promising that billing updates would appear here.
    // The PUSH copy for these has been right all along; the in-app copy
    // was the default.
    case "subscription_invoice":
      return {
        title: "New subscription invoice",
        description:
          "Your monthly invoice is ready. Pay it from your wallet whenever suits you — if it is still open on its due date we take it from your wallet automatically.",
      };
    // ── THE ONE THE AUTO-DEBIT NEVER SENT ──────────────────────────
    //
    // With the figure and the invoice in it, because the customer may
    // not have pressed anything: on the due date the collect loop takes
    // it by itself. "Some money left your wallet" is not a notice.
    case "subscription_invoice_paid": {
      const p = parseNotificationPayload(notification);
      const amount = asString(p.amount);
      const currency = String(asString(p.currency) ?? "EUR").toUpperCase();
      const number = asString(p.number);
      const sym = currency === "USD" ? "$" : "€";
      const what = number ? ` for invoice ${number}` : "";
      return {
        title: "Invoice paid from your wallet",
        description: amount
          ? `We took ${sym}${Number(amount).toFixed(2)} from your ${currency} wallet${what}.`
          : `Your invoice has been settled from your wallet${what}.`,
      };
    }
    case "subscription_invoice_due_soon": {
      const p = parseNotificationPayload(notification);
      const amount = asString(p.amount);
      const currency = String(asString(p.currency) ?? "EUR").toUpperCase();
      const sym = currency === "USD" ? "$" : "€";
      const due = asString((p as { due_date?: unknown }).due_date);
      return {
        title: "Your invoice is due soon",
        description: `${amount ? `${sym}${Number(amount).toFixed(2)}` : "Your invoice"} is taken from your ${currency} wallet${
          due ? ` on ${String(due).slice(0, 10)}` : " on the due date"
        }. Make sure it holds enough — or pay it now under Billing.`,
      };
    }
    case "subscription_past_due":
      return {
        title: "Subscription past due",
        description:
          "We couldn't collect your subscription from your wallet. Top up and it will be taken automatically.",
      };
    case "subscription_changed":
      return {
        title: "Subscription updated",
        description:
          "The amount on your subscription has changed. Open billing to see what is due.",
      };
    case "integration_failure": {
      // Admin-facing. The payload names the service; saying which one is
      // the entire difference between acting and ignoring it.
      const p = (notification.payload ?? {}) as { source?: string };
      const source = typeof p.source === "string" && p.source ? p.source : null;
      return {
        title: "Connection failing",
        description: source
          ? `A connection to ${source} is failing. The manual fallback still works.`
          : "A connection to an external service is failing. The manual fallback still works.",
      };
    }
    case "affiliate_application": {
      const p = parseNotificationPayload(notification) as {
        applicant_name?: string;
        client_code?: string | null;
      };
      const who = p.applicant_name || "An advertiser";
      return {
        title: "Affiliate application",
        description: `${who}${
          p.client_code ? ` (${p.client_code})` : ""
        } wants to join the affiliate program. Approve or refuse it on Affiliates.`,
      };
    }
    case "referral_commission_earned": {
      const p = parseNotificationPayload(notification) as {
        amount?: number | string;
        currency?: string;
        client_code?: string | null;
        source?: string;
      };
      const cur = String(p.currency ?? "EUR").toUpperCase();
      const sym = cur === "USD" ? "$" : "€";
      const amt = Number(p.amount);
      const figure = Number.isFinite(amt) ? `${sym}${amt.toFixed(2)}` : "a commission";
      // The welcome bonus used to hang on a first top-up only. Since it
      // also falls on a first PAID INVOICE, "a new customer's first
      // top-up" is a claim about something that may never have happened
      // -- seen on live: EUR 10.00 announced as a first top-up for a
      // customer with none, whose subscription invoice had just been
      // paid. Say what the bonus IS instead of guessing its trigger.
      const what =
        p.source === "subscription"
          ? "a subscription payment"
          : p.source === "onetime"
            ? "your welcome bonus for a new customer"
            : "a top-up";
      return {
        title: "You earned a commission",
        description: `${figure} from ${what}${p.client_code ? ` by ${p.client_code}` : ""}.`,
      };
    }
    case "referral_pending": {
      const p = parseNotificationPayload(notification) as {
        name?: string | null;
        client_code?: string | null;
        affiliate_name?: string | null;
        affiliate_code?: string | null;
      };
      const who = [p.name, p.client_code ? `(${p.client_code})` : null].filter(Boolean).join(" ") || "A new customer";
      const via = p.affiliate_name || p.affiliate_code || "an affiliate";
      return {
        title: "New referral to approve",
        description: `${who} signed up through ${via}'s link. Approve or refuse it on Affiliates — what they already did is booked when you approve.`,
      };
    }
    case "referral_joined": {
      const p = parseNotificationPayload(notification) as {
        client_code?: string | null;
        pending?: boolean | null;
      };
      return {
        title: "Someone joined through your link",
        description: `${p.client_code || "A new customer"} signed up through your link.${
          p.pending ? " We check every new referral — what they do in the meantime counts once it is approved." : ""
        }`,
      };
    }
    case "referral_approved": {
      const p = parseNotificationPayload(notification) as {
        client_code?: string | null;
        booked_eur?: number | string | null;
        booked_usd?: number | string | null;
      };
      const eur = Number(p.booked_eur);
      const usd = Number(p.booked_usd);
      const legs = [
        Number.isFinite(eur) && eur > 0 ? `€${eur.toFixed(2)}` : null,
        Number.isFinite(usd) && usd > 0 ? `$${usd.toFixed(2)}` : null,
      ].filter(Boolean);
      return {
        title: "Your referral is approved",
        description: `${p.client_code || "Your referral"} counts for you now.${
          legs.length ? ` ${legs.join(" + ")} was booked for what they already did.` : ""
        }`,
      };
    }
    case "referral_rejected": {
      const p = parseNotificationPayload(notification) as { client_code?: string | null };
      return {
        title: "About a referral",
        description: `We couldn't count ${p.client_code || "a recent sign-up"} as your referral. Message us if you think this is wrong.`,
      };
    }
    case "affiliate_upgrade_requested": {
      const p = parseNotificationPayload(notification) as {
        name?: string | null;
        client_code?: string | null;
      };
      return {
        title: "An affiliate wants to advertise too",
        description: `${p.name || "An affiliate"}${
          p.client_code ? ` (${p.client_code})` : ""
        } asked to run their own ad accounts. Approve or refuse it on Affiliates.`,
      };
    }
    case "affiliate_upgrade_approved":
      return {
        title: "You can advertise now",
        description:
          "Advertising is switched on for your account. Reload the app to open your advertiser dashboard — your referrals and earnings are all still there.",
      };
    case "affiliate_upgrade_refused": {
      const p = parseNotificationPayload(notification) as { reason?: string | null };
      return {
        title: "About advertising with us",
        description: p.reason
          ? `Not yet: ${p.reason} You can ask again whenever you like.`
          : "We couldn't switch advertising on yet. You can ask again whenever you like.",
      };
    }
    case "affiliate_payout_requested": {
      const p = parseNotificationPayload(notification) as {
        amount?: number | string | null;
        currency?: string | null;
        client_code?: string | null;
        commissions?: number | null;
      };
      const asked = money2(p.amount, p.currency);
      return {
        title: "Payout requested",
        description: `${p.client_code ? `${p.client_code} asks` : "An affiliate asks"} for ${asked}${
          p.commissions ? ` over ${p.commissions} ${p.commissions === 1 ? "commission" : "commissions"}` : ""
        }. Settle it on Affiliates.`,
      };
    }
    case "affiliate_payout_paid": {
      const p = parseNotificationPayload(notification) as {
        amount?: number | string | null;
        currency?: string | null;
        reference?: string | null;
      };
      return {
        title: "Your payout is on its way",
        description: `${money2(p.amount, p.currency)} transferred${
          p.reference ? ` · reference ${p.reference}` : ""
        }. It can take a day or two to land.`,
      };
    }
    case "affiliate_payout_rejected": {
      const p = parseNotificationPayload(notification) as {
        amount?: number | string | null;
        currency?: string | null;
        reason?: string | null;
      };
      return {
        title: "About your payout request",
        description: `${money2(p.amount, p.currency)} was not paid out: ${
          p.reason ?? "we need something from you first"
        } What you earned is still yours — ask again when it is sorted.`,
      };
    }
    case "affiliate_approved":
      return {
        title: "You're an affiliate",
        description: "Your referral link is on. Share it from Referrals — everyone who signs up through it is yours.",
      };
    case "affiliate_refused": {
      const p = parseNotificationPayload(notification) as { reason?: string | null };
      return {
        title: "About your affiliate application",
        description: p.reason
          ? `Not this time: ${p.reason} You can apply again whenever you like.`
          : "We couldn't accept your application this time. You can apply again whenever you like.",
      };
    }
    case "account_deletion_requested": {
      const p = parseNotificationPayload(notification) as {
        name?: string | null;
        client_code?: string | null;
      };
      return {
        title: "Account deletion request",
        description: `${p.name || "A customer"}${
          p.client_code ? ` (${p.client_code})` : ""
        } asked us to delete their account. Approve or decline it on their page.`,
      };
    }
    case "account_deletion_declined": {
      const p = parseNotificationPayload(notification) as { reason?: string | null };
      return {
        title: "About your deletion request",
        description: p.reason
          ? `We haven't deleted your account yet: ${p.reason}`
          : "We haven't deleted your account yet. Message us and we'll explain.",
      };
    }
    case "referral_commission_on_hold":
      return {
        title: "Commission on hold",
        description:
          "A referral commission could not be calculated because that account type has no supplier fee. Set it in Settings → Finance → Ad-account types, then press Recalculate on the affiliate's page.",
      };
    case "referral_commission_failed":
      return {
        title: "Commission not booked",
        description:
          "Booking a referral commission failed. The top-up or invoice itself went through — check the affiliate's page.",
      };
    case "rate_limit_abuse":
      return {
        title: "Suspicious activity",
        description:
          "Someone hit a rate limit on a sensitive action — check the activity log if this is unexpected.",
      };
    default:
      return {
        title: "New Notification",
        description: "You have a new notification.",
      };
  }
}
