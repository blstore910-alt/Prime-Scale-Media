import {
  createClient as createSupabaseClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { safeErrorMessage } from "@/lib/pure-error";

// ── FINISHING A SELF-SIGNUP: PROFILE, ADVERTISER, WALLET, REFERRAL ──────
//
// This lived inside /auth/confirm and ran ONLY when the confirmation link
// arrived with a usable code. When it did not -- a mail scanner that
// opened the link first, a second click, the link opened in another
// browser -- Supabase had already confirmed the address, the person could
// sign in, and nothing had made their profile, wallet or referral. Signing
// in then sent them to "create an organisation": a dead end, and the
// affiliate who brought them never got the referral.
//
// So it is one function with three callers: /auth/confirm, the sign-in
// action, and /onboard. Whichever runs first finishes the account; each
// piece is written at most once, so running it twice is harmless.
//
// Uses the SERVICE key: server code only.

export type FinalizeResult = { ok: true; path: string } | { ok: false; error: string };

type ReferralProfileShape =
  | { status?: string | null; full_name?: string | null; role?: string | null }
  | null
  | undefined;
export type ConfirmedUser = Pick<User, "id" | "email" | "user_metadata">;

function getReferralStatus(profile: ReferralProfileShape): string | null {
  if (Array.isArray(profile)) {
    return profile[0]?.status ?? null;
  }
  return profile?.status ?? null;
}


function getStringMetadataValue(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** What the app's own sign-up form recorded on the user. */
export function signupMetadata(user: Pick<User, "user_metadata">): {
  tenantSlug: string | null;
  referralCode: string | null;
} {
  const metadata = (user.user_metadata as Record<string, unknown> | null) ?? {};
  const code = getStringMetadataValue(metadata, "referral_code");
  return {
    tenantSlug: getStringMetadataValue(metadata, "tenant_slug"),
    referralCode: code ? code.toUpperCase() : null,
  };
}

type AdminClient = SupabaseClient;

type ReferrerRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  affiliate_status?: string | null;
  profile: ReferralProfileShape;
};

// ── WHO A REFERRAL CODE BELONGS TO ────────────────────────────────────
//
// Client codes are numbered per tenant, so the SAME code exists in every
// tenant. The lookup had no tenant filter and used maybeSingle(), which
// ERRORS on two rows -- and that error was sent to /auth/error, so a
// referral link could stop working the day a second tenant got its
// PSM0005.
//
// Only somebody the owner approved as an affiliate can refer (plak 42).
// Before that column exists everyone falls back to the old rule, and an
// explicitly switched-off profile never refers.
/**
 * Why a referral code did not produce a referrer.
 *
 * Four different facts used to come back as one `null`, and the
 * difference matters: "unknown" is somebody mistyping a code, while
 * "unreadable" is us losing an affiliate's income to a network blip.
 */
type ReferrerLookup =
  | { outcome: "ok"; row: ReferrerRow }
  | {
      outcome: "unreadable" | "unknown" | "not-an-affiliate" | "inactive";
      reason: string;
    };

/**
 * The lookup, plus the shouting.
 *
 * Signup never stops for a referral problem — a code we cannot place is
 * not a reason to refuse somebody an account. But "we could not read
 * it" costs an affiliate every future commission on that customer and
 * cannot be repaired later (the retry path refuses to attach a referral
 * once the wallet exists), so it must not leave the building silently.
 *
 * `unknown` is logged at a lower key than the rest: a mistyped or made-up
 * code is a visitor's doing, not ours.
 */
async function resolveReferrer(
  admin: AdminClient,
  tenantId: string,
  code: string,
): Promise<ReferrerRow | null> {
  const found = await findReferrer(admin, tenantId, code);
  if (found.outcome === "ok") return found.row;
  const line = `referral ${code} not applied (${found.outcome}): ${found.reason}`;
  if (found.outcome === "unreadable") {
    // The one case that is OUR fault and costs somebody money.
    console.error(`LOST REFERRAL — ${line}`);
  } else {
    console.warn(line);
  }
  return null;
}

async function findReferrer(
  admin: AdminClient,
  tenantId: string,
  code: string,
): Promise<ReferrerLookup> {
  // NOT "*". `advertisers` carries affiliate_status, startup_fee and the
  // client code, and this row is one careless return away from a
  // response. Name what is used.
  const { data, error } = await admin
    .from("advertisers")
    .select(
      "id, tenant_id, user_id, affiliate_status, profile:user_profiles(status, full_name, role, is_active)",
    )
    .eq("tenant_id", tenantId)
    .eq("tenant_client_code", code)
    .limit(1);

  // ── A READ WE COULD NOT MAKE IS NOT AN UNKNOWN CODE ──────────────
  //
  // `if (error || !data?.[0]) return null` collapsed two completely
  // different facts into one: "PSM0015 does not exist" and "we could
  // not ask". A transient PostgREST error, a schema-cache miss or a
  // statement timeout on this single read produced NO REFERRAL — and
  // it is permanent, because the retry path refuses to attach one once
  // the wallet exists. The affiliate loses every future commission on
  // that customer and nobody is told.
  //
  // The distinction is returned to the caller so signup still goes
  // ahead — never a reason to stop somebody joining — while the loss
  // is shouted about instead of swallowed.
  if (error) {
    return { outcome: "unreadable", reason: safeErrorMessage(error) };
  }
  if (!data?.[0]) {
    return { outcome: "unknown", reason: `no advertiser holds code ${code}` };
  }

  const row = data[0] as unknown as ReferrerRow;
  // Somebody invited AS an affiliate was approved by being invited.
  const prof = Array.isArray(row.profile) ? row.profile[0] : row.profile;
  const invitedAffiliate = String(prof?.role ?? "").toLowerCase() === "affiliate";
  if (
    "affiliate_status" in row &&
    row.affiliate_status !== "approved" &&
    !invitedAffiliate
  ) {
    // `applied` is the expensive one: an advertiser has asked to become
    // an affiliate and the owner has not answered yet. Approving does
    // NOT back-fill the signups that arrived in the meantime, so every
    // referral in that window is lost for good. Named separately so the
    // log says which it was.
    return {
      outcome: "not-an-affiliate",
      reason: `affiliate_status is ${row.affiliate_status ?? "not set"}`,
    };
  }

  // ── BOTH LEGS, LIKE EVERY OTHER GUARD IN THIS APP ────────────────
  //
  // This tested `status` alone. `is_active` is the flag the admin UI
  // actually flips, so an affiliate who had been switched off kept
  // earning commission on new signups. company-actions.ts and every
  // resolve* helper test the pair; this one did not.
  const status = getReferralStatus(row.profile);
  const activeFlag = (prof as { is_active?: boolean | null } | null)?.is_active;
  if ((status ?? "active").toLowerCase() === "inactive" || activeFlag === false) {
    return { outcome: "inactive", reason: "that affiliate is switched off" };
  }
  return { outcome: "ok", row };
}

// ── THE WALLET AND THE REFERRAL, EACH AT MOST ONCE ─────────────────────
//
// Both used to be inserted unconditionally, and a failure on either sent
// the new customer to /auth/error AFTER their profile existed -- and on
// the retry the "already a customer" escape skipped straight to the
// dashboard, so a referral that failed the first time was never written
// at all. Now each is looked up first and only added when missing, and
// the retry path runs this too.
async function ensureWalletAndReferral(
  admin: AdminClient,
  params: {
    tenantId: string;
    advertiser: { id: string; user_id: string };
    referrer: ReferrerRow | null;
  },
): Promise<string | null> {
  const { tenantId, advertiser, referrer } = params;

  const { data: wallets, error: walletReadError } = await admin
    .from("wallets")
    .select("id")
    .eq("advertiser_id", advertiser.id)
    .limit(1);
  if (walletReadError) return safeErrorMessage(walletReadError);
  const walletExisted = !!wallets?.length;
  if (!walletExisted) {
    const generatedRef = `${Date.now().toString().slice(-6)}${Math.floor(
      1000 + Math.random() * 9000,
    )}`;
    const { error: walletError } = await admin.from("wallets").insert({
      advertiser_id: advertiser.id,
      tenant_id: tenantId,
      reference_no: generatedRef,
    });
    // 23505: another request made it a moment ago. That is the goal.
    if (walletError && walletError.code !== "23505") {
      return safeErrorMessage(walletError);
    }
  }

  if (!referrer || referrer.id === advertiser.id) return null;

  // ── A FINISHED ACCOUNT DOES NOT GAIN A REFERRER ───────────────────
  //
  // The retry branch in finalizeSignup calls this for a user who ALREADY
  // has a profile, with the code out of their own user_metadata -- and
  // user_metadata is writable by the user: auth.updateUser({ data: {...} })
  // takes any key. So a customer of six months could set
  // referral_code to an affiliate's code, ask for a fresh confirmation
  // mail (type=email is in the signup family), press the link, and land a
  // referral link on themselves pointing at whichever affiliate they
  // chose. It is created `pending`, so the owner's approval stands
  // between it and any money -- but approving books every commission the
  // customer earned in the meantime, so what it really does is put a
  // false claim in the admin queue looking exactly like a true one.
  //
  // The retry exists for a signup that stopped HALF WAY, and a signup
  // that got as far as the wallet did not stop before the referral. So
  // the referral is only written on the pass that also created the
  // wallet. The genuine first-time flow creates both here, one after the
  // other, and is unaffected.
  //
  // What this newly refuses: profile written, wallet written, referral
  // insert failed. Narrow, and recoverable by an admin rather than by an
  // address bar -- so it says so in the log instead of passing quietly.
  if (walletExisted) {
    console.error(
      "finalize-signup: referral not attached to an account that was already set up",
      { advertiser: advertiser.id, referrer: referrer.id },
    );
    return null;
  }

  const { data: links, error: linkReadError } = await admin
    .from("referral_links")
    .select("id")
    .eq("referred_advertiser_id", advertiser.id)
    .limit(1);
  if (linkReadError) return safeErrorMessage(linkReadError);
  if (links?.length) return null;

  // Pending: the owner approves every self-signup referral, and approving
  // books what the customer did in the meantime (plak 42). The old
  // commission_* copies are not written any more -- what an affiliate
  // earns comes from the commission rules, not from the link.
  const { error: linkError } = await admin.from("referral_links").insert({
    tenant_id: tenantId,
    referred_advertiser_id: advertiser.id,
    affiliate_advertiser_id: referrer.id,
    affiliate_user_id: referrer.user_id,
    advertiser_user_id: advertiser.user_id,
    status: "pending",
  });
  if (linkError && linkError.code !== "23505") {
    return safeErrorMessage(linkError);
  }
  return null;
}

export async function finalizeSignup(params: {
  user: ConfirmedUser;
  tenantSlug: string | null;
  referralCode: string | null;
  /** Only the code the user's own sign-up recorded. A retry never takes
   *  one from the address bar: that would let an existing customer name
   *  a referrer for themselves by adding ?ref= to a sign-in link. */
  signupReferralCode: string | null;
}): Promise<FinalizeResult> {
  const { user, tenantSlug, referralCode, signupReferralCode } = params;
  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  // ── ALREADY A CUSTOMER? THEN THERE IS NOTHING TO FINALISE ─────────
  //
  // This sat BELOW the tenant-slug requirement, so an existing customer
  // confirming anything at all -- and every user minted by
  // auth.admin.createUser carries no tenant_slug metadata, which is
  // every invited customer and every admin -- was sent to
  // /auth/error?error=Missing tenant slug and told to ask for a fresh
  // invite. The escape has to come first.
  //
  // .limit(1) rather than .maybeSingle(): this app supports the same
  // email in two tenants -- lib/active-profile exists for that -- and
  // maybeSingle() ERRORS on two rows. The raw message then went into
  // redirectWithError and the allowlist on /auth/error rendered it as
  // "An unspecified error occurred."
  const { data: existingProfiles, error: profileLookupError } = await admin
    .from("user_profiles")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);
  if (profileLookupError) {
    return { ok: false, error: safeErrorMessage(profileLookupError) };
  }
  if (existingProfiles?.[0]?.id) {
    // A second press on the link, or a retry after a first attempt that
    // stopped half-way: finish what is missing, never block on it.
    if (tenantSlug) {
      try {
        const { data: t } = await admin
          .from("tenants")
          .select("id")
          .eq("slug", tenantSlug)
          .maybeSingle();
        const tenantRow = t as { id: string } | null;
        if (tenantRow?.id) {
          const { data: advRows } = await admin
            .from("advertisers")
            .select("id, user_id")
            .eq("user_id", user.id)
            .eq("tenant_id", tenantRow.id)
            .limit(1);
          const adv = (advRows?.[0] ?? null) as { id: string; user_id: string } | null;
          if (adv) {
            const referrer = signupReferralCode
              ? await resolveReferrer(admin, tenantRow.id, signupReferralCode)
              : null;
            const problem = await ensureWalletAndReferral(admin, {
              tenantId: tenantRow.id,
              advertiser: adv,
              referrer,
            });
            if (problem) console.error("confirm retry could not finish:", problem);
          }
        }
      } catch (e) {
        console.error("confirm retry could not finish:", safeErrorMessage(e));
      }
    }
    return { ok: true, path: "/dashboard" };
  }

  if (!tenantSlug) {
    return { ok: false, error: "Missing tenant slug" };
  }

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("*")
    .eq("slug", tenantSlug)
    .maybeSingle();
  if (tenantError || !tenant) {
    return { ok: false, error: "Malformed request" };
  }

  // A code we cannot place is simply no referral -- never a reason to
  // stop somebody signing up.
  const referralAdvertiser = referralCode
    ? await resolveReferrer(admin, tenant.id, referralCode)
    : null;

  const fullName =
    user.user_metadata?.display_name ||
    `${user.user_metadata?.first_name ?? ""} ${
      user.user_metadata?.last_name ?? ""
    }`.trim() ||
    user.email;
  const { data: profileData, error: profileError } = await admin
    .from("user_profiles")
    .insert({
      user_id: user.id,
      tenant_id: tenant.id,
      role: "advertiser",
      full_name: fullName,
      email: user.email,
      referral_status: referralAdvertiser ? "referred" : null,
      referred_by: referralAdvertiser
        ? (Array.isArray(referralAdvertiser.profile)
            ? referralAdvertiser.profile[0]?.full_name
            : referralAdvertiser.profile?.full_name) ?? null
        : null,
    })
    .select()
    .single();

  if (profileError) {
    return { ok: false, error: profileError.message };
  }

  const { data: advertiserData, error: advertiserError } = await admin
    .from("advertisers")
    .select("*")
    .eq("profile_id", profileData.id)
    .single();

  if (advertiserError) {
    return { ok: false, error: advertiserError.message };
  }

  // ── THE WALLET AND THE REFERRAL ─────────────────────────────────
  // A referrer that is not approved, or explicitly switched off, was
  // already dropped by findReferrer (a NULL profile status is NOT "off":
  // self-signup profiles never write it). The helper writes each at most
  // once, so a retry can finish what a first attempt did not.
  const setupProblem = await ensureWalletAndReferral(admin, {
    tenantId: tenant.id,
    advertiser: { id: advertiserData.id, user_id: advertiserData.user_id },
    referrer: referralAdvertiser,
  });
  if (setupProblem) {
    return { ok: false, error: setupProblem };
  }
  return { ok: true, path: "/dashboard" };
}
