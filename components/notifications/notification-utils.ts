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

    case "request_fee_refunded": {
      const p = notification.payload as
        | { reason?: string | null }
        | null;
      const why = String(p?.reason ?? "").trim();
      return {
        title: "Your request fee is back",
        description: why
          ? `We couldn't set this account up, so the fee is back in your wallet. ${why}`
          : "We couldn't set this account up, so the fee is back in your wallet.",
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
        } wants to join the affiliate program. Set their commission and approve or refuse it.`,
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
      const what =
        p.source === "subscription"
          ? "a subscription payment"
          : p.source === "onetime"
            ? "a new customer's first top-up"
            : "a top-up";
      return {
        title: "You earned a commission",
        description: `${figure} from ${what}${p.client_code ? ` by ${p.client_code}` : ""}.`,
      };
    }
    case "referral_commission_on_hold":
      return {
        title: "Commission on hold",
        description:
          "A referral commission could not be calculated because the supplier fee is not recorded for that ad account or its type. Set it, then recalculate it on the affiliate's page.",
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
