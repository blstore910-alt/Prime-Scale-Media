"use server";

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import webpush from "web-push";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function subscribeUser(sub: Record<string, any>) {
  const supabase = await createClient();
  const { get: getHeader } = await headers();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: getHeader("user-agent") || "",
    },
    { onConflict: "user_id,endpoint" },
  );

  return { success: true };
}
