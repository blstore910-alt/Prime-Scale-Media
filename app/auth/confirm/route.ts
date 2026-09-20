import { createClient } from "@/lib/supabase/server";
import {
  createClient as createSupabaseClient,
  type EmailOtpType,
  type User,
} from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeErrorMessage } from "@/lib/pure-error";

type ReferralProfileShape =
  | { status?: string | null; full_name?: string | null }
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

async function finalizeAdvertiserSignup(params: {
  request: NextRequest;
  user: ConfirmedUser;
  tenantSlug: string | null;
  referralCode: string | null;
}) {
  const { request, user, tenantSlug, referralCode } = params;
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

  let referralAdvertiser: {
    id: string;
    tenant_id: string;
    commission_type?: string | null;
    commission_currency?: string | null;
    commission_monthly?: number | null;
    commission_pct?: number | null;
    commission_onetime?: number | null;
    user_id: string;
    profile: ReferralProfileShape;
  } | null = null;

  if (referralCode) {
    const { data: advertiser, error: referralError } = await admin
      .from("advertisers")
      .select("*, profile:user_profiles(*)")
      .eq("tenant_client_code", referralCode)
      .maybeSingle();
    if (referralError) {
      return redirectWithError(request, referralError.message);
    }

    if (advertiser && advertiser.tenant_id === tenant.id) {
      referralAdvertiser = advertiser;
    }
  }

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
        ? referralAdvertiser?.profile?.full_name
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

  const generatedRef = `${Date.now().toString().slice(-6)}${Math.floor(
    1000 + Math.random() * 9000,
  )}`;
  const { error: walletError } = await admin.from("wallets").insert({
    advertiser_id: advertiserData.id,
    tenant_id: tenant.id,
    reference_no: generatedRef,
  });

  if (walletError) {
    return redirectWithError(request, walletError.message);
  }

  if (referralAdvertiser) {
    // ── NULL IS NOT "SWITCHED OFF" ────────────────────────────────
    //
    // This was `status === "active"`, a strict comparison, and it is
    // the ONE strict one in the codebase: every other guard reads
    // `(status ?? "active") !== "inactive"` — admin-actions,
    // invite-actions, referral-actions and about fifteen more. And the
    // profile insert a hundred lines up in THIS file never writes
    // status, so an affiliate who signed themselves up carries NULL.
    //
    // What that cost: the affiliate shares their link, the prospect
    // signs up and confirms, the profile gets referral_status and
    // referred_by, the wallet is created, every screen looks normal —
    // and no referral_links row is written. The affiliate's portal
    // reads "No referrals yet" for ever, there is nothing for the owner
    // to approve, and no error is raised anywhere, because the insert
    // is never attempted and the `if (affiliateError)` below therefore
    // never fires. Silent, permanent, and it is somebody's commission.
    //
    // Only an explicitly switched-off referrer is refused.
    const referralStatus = getReferralStatus(referralAdvertiser.profile);
    const isReferralActive =
      (referralStatus ?? "active").toLowerCase() !== "inactive";
    if (isReferralActive) {
      const { error: affiliateError } = await admin
        .from("referral_links")
        .insert({
          tenant_id: tenant.id,
          referred_advertiser_id: advertiserData.id,
          affiliate_advertiser_id: referralAdvertiser.id,
          affiliate_user_id: referralAdvertiser.user_id,
          advertiser_user_id: advertiserData.user_id,
          commission_type: referralAdvertiser.commission_type,
          commission_currency: referralAdvertiser.commission_currency,
          commission_monthly: referralAdvertiser.commission_monthly,
          commission_pct: referralAdvertiser.commission_pct,
          commission_onetime: referralAdvertiser.commission_onetime,
          // Self-signup referrals start pending — an admin approves
          // the affiliate before any commission accrues.
          status: "pending",
        });
      if (affiliateError) {
        return redirectWithError(request, affiliateError.message);
      }
    }
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
  const isSignupFamily = !type || type === "signup" || type === "invite";
  if (!isSignupFamily) {
    return NextResponse.redirect(
      new URL(
        safeNext ?? (type === "recovery" ? "/auth/update-password" : "/dashboard"),
        request.url,
      ),
    );
  }

  return finalizeAdvertiserSignup({ request, user, tenantSlug, referralCode });
}
