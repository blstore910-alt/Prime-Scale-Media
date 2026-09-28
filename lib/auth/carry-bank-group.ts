import { safeErrorMessage } from "@/lib/pure-error";

/**
 * CARRY THE INVITATION'S BANK ONTO THE NEW ADVERTISER.
 *
 * The owner, 28-09: "bij aanmelding iedereen wallet topup naar turlit
 * behalve GH mensen naar zanel". The top-up dialog derives the
 * destination from the ad accounts somebody holds; a customer who has
 * just accepted an invitation holds none, so a GH customer was sent to
 * TURLIT on their first transfer — the wrong legal entity, and nothing
 * downstream notices (wallet_topup_advertiser_create takes amount,
 * currency and slip and never learns which beneficiary was on screen).
 *
 * WHY IT IS HERE AND NOT IN create_subscription_from_invite, which
 * already reads the invitation and writes advertiser_plans on accept
 * and would be the tidier home: that RPC exists only on the live
 * database and changing it means text surgery on a live money
 * function. On 28-09 exactly that broke the Join button in production
 * for twenty minutes (plak 124 → plak 127). This is the same result
 * for two small writes and no surgery.
 *
 * IT NEVER FAILS THE SIGNUP. Both callers are past the point where the
 * account exists; refusing to finish because a routing hint could not
 * be copied would lock somebody out over a default they already had.
 * A miss leaves bank_group null, which reads as "not said", which is
 * TURLIT — what every customer gets today.
 */

type MinimalDb = {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string,
      ) => PromiseLike<{ error: { message?: string } | null }>;
    };
  };
};

const MISSING = /42703|column|schema cache|PGRST20\d/i;

export async function carryBankGroupToAdvertiser(
  admin: MinimalDb,
  args: {
    /** `invitations.bank_group`, undefined when the column is not there yet. */
    bankGroup: unknown;
    /** The new advertiser's `profile_id`. */
    profileId: string | null | undefined;
  },
): Promise<void> {
  const raw = String(args.bankGroup ?? "").trim().toLowerCase();
  // Only the two the routing knows. Anything else — including the
  // retired "muxue" — is not written, because a value the dialog does
  // not recognise reads as null anyway and storing it would only make
  // the row look decided when it is not.
  if (raw !== "turlit" && raw !== "zanel") return;
  if (!args.profileId) return;

  try {
    const { error } = await admin
      .from("advertisers")
      .update({ bank_group: raw })
      .eq("profile_id", args.profileId);
    if (error && !MISSING.test(String(error.message ?? ""))) {
      // Not thrown: see the docblock. Logged so it is findable, and
      // through safeErrorMessage because a Supabase error carries
      // details/hint/row.
      console.error(
        "could not carry bank_group to the advertiser:",
        safeErrorMessage(error),
      );
    }
  } catch (error) {
    console.error(
      "could not carry bank_group to the advertiser:",
      safeErrorMessage(error),
    );
  }
}
