import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { safeErrorMessage } from "@/lib/pure-error";
import { sendBillingEmail } from "@/lib/billing-emails";
import { BILLING_EMAIL_TYPES } from "@/lib/pure-billing-email";

export const runtime = "nodejs";

// Lazy-init: touching env at module scope makes Next.js's
// page-data collection step fail during `next build` when the
// env vars aren't populated (e.g. local build without a .env).
let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    throw new Error("VAPID env vars missing");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidReady = true;
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

type NotificationRecord = {
  id: string;
  type: string | null;
  recipient_user_id: string | null;
  tenant_id: string | null;
  actor_user_id: string | null;
  payload: Record<string, string>;
};



function buildPushFromRecord(record: NotificationRecord) {
  switch (record.type) {
    case "topup_created": {
      return {
        title: "Topup requested",
        body: "A new topup request was created.",
        url: "/top-ups",
      };
    }

    // ── A CUSTOMER'S NOTIFICATION MUST LAND ON A CUSTOMER'S SCREEN ────
    //
    // topup_completed is audience "customer" in lib/notification-catalog,
    // and /top-ups calls requireAdmin("/dashboard"). So the person whose
    // money had just been credited tapped "Your topup has been completed"
    // on their phone, was bounced to /dashboard, and never saw the top-up
    // they were told about. The three subscription types below already do
    // this correctly; this one kept the admin route.
    case "topup_completed": {
      return {
        title: "Topup completed",
        body: "Your topup has been completed.",
        url: "/dashboard?view=wallet",
      };
    }
    // The money landing in the wallet — with the figure, because this
    // is the one push where "how much" is the whole message.
    case "wallet_topup_completed": {
      const amt = record.payload?.amount;
      const cur = String(record.payload?.currency ?? "EUR").toUpperCase();
      const sym = cur === "USD" ? "$" : "€";
      const n = Number(amt);
      return {
        title: "Money is in your wallet",
        body: Number.isFinite(n) && n > 0
          ? `We confirmed your transfer and credited ${sym}${n.toFixed(2)}.`
          : "We confirmed your transfer and credited it to your wallet.",
        url: "/dashboard?view=wallet",
      };
    }
    case "wallet_topup_rejected": {
      const why = record.payload?.reason;
      return {
        title: "Wallet top-up refused",
        body:
          typeof why === "string" && why.trim()
            ? why.trim().slice(0, 160)
            : "We could not confirm this transfer. Nothing has been credited.",
        url: "/dashboard?view=wallet",
      };
    }

    case "wallet_topup_created": {
      return {
        title: "Wallet topup requested",
        body: "A wallet topup was requested.",
        url: "/wallet-topups",
      };
    }

    case "ad_account_request_created": {
      return {
        title: "Ad account request received",
        body: "A new ad account request is received.",
        url: "/ad-account-requests",
      };
    }

    case "user_profile_created": {
      return {
        title: "User Signup",
        body: "A new user was signed up",
        url: "/users",
      };
    }

    case "integration_failure": {
      const source = record.payload?.source || "an external service";
      return {
        title: "Integration issue",
        body: `A connection to ${source} is failing. Manual fallback is available.`,
        url: "/dashboard",
      };
    }

    // /my-subscription is a redirect to the single-page app, which now
    // accepts ?view= — so these land on BILLING instead of dropping the
    // customer on the dashboard to find it themselves.
    case "subscription_invoice": {
      return {
        title: "New subscription invoice",
        // Says what will happen if they do nothing. "Pay from your
        // wallet" reads as optional, and seven days later the nightly
        // run takes it whether they acted or not.
        body:
          "Your monthly subscription invoice is ready. We take it from your wallet on the due date if it is still open.",
        url: "/dashboard?view=billing",
      };
    }

    case "subscription_invoice_due_soon": {
      return {
        title: "Your invoice is due soon",
        body: "We take it from your wallet on the due date. Make sure it holds enough — or pay it now.",
        url: "/dashboard?view=billing",
      };
    }

    case "subscription_past_due": {
      return {
        title: "Subscription past due",
        body: "We couldn't collect your subscription. Please top up your wallet.",
        url: "/dashboard?view=billing",
      };
    }

    case "subscription_changed": {
      return {
        title: "Subscription updated",
        body: "Your subscription amount has been changed.",
        url: "/dashboard?view=billing",
      };
    }

    // These two were falling through to "You have a new notification." —
    // so the two alerts that matter most, the supplier running out of money
    // and someone hammering a financial endpoint, arrived on a phone giving
    // no reason to open the app.
    case "supplier_low_balance": {
      // `available`, not `balance`. The insert writes
      // { currency, available, threshold } and this read a key nothing
      // writes, so it always took the generic branch — which is the
      // branch the comment above claims was fixed. The figure is the
      // whole point of the alert.
      const bal = record.payload?.available ?? record.payload?.balance;
      const cur = record.payload?.currency;
      return {
        title: "Supplier balance is low",
        body:
          bal != null
            ? `The supplier's spendable balance is down to ${cur ? `${cur} ` : ""}${bal}. Top-ups may start failing.`
            : "The supplier's spendable balance is below the safety threshold. Top-ups may start failing.",
        url: "/settings/integrations",
      };
    }

    case "rate_limit_abuse": {
      // `summary`, not `action`. The insert writes { buckets, summary }
      // and this read a key nothing writes, so it always fell to the
      // generic sentence — again, the one the comment above says was
      // fixed. The summary names which kind of endpoint is being hit.
      const what = record.payload?.summary ?? record.payload?.action;
      return {
        title: "Suspicious activity",
        body: what
          ? `Someone is hitting a rate limit — ${what}. Worth a look.`
          : "Someone is hitting a rate limit on a sensitive action. Worth a look.",
        // There is no /system-status route — the rate-limit view lives in
        // the System section at the bottom of the admin dashboard.
        url: "/dashboard",
      };
    }

    case "topup_rejected":
      return {
        title: "Ad-account top-up refused",
        body:
          String(
            (record.payload as { reason?: string } | null)?.reason ?? "",
          ).trim() ||
          "We couldn't put this money on your ad account. Open the app for the reason.",
        url: "/dashboard?view=accounts",
      };

    case "withdrawal_rejected":
      return {
        title: "We couldn't make that withdrawal",
        body: "Open it to see why.",
        url: "/dashboard?view=notif",
      };

    case "withdrawal_approved":
      return {
        title: "Money is back in your wallet",
        body: "What you asked back from your ad account has landed.",
        url: "/dashboard?view=wallet",
      };

    case "request_fee_refunded":
      return {
        title: "Your request fee is back",
        body: "We couldn't set that account up, so the fee has been returned to your wallet.",
        url: "/dashboard?view=wallet",
      };

    case "billing_run_failed":
      // ── THE ONE THAT MEANS NOBODY WAS BILLED ────────────────────
      //
      // This fell through to "You have a new notification." -- and the
      // push is the part that arrives at 03:00 and is the entire
      // reason the alarm exists. A run that fails every night for a
      // week produced seven identical meaningless buzzes.
      return {
        title: "Billing did not run",
        body: "Last night's subscription billing failed, so nobody was invoiced or debited. It will not fix itself.",
        url: "/subscriptions",
      };

    case "affiliate_application":
      return {
        title: "Someone wants to join the affiliate programme",
        body: "Approve or refuse it on Affiliates.",
        url: "/affiliates",
      };

    case "referral_pending":
      return {
        title: "A new referral to approve",
        body: "Somebody signed up through an affiliate's link.",
        url: "/affiliates",
      };

    case "referral_joined":
      return {
        title: "Someone joined through your link",
        body: "A new customer signed up through your referral link.",
        url: "/dashboard?view=referrals",
      };

    case "referral_approved":
      return {
        title: "Your referral is approved",
        body: "They count for you now — open Referrals to see what was booked.",
        url: "/dashboard?view=referrals",
      };

    case "referral_rejected":
      return {
        title: "About a referral",
        body: "Open the app to read more.",
        url: "/dashboard?view=notif",
      };

    case "affiliate_approved":
      return {
        title: "You're an affiliate",
        body: "Your referral link is on. Share it from Referrals.",
        url: "/dashboard?view=referrals",
      };

    case "affiliate_upgrade_requested":
      return {
        title: "An affiliate wants to advertise too",
        body: "Approve or refuse it on Affiliates.",
        url: "/affiliates",
      };

    case "affiliate_upgrade_approved":
      return {
        title: "You can advertise now",
        body: "Open the app — your advertiser dashboard is ready.",
        url: "/dashboard",
      };

    case "affiliate_upgrade_refused":
      return {
        title: "About advertising with us",
        body: "Open the app to read our answer.",
        url: "/dashboard?view=notif",
      };

    case "affiliate_refused":
      return {
        title: "About your affiliate application",
        body: "Open the app to read our answer.",
        url: "/dashboard?view=notif",
      };

    case "account_deletion_requested":
      return {
        title: "A customer asked to delete their account",
        body: "Approve or decline it on their page.",
        url: "/users",
      };

    case "account_deletion_declined":
      return {
        title: "About your deletion request",
        body: "We answered your request — open the app to read why.",
        url: "/dashboard?view=notif",
      };

    case "referral_commission_earned":
      return {
        title: "You earned a commission",
        body: "Somebody you referred just earned you a commission.",
        url: "/dashboard?view=referrals",
      };

    case "referral_commission_on_hold":
      return {
        title: "A commission is on hold",
        body: "That account type has no supplier fee in Settings. Set it, then recalculate.",
        url: "/affiliates",
      };

    case "referral_commission_failed":
      return {
        title: "A commission was not booked",
        body: "The top-up or invoice went through; the commission needs a look.",
        url: "/affiliates",
      };

    case "supplier_pool_changed":
      return {
        title: "The ad-account pool changed",
        body: "New accounts or status changes came in from the supplier.",
        url: "/account-pool",
      };

    default:
      return {
        title: "New notification",
        body: "You have a new notification.",
        url: "/",
      };
  }
}

