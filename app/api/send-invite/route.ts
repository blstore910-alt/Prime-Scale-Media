import { apiRequireAdmin } from "@/lib/auth/api-require-admin";
import { sendEmail } from "@/lib/email-sender";
import { LIMITS, rateLimitCheck } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_INVITE_ROLES = ["advertiser", "affiliate"] as const;
type InviteRole = (typeof ALLOWED_INVITE_ROLES)[number];

const ALLOWED_COMMISSION_TYPES = ["percentage", "fixed", "monthly", "onetime"] as const;

type SendInviteBody = {
  email?: string;
  role?: string;
  affiliate_id?: string | null;
  commission_type?: string | null;
  commission_rate?: number | null;
  commission_amount?: number | null;
  send_email?: boolean;
  plan_id?: string | null;
  monthly_fee?: number | null;
  included_ad_accounts?: number | null;
  topup_fee_pct?: number | null;
};

function numOrNull(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
    ? v
    : null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { profile, error: authError } = await apiRequireAdmin();
    if (authError) return authError;

    const allowed = await rateLimitCheck(
      LIMITS.sendInvite,
      `tenant:${profile.tenant_id}`,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many invites — try again in an hour" },
        { status: 429 },
      );
    }

    let body: SendInviteBody;
    try {
      body = (await request.json()) as SendInviteBody;
    } catch {
      return NextResponse.json(
        { error: "Malformed JSON body" },
        { status: 400 },
      );
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = body.role;

    if (!email || !role) {
      return NextResponse.json(
        { error: "Missing required fields: email, role" },
        { status: 400 },
      );
    }

    if (!ALLOWED_INVITE_ROLES.includes(role as InviteRole)) {
      return NextResponse.json(
        { error: `Role must be one of: ${ALLOWED_INVITE_ROLES.join(", ")}` },
        { status: 400 },
      );
    }

    // Optional affiliate fields — validate shape when present.
    const affiliate_id =
      typeof body.affiliate_id === "string" && body.affiliate_id.length > 0
        ? body.affiliate_id
        : null;

    // Commission fields on an invitation are super-admin only. A
    // plain admin sending an affiliate invite gets these silently
    // dropped rather than a hard error — matches how the affiliate
    // action layer treats the split. This closes the leak where a
    // plain admin could preload commission_rate=1.0 on an invite
    // and have it propagate on accept.
    const callerCommissionAllowed = await (async () => {
      const { data: tenantRow } = await supabase
        .from("tenants")
        .select("owner_id")
        .eq("id", profile.tenant_id)
        .maybeSingle();
      return !!tenantRow?.owner_id && tenantRow.owner_id === profile.user_id;
    })();

    let commission_type: string | null = null;
    if (callerCommissionAllowed && body.commission_type != null) {
      if (
        typeof body.commission_type !== "string" ||
        !ALLOWED_COMMISSION_TYPES.includes(
          body.commission_type as (typeof ALLOWED_COMMISSION_TYPES)[number],
        )
      ) {
        return NextResponse.json(
          { error: "Invalid commission_type" },
          { status: 400 },
        );
      }
      commission_type = body.commission_type;
    }
    const commission_rate =
      callerCommissionAllowed &&
      typeof body.commission_rate === "number" &&
      body.commission_rate >= 0
        ? body.commission_rate
        : null;
    const commission_amount =
      callerCommissionAllowed &&
      typeof body.commission_amount === "number" &&
      body.commission_amount >= 0
        ? body.commission_amount
        : null;

    const { data } = await supabase
      .from("user_profiles")
      .select("id")
      .match({
        email,
        tenant_id: profile.tenant_id,
        role,
      })
      .maybeSingle();

    if (data)
      return NextResponse.json(
        {
          success: false,
          message:
            "A user with this email and role already exists in your organization.",
        },
        { status: 400 },
      );

    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, name")
      .eq("id", profile.tenant_id)
      .single();

    if (!tenant) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 500 },
      );
    }

    const token = randomUUID();
    const expires_at = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL}/invite/accept?token=${token}`;

    // Plan fields — advertiser invites only, pre-filled from a preset in
    // the UI and adjustable. Validated + only stored for advertisers.
    const isAdvertiser = role === "advertiser";
    const plan_id =
      isAdvertiser && typeof body.plan_id === "string" && body.plan_id.length > 0
        ? body.plan_id
        : null;
    const monthly_fee = isAdvertiser
      ? numOrNull(body.monthly_fee, 0, 1_000_000)
      : null;
    const included_ad_accounts = isAdvertiser
      ? numOrNull(body.included_ad_accounts, 0, 1000)
      : null;
    const topup_fee_pct = isAdvertiser
      ? numOrNull(body.topup_fee_pct, 0, 100)
      : null;

    const payload = {
      email,
      tenant_id: profile.tenant_id,
      tenant_name: tenant.name,
      sender_id: profile.user_id,
      sender_profile_id: profile.id,
      token,
      expires_at,
      role,
      // Affiliate fields (validated above)
      affiliate_id,
      commission_type,
      commission_rate,
      commission_amount,
      // Plan fields (advertiser only)
      plan_id,
      monthly_fee,
      included_ad_accounts,
      topup_fee_pct,
    };

    const { error } = await supabase.from("invitations").insert(payload);

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 },
      );
    }

    const html = `
      <div style="font-family: Arial, sans-serif; color: #333; padding: 20px;">
        <h2>You're invited to join PSM Dashboard</h2>
        <p>Click the button below to accept the invitation and join the platform.</p>
        <a target="_blank" href="${inviteLink}" 
           style="display:inline-block;padding:12px 20px;background-color:#007bff;color:white;border-radius:6px;text-decoration:none;margin-top:16px;">
           Accept Invitation
        </a>
        <p style="margin-top:20px;font-size:14px;color:#666;">If you didn’t expect this invite, you can safely ignore this email.</p>
      </div>
    `;

    // The invitation row is already committed. Sending the email is
    // best-effort — if the mail provider is down, the invite still
    // exists and the admin can copy the link from the response. Don't
    // let an email failure 500 the whole request and strand the
    // invite with no way to reach it.
    // Email is optional — the admin can choose to just get the link.
    const wantsEmail = body.send_email !== false;
    let emailSent = false;
    if (wantsEmail) {
      try {
        await sendEmail({
          to: email,
          subject: `You're invited to join ${tenant.name} on PSM Dashboard`,
          text: ``,
          html,
        });
        emailSent = true;
      } catch (mailErr) {
        console.error(
          "send-invite email failed (invite still created):",
          mailErr instanceof Error ? mailErr.message : "unknown",
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        emailSent,
        inviteLink,
        message: !wantsEmail
          ? "Invite created — share the link below."
          : emailSent
            ? "Invitation email sent. The link is below too."
            : "Invite created, but the email couldn't be sent. Copy the link and share it manually.",
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    console.error(
      "send-invite failed:",
      err instanceof Error ? err.message : "unknown",
    );

    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 },
    );
  }
}
