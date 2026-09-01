"use server";

import { createClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
import { NOTIFICATION_CATALOG } from "@/lib/notification-catalog";
import type { NotificationType } from "@/lib/types/notification";
import type { ActionResult } from "@/actions/_shared";

const VALID_TYPES = new Set<string>(NOTIFICATION_CATALOG.map((e) => e.type));

/**
 * Self-service: set the caller's push preference for one notification
 * type. Owner-checked — the row is keyed to auth.uid() and RLS refuses
 * anything else, so a caller can only ever touch their own preferences.
 *
 * Preferences gate push DELIVERY only; the in-app notification row is
 * still written, so muting never loses a record. No maintenanceGuard:
 * this is a personal, non-financial preference and muting a ping during
 * an incident is harmless (and arguably desirable).
 */
export async function setNotificationPreference(
  type: NotificationType,
  pushEnabled: boolean,
): Promise<ActionResult> {
  if (!VALID_TYPES.has(type)) {
    return { ok: false, error: "Unknown notification type", code: "invalid" };
  }

  const supabase = await createClient();
  const { data: userData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !userData.user) {
    return { ok: false, error: "Unauthorized", code: "forbidden" };
  }

  const { error } = await supabase.from("notification_preferences").upsert(
    {
      user_id: userData.user.id,
      type,
      push_enabled: pushEnabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,type" },
  );

  if (error) {
    console.error(
      "setNotificationPreference failed:",
      safeErrorMessage(error),
    );
    return { ok: false, error: "Could not save preference. Try again." };
  }

  return { ok: true, data: null };
}