export async function POST(req: Request) {
  try {
    // 1) Verify Supabase webhook secret
    // ── CONSTANT TIME, LIKE THE OTHER TWO ─────────────────────────
    //
    // A plain `!==` on a secret leaks its length and, character by
    // character, its contents to anyone who can measure. This route is
    // in publicRoutes, runs with the SERVICE ROLE, and past this gate
    // takes recipient_user_id straight from the body — so it can read
    // and delete any user's push subscriptions. lib/cron-auth.ts and the
    // Wise webhook both use timingSafeEqual; this was the one that did
    // not.
    const secret = req.headers.get("x-push-secret") ?? "";
    const expected = process.env.PUSH_WEBHOOK_SECRET ?? "";
    // A missing secret means CLOSED, never open.
    const a = Buffer.from(secret);
    const b = Buffer.from(expected);
    const secretOk =
      expected.length > 0 && a.length === b.length && timingSafeEqual(a, b);
    if (!secretOk) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    ensureVapid();
    const supabase = getSupabaseAdmin();

    // 2) Read webhook payload
    const webhook = await req.json();
    const posted = webhook?.record as NotificationRecord | undefined;
    if (!posted) {
      return NextResponse.json(
        { error: "Missing record in webhook payload" },
        { status: 400 },
      );
    }

    // ── THE BODY NAMES A ROW; THE ROW IS THE TRUTH ───────────────────
    //
    // This took the recipient, the type AND the payload straight from
    // the request and never verified that the row exists. Three push
    // branches interpolate payload text into the notification body, and
    // the service worker renders it verbatim — so anyone holding the
    // shared secret could send any sentence to any named user's phone,
    // PSM-branded, opening the real app. The RUNBOOK documents that
    // exact curl as a test.
    //
    // The webhook fires on an INSERT, so the row is there. Re-read it
    // by id and use what the database holds; the body is only allowed
    // to say WHICH row.
    if (!posted.id) {
      return NextResponse.json({ ok: true, skipped: "no record id" });
    }
    const { data: stored, error: storedError } = await supabase
      .from("notifications")
      .select("id, recipient_user_id, tenant_id, type, payload, is_read")
      .eq("id", posted.id)
      .maybeSingle();
    if (storedError) {
      // 500 so the webhook retries -- but say so on the way out, because
      // the notification row exists, the phone is never buzzed, and
      // nothing anywhere else in the app would ever mention it.
      console.warn(
        "[push] could not re-read notification",
        posted.id,
        safeErrorMessage(storedError),
      );
      return NextResponse.json(
        { error: "Could not read the notification" },
        { status: 500 },
      );
    }
    if (!stored) {
      // A body naming a row that does not exist is either a race the
      // webhook will retry, or someone guessing. Neither gets a push.
      return NextResponse.json({ ok: true, skipped: "no such notification" });
    }
    const record = stored as unknown as NotificationRecord;

    // 3) Identify recipient user
    const userId = record.recipient_user_id;
    if (!userId) {
      return NextResponse.json({ ok: true, skipped: "no recipient_user_id" });
    }

    // 3a-bis) ── DO NOT PUSH TO SOMEBODY WHO HAS BEEN SWITCHED OFF ────
    //
    // Deactivation and the GDPR erasure request both set is_active =
    // false (and status pending_erasure), and neither touches
    // push_subscriptions — so a customer whose account was closed, or
    // who had asked to be erased, went on receiving notifications on
    // their phone. This is the last delivery point, so it is the right
    // place to ask.
    {
      // ── EVERY PROFILE, NOT WHICHEVER ONE POSTGRES PICKED ──────────
      //
      // One auth user legitimately holds SEVERAL user_profiles rows --
      // that is what the profile_id cookie and switchToProfile exist
      // for. `.limit(1)` with no ORDER BY returned an arbitrary one, so
      // somebody who is an active advertiser in tenant A and a
      // deactivated ex-admin in tenant B had their real alerts dropped
      // on whichever run happened to return the tenant-B row. Silent,
      // and non-deterministic in both directions.
      //
      // Switched off EVERYWHERE is switched off. One live seat is
      // enough to be told.
      const { data: recipient } = await supabase
        .from("user_profiles")
        .select("is_active, status")
        .eq("user_id", userId);
      const seats = (recipient ?? []) as Array<{
        is_active?: boolean | null;
        status?: string | null;
      }>;
      const anyLive = seats.some(
        (p) =>
          p.is_active !== false &&
          (p.status ?? "active") !== "inactive" &&
          (p.status ?? "") !== "pending_erasure",
      );
      if (seats.length > 0 && !anyLive) {
        return NextResponse.json({ ok: true, skipped: "recipient inactive" });
      }
    }

    // 3a-ter) ── A BILLING NOTICE IS ALSO AN EMAIL ──────────────────
    // New invoice, due soon, not collected: the owner wants these in the
    // inbox too, so nobody learns about a debit from their bank. Sent at
    // most once per notification (lib/billing-emails.ts), and never the
    // reason this webhook fails -- the push below still goes out.
    if (record.type && BILLING_EMAIL_TYPES.has(record.type)) {
      try {
        const outcome = await sendBillingEmail(supabase, {
          id: record.id,
          recipient_user_id: record.recipient_user_id,
          tenant_id: record.tenant_id,
          type: record.type,
          payload: record.payload,
        });
        if (outcome !== "sent") console.info("[billing-email]", record.id, outcome);
      } catch (e) {
        console.warn("[billing-email] failed", record.id, safeErrorMessage(e));
      }
    }

    // 3b) Respect the recipient's per-type push preference. Absence of a
    // row means enabled (opt-out model), so we only skip on an explicit
    // push_enabled=false. The in-app notification row already exists —
    // this gate is purely about whether we ping the device.
    if (record.type) {
      const { data: pref } = await supabase
        .from("notification_preferences")
        .select("push_enabled")
        .eq("user_id", userId)
        .eq("type", record.type)
        .maybeSingle();
      if (pref && pref.push_enabled === false) {
        return NextResponse.json({ ok: true, skipped: "muted by preference" });
      }
    }

    // 4) Fetch subscriptions for that user
    const { data: subs, error: subsErr } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);

    if (subsErr) {
      return NextResponse.json({ error: subsErr.message }, { status: 500 });
    }
    if (!subs?.length) {
      return NextResponse.json({ ok: true, skipped: "no subscriptions" });
    }

    // 5) Build push payload based on type/payload
    const push = buildPushFromRecord(record);
    const pushPayload = JSON.stringify({
      title: push.title,
      body: push.body,
      url: push.url,
      notification_id: record.id,
      type: record.type,
    });

    // 6) Send and clean dead subs
    const deadIds: string[] = [];
    let sent = 0;

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            pushPayload,
          );
          sent += 1;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
          const code = err?.statusCode;
          // ── 403 IS DEAD TOO ─────────────────────────────────────
          //
          // 404 and 410 mean "this endpoint is gone". 403 is what a
          // push service answers when the VAPID key pair no longer
          // matches the one the subscription was created with -- which
          // is every existing subscription, the moment those keys are
          // rotated. Keeping those rows meant retrying each of them on
          // every notification, for ever, with no failure counter and
          // nothing that could ever reap them.
          //
          // A subscription we are not allowed to push to is not a
          // subscription. The device re-subscribes on its next visit.
          if (code === 404 || code === 410 || code === 403) {
            deadIds.push(s.id);
          }
          else
            console.error("Push send error:", { code, message: err?.message });
        }
      }),
    );

    if (deadIds.length) {
      await supabase.from("push_subscriptions").delete().in("id", deadIds);
    }

    return NextResponse.json({ ok: true, sent, cleaned: deadIds.length });
  } catch (e) {
    console.error("push/notify failed:", safeErrorMessage(e));
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
