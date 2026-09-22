import { createClient } from "@/lib/supabase/server";
import {
  createClient as createSupabaseClient,
  type EmailOtpType,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeErrorMessage } from "@/lib/pure-error";

type ReferralProfileShape =
  | { status?: string | null; full_name?: string | null; role?: string | null }
  | null
  | undefined;
type ConfirmedUser = Pick<User, "id" | "email" | "user_metadata">;

function getReferralStatus(profile: ReferralProfileShape): string | null {
  if (Array.isArray(profile)) {
    return profile[0]?.status ?? null;
  }
  return profile?.status ?? null;
}

function redirectWithError(request: NextRequest, message: string) {
  return NextResponse.redirect(
    new URL(`/auth/error?error=${encodeURIComponent(message)}`, request.url),
  );
}

function getStringMetadataValue(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function toConfirmedUser(user: User | null | undefined): ConfirmedUser | null {
  if (!user?.id || !user.email) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    user_metadata: user.user_metadata,
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
async function findReferrer(
  admin: AdminClient,
  tenantId: string,
  code: string,
): Promise<ReferrerRow | null> {
  const { data, error } = await admin
    .from("advertisers")
    .select("*, profile:user_profiles(status, full_name, role)")
    .eq("tenant_id", tenantId)
    .eq("tenant_client_code", code)
    .limit(1);
  if (error || !data?.[0]) return null;
  const row = data[0] as ReferrerRow;
  // Somebody invited AS an affiliate was approved by being invited.
  const prof = Array.isArray(row.profile) ? row.profile[0] : row.profile;
  const invitedAffiliate = String(prof?.role ?? "").toLowerCase() === "affiliate";
  if (
    "affiliate_status" in row &&
    row.affiliate_status !== "approved" &&
    !invitedAffiliate
  ) {
    return null;
  }
  const status = getReferralStatus(row.profile);
  if ((status ?? "active").toLowerCase() === "inactive") return null;
  return row;
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
  if (!wallets?.length) {
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

async function finalizeAdvertiserSignup(params: {
  request: NextRequest;
  user: ConfirmedUser;
  tenantSlug: string | null;
  referralCode: string | null;
  /** Only the code the user's own sign-up recorded. A retry never takes
   *  one from the address bar: that would let an existing customer name
   *  a referrer for themselves by adding ?ref= to a sign-in link. */
  signupReferralCode: string | null;
}) {
  const { request, user, tenantSlug, referralCode, signupReferralCode } = params;
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
    return redirectWithError(request, safeErrorMessage(profileLookupError));
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
              ? await findReferrer(admin, tenantRow.id, signupReferralCode)
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
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!tenantSlug) {
    return redirectWithError(request, "Missing tenant slug");
  }

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("*")
    .eq("slug", tenantSlug)
    .maybeSingle();
  if (tenantError || !tenant) {
    return redirectWithError(request, "Malformed request");
  }

  // A code we cannot place is simply no referral -- never a reason to
  // stop somebody signing up.
  const referralAdvertiser = referralCode
    ? await findReferrer(admin, tenant.id, referralCode)
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
    return redirectWithError(request, profileError.message);
  }

  const { data: advertiserData, error: advertiserError } = await admin
    .from("advertisers")
    .select("*")
    .eq("profile_id", profileData.id)
    .single();

  if (advertiserError) {
    return redirectWithError(request, advertiserError.message);
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
    return redirectWithError(request, setupProblem);
  }
  return NextResponse.redirect(new URL("/dashboard", request.url));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();
  let user: ConfirmedUser | null = null;

  if (tokenHash && type) {
    const { data: otpData, error: verifyOtpError } =
      await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
    if (verifyOtpError) {
      return redirectWithError(request, verifyOtpError.message);
    }
    user = toConfirmedUser(otpData.user ?? otpData.session?.user);
  } else if (code) {
    const { data: sessionData, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      return redirectWithError(request, exchangeError.message);
    }
    user = toConfirmedUser(sessionData?.user ?? sessionData?.session?.user);
  } else {
    return redirectWithError(request, "No confirmation token provided");
  }

  if (!user) {
    return redirectWithError(request, "Invalid session data");
  }

  const metadata = (user.user_metadata as Record<string, unknown> | null) ?? {};

  // Prefer the tenant/referral values recorded in the user's metadata (set at
  // signup time by the app's own signup flow) over URL query params. If both
  // are present and they diverge, refuse — the URL was tampered with.
  const metadataTenant = getStringMetadataValue(metadata, "tenant_slug");
  const urlTenant = searchParams.get("t");
  if (metadataTenant && urlTenant && metadataTenant !== urlTenant) {
    return redirectWithError(request, "Tenant slug mismatch");
  }
  // ── AND A SILENT METADATA IS NOT PERMISSION TO TRUST THE URL ────────
  //
  // The mismatch refusal above only fires when BOTH are present. Users
  // minted by auth.admin.createUser — the invite-signup route and the
  // admin-create route — carry no tenant_slug metadata at all, so such a
  // user with no profile yet, confirming with ?t=<any slug>, got a
  // service-role user_profiles insert as an ADVERTISER in a tenant they
  // chose from the address bar.
  //
  // The URL is only trusted when the app has no opinion AND the user has
  // no profile to contradict it, which is the genuine self-signup case
  // this fallback was written for — and that flow always sets the
  // metadata, so in practice the fallback now serves nobody but a
  // legacy link.
  // `metadata` is `(...) ?? {}`, so it was ALWAYS truthy and the
  // right-hand branch never ran. That is the behaviour this comment
  // argues for, so it is written as what it does: the URL is not
  // trusted, full stop. `urlTenant` is still read above, to refuse a
  // mismatch.
  void urlTenant;
  const tenantSlug = metadataTenant ?? null;

  const metadataReferral = getStringMetadataValue(metadata, "referral_code");
  const urlReferral = searchParams.get("ref");
  if (metadataReferral && urlReferral && metadataReferral !== urlReferral) {
    return redirectWithError(request, "Referral code mismatch");
  }
  const referralCode = (metadataReferral ?? urlReferral)?.toUpperCase() ?? null;

  // ── ONLY THE SIGNUP FAMILY GETS THE SIGNUP FINALISER ──────────────
  //
  // This ran unconditionally for every OTP type. A password `recovery`,
  // an `email_change` or a `magiclink` routed through here therefore
  // went looking for a tenant slug it could not have and ended on
  // /auth/error -- on the screen somebody reaches when they already
  // cannot get in.
  //
  // `next` is honoured where the link carries one, which is how
  // Supabase's own templates point a recovery link at
  // /auth/update-password.
  const nextParam = searchParams.get("next");
  const safeNext =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : null;
  // `email` is what Supabase's own confirmation template sends for a
  // SIGN-UP now (token_hash + type=email). It was missing, so a new
  // customer who confirmed was sent to /dashboard with no profile, no
  // wallet and no referral -- and from there to "create an organisation".
  const isSignupFamily =
    !type || type === "signup" || type === "invite" || type === "email";
  if (!isSignupFamily) {
    return NextResponse.redirect(
      new URL(
        safeNext ?? (type === "recovery" ? "/auth/update-password" : "/dashboard"),
        request.url,
      ),
    );
  }

  return finalizeAdvertiserSignup({
    request,
    user,
    tenantSlug,
    referralCode,
    signupReferralCode: metadataReferral?.toUpperCase() ?? null,
  });
}
