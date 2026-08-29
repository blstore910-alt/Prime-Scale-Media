import { NextResponse } from "next/server";
import { callerIp, LIMITS, rateLimitCheck } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PushSubscriptionBody = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

// Bounds on the Web Push subscription payload — the browser produces values
// well inside these limits, so anything larger is a malformed / DoS attempt.
const MAX_ENDPOINT = 2048;
const MAX_KEY = 512;
const MAX_UA = 512;

function isValidHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const allowed = await rateLimitCheck(
    LIMITS.pushSubscribe,
    `ip:${callerIp(req)}`,
  );
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let sub: PushSubscriptionBody;
  try {
    sub = (await req.json()) as PushSubscriptionBody;
  } catch {
    return NextResponse.json(
      { error: "Malformed JSON body" },
      { status: 400 },
    );
  }

  const endpoint = sub.endpoint;
  const p256dh = sub.keys?.p256dh;
  const auth = sub.keys?.auth;

  if (
    typeof endpoint !== "string" ||
    endpoint.length === 0 ||
    endpoint.length > MAX_ENDPOINT ||
    !isValidHttpsUrl(endpoint)
  ) {
    return NextResponse.json(
      { error: "Invalid endpoint" },
      { status: 400 },
    );
  }
  if (
    typeof p256dh !== "string" ||
    p256dh.length === 0 ||
    p256dh.length > MAX_KEY ||
    typeof auth !== "string" ||
    auth.length === 0 ||
    auth.length > MAX_KEY
  ) {
    return NextResponse.json(
      { error: "Invalid subscription keys" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Optional: find advertiser_id for this user
  const { data: adv } = await supabase
    .from("advertisers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      advertiser_id: adv?.id ?? null,
      endpoint,
      p256dh,
      auth,
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, MAX_UA),
    },
    { onConflict: "user_id,endpoint" },
  );

  return NextResponse.json({ ok: true });
}
