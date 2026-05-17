import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PushSubscriptionBody = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

export async function POST(req: Request) {
  let sub: PushSubscriptionBody;
  try {
    sub = (await req.json()) as PushSubscriptionBody;
  } catch {
    return NextResponse.json(
      { error: "Malformed JSON body" },
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
      endpoint: sub.endpoint,
      p256dh: sub.keys?.p256dh,
      auth: sub.keys?.auth,
      user_agent: req.headers.get("user-agent"),
    },
    { onConflict: "user_id,endpoint" },
  );

  return NextResponse.json({ ok: true });
}
