import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeErrorMessage } from "@/lib/pure-error";

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
  | "wallet_topup_completed"
  | "wallet_topup_rejected"
  | "topup_rejected"
  | "withdrawal_approved"
  | "withdrawal_rejected"
  | "wallet_adjusted"
  | "wallet_refunded"
  | "request_fee_refunded"
  | "ad_account_request_approved";

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
): Promise<{ ok: boolean; why?: string }> {
  try {
    if (!args.advertiserId) return { ok: false, why: "no advertiser id" };
    const { data: adv } = await supabase
      .from("advertisers")
      .select("user_id")
      .eq("id", args.advertiserId)
      .maybeSingle();
    const userId = (adv as { user_id?: string | null } | null)?.user_id;
    // A NULL user_id would write a row nobody can ever read: the select
    // policy matches on recipient_user_id and the push route skips it.
    if (!userId) {
      return { ok: false, why: "the advertiser has no sign-in behind it" };
    }

    // ── THE SERVICE ROLE WRITES IT, AND A FAILURE IS SAID OUT LOUD ──
    //
    // This inserted through whatever client the caller handed in --
    // which on the admin paths is the ADMIN's own session. A
    // notification addressed to a CUSTOMER is not the admin's row to
    // insert, and whether RLS lets them is a policy detail nobody was
    // checking: the catch below swallowed the answer.
    //
    // It cost a real one. On 20 Sep a EUR 300 wallet top-up was
    // verified, the money was credited, the customer was told nothing,
    // and there was no way to see why from outside the database --
    // the row simply was not there. The insert now runs as the service
    // role, like every SQL writer of this table already does, and a
    // failure is logged with safeErrorMessage instead of vanishing.
    const { createAdminClient } = await import("@/lib/supabase/server");
    const admin = await createAdminClient();
    const { error } = await admin.from("notifications").insert({
      recipient_user_id: userId,
      tenant_id: args.tenantId ?? null,
      type: args.type,
      payload: args.payload,
      is_read: false,
    });
    if (error) {
      const why = safeErrorMessage(error);
      console.error(
        `notifyAdvertiser(${args.type}) could not write the row:`,
        why,
      );
      return { ok: false, why };
    }
    return { ok: true };
  } catch (err) {
    // Still never throws -- the money has already moved. But it says
    // so, and now it says so to the ADMIN's screen as well as the log:
    // "credited, but the customer was not told" is exactly the thing
    // somebody has to act on, and a console line on a server nobody
    // reads is not telling anybody.
    const why = safeErrorMessage(err);
    console.error(`notifyAdvertiser(${args.type}) threw:`, why);
    return { ok: false, why };
  }
}
