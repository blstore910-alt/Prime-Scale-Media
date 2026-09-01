import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import webpush from "web-push";

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

    case "topup_completed": {
      return {
        title: "Topup completed",
        body: "Your topup has been completed.",
        url: "/top-ups",
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
    const secret = req.headers.get("x-push-secret");
    if (!secret || secret !== process.env.PUSH_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    ensureVapid();
    const supabase = getSupabaseAdmin();

    // 2) Read webhook payload
    const webhook = await req.json();
    const record = webhook?.record as NotificationRecord | undefined;
    if (!record) {
      return NextResponse.json(
        { error: "Missing record in webhook payload" },
        { status: 400 },
      );
    }

    // 3) Identify recipient user
    const userId = record.recipient_user_id;
    if (!userId) {
      return NextResponse.json({ ok: true, skipped: "no recipient_user_id" });
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
          if (code === 404 || code === 410) deadIds.push(s.id);
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
    console.error("push/notify failed:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
