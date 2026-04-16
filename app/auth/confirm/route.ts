import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

type ReferralProfileShape =
  | { status?: string | null; full_name?: string | null }
  | null
  | undefined;

function getReferralStatus(profile: ReferralProfileShape): string | null {
  if (Array.isArray(profile)) {
    return profile[0]?.status ?? null;
  }
  return profile?.status ?? null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tenantSlug = searchParams.get("t");
  const referralCode = searchParams.get("ref")?.toUpperCase() ?? null;

  if (code) {
    const supabase = await createClient();
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

    // Exchange the code for a session
    const { data: sessionData, error } =
      await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(
          `/auth/error?error=${encodeURIComponent(error.message)}`,
          request.url,
        ),
      );
    }

    const user = sessionData?.user ?? sessionData?.session?.user;
    if (!user?.id || !user.email) {
      return NextResponse.redirect(
        new URL("/auth/error?error=Invalid%20session%20data", request.url),
      );
    }

    if (!tenantSlug) {
      return NextResponse.redirect(
        new URL("/auth/error?error=Missing%20tenant%20slug", request.url),
      );
    }

    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .select("*")
      .eq("slug", tenantSlug)
      .maybeSingle();
    if (tenantError || !tenant) {
      return NextResponse.redirect(
        new URL("/auth/error?error=Malformed%20request", request.url),
      );
    }

    const { data: existingProfile, error: profileLookupError } = await admin
      .from("user_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileLookupError) {
      return NextResponse.redirect(
        new URL(
          `/auth/error?error=${encodeURIComponent(profileLookupError.message)}`,
          request.url,
        ),
      );
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
      profile: ReferralProfileShape;
    } | null = null;

    if (referralCode) {
      const { data: advertiser, error: referralError } = await admin
        .from("advertisers")
        .select("*, profile:user_profiles(*)")
        .eq("tenant_client_code", referralCode)
        .maybeSingle();
      if (referralError) {
        return NextResponse.redirect(
          new URL(
            `/auth/error?error=${encodeURIComponent(referralError.message)}`,
            request.url,
          ),
        );
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
      return NextResponse.redirect(
        new URL(
          `/auth/error?error=${encodeURIComponent(profileError.message)}`,
          request.url,
        ),
      );
    }

    const { data: advertiserData, error: advertiserError } = await admin
      .from("advertisers")
      .select("*")
      .eq("profile_id", profileData.id)
      .single();

    if (advertiserError) {
      return NextResponse.redirect(
        new URL(
          `/auth/error?error=${encodeURIComponent(advertiserError.message)}`,
          request.url,
        ),
      );
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
      return NextResponse.redirect(
        new URL(
          `/auth/error?error=${encodeURIComponent(walletError.message)}`,
          request.url,
        ),
      );
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
            commission_type: referralAdvertiser.commission_type,
            commission_currency: referralAdvertiser.commission_currency,
            commission_monthly: referralAdvertiser.commission_monthly,
            commission_pct: referralAdvertiser.commission_pct,
            commission_onetime: referralAdvertiser.commission_onetime,
          });
        if (affiliateError) {
          return NextResponse.redirect(
            new URL(
              `/auth/error?error=${encodeURIComponent(affiliateError.message)}`,
              request.url,
            ),
          );
        }
      }
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.redirect(
    new URL("/auth/error?error=No%20code%20provided", request.url),
  );
}
