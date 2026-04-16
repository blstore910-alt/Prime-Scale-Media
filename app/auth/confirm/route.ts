import { createClient } from "@/lib/supabase/server";
import {
  createClient as createSupabaseClient,
  type EmailOtpType,
  type User,
} from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

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

  const { data: existingProfile, error: profileLookupError } = await admin
    .from("user_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileLookupError) {
    return redirectWithError(request, profileLookupError.message);
  }

  if (existingProfile?.id) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
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
    const referralStatus = getReferralStatus(referralAdvertiser.profile);
    const isReferralActive = referralStatus === "active";
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
  const tenantSlug =
    searchParams.get("t") ?? getStringMetadataValue(metadata, "tenant_slug");
  const referralCode =
    (
      searchParams.get("ref") ??
      getStringMetadataValue(metadata, "referral_code")
    )?.toUpperCase() ?? null;

  return finalizeAdvertiserSignup({ request, user, tenantSlug, referralCode });
}
