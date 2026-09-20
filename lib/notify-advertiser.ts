import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────
// Tell the customer what we just did with their money
// ─────────────────────────────────────────────────────────────────────
// Not one server action and not one money RPC wrote a notification. An
// admin verifies a top-up, rejects one with a reason, approves a
// withdrawal, or refuses an ad-account request and refunds EUR 50 --
// and the customer's phone stays silent, their notification list stays
// empty, and the only way they learn is by opening the app and
// comparing a balance to what they remember.
//
// The `topup_completed` type has existed the whole time: a full receipt
// dialog, a push case, a catalogue entry and a customer toggle. Nothing
// wrote it.
//
// BEST EFFORT, ALWAYS. A notification that cannot be written must never
// fail the thing it is about: the money has already moved, and an
// action that reports failure after a successful debit is far worse
// than a customer who was not told. Every call is wrapped and returns
// void.
// ─────────────────────────────────────────────────────────────────────

export type AdvertiserNotice =
  | "topup_completed"
  | "topup_rejected"
  | "withdrawal_approved"
  | "withdrawal_rejected"
  | "request_fee_refunded";

/**
 * Resolve the person behind an advertiser id and write them one row.
 *
 * `advertisers.user_id` is the auth user; the notification is keyed on
 * it because that is what the reader filters by and what the push route
 * looks up subscriptions with.
 */
export async function notifyAdvertiser(
  supabase: SupabaseClient,
  args: {
    advertiserId: string | null | undefined;
    tenantId: string | null | undefined;
    type: AdvertiserNotice;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  try {
    if (!args.advertiserId) return;
    const { data: adv } = await supabase
      .from("advertisers")
      .select("user_id")
      .eq("id", args.advertiserId)
      .maybeSingle();
    const userId = (adv as { user_id?: string | null } | null)?.user_id;
    // A NULL user_id would write a row nobody can ever read: the select
    // policy matches on recipient_user_id and the push route skips it.
    if (!userId) return;

    await supabase.from("notifications").insert({
      recipient_user_id: userId,
      tenant_id: args.tenantId ?? null,
      type: args.type,
      payload: args.payload,
      is_read: false,
    });
  } catch {
    // Deliberately silent. See the header.
  }
}
