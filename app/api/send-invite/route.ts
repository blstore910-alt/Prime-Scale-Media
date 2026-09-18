import { isMaintenanceMode } from "@/actions/_shared";
import { apiRequireAdmin } from "@/lib/auth/api-require-admin";
import { firstName } from "@/lib/display-name";
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
  plan_currency?: string | null;
};

function numOrNull(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
    ? v
    : null;
}

export async function POST(request: NextRequest) {
  // MAINTENANCE_MODE freezes writes app-wide during an incident. Every
  // server action honours it; the API routes did not, so a declared freeze
  // stopped the UI and left the endpoints behind it writing. Reads are
  // deliberately unaffected — during an incident you want to look at data,
  // you just do not want it changing under you.
  if (isMaintenanceMode()) {
    return NextResponse.json(
      { error: "The app is in read-only maintenance mode. Try again shortly." },
      { status: 503 },
    );
  }
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
    // ── ONE ADDRESS, AND IT HAS TO LOOK LIKE ONE ──────────────────────
    //
    // This accepted any string. Paste two comma-separated addresses and
    // it becomes one send where each recipient sees the other in the To:
    // header — and the address stored on the invitation is then that
    // whole string, so the invite can never be redeemed by either of
    // them: accept-invite compares the signed-in email to it. The
    // sibling route validates with z.string().email(); this one did not.
    const looksLikeOneAddress =
      /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email) && email.length <= 254;
    const role = body.role;

    if (email && !looksLikeOneAddress) {
      return NextResponse.json(
        {
          error:
            "That does not look like a single email address. Invite one person at a time.",
        },
        { status: 400 },
      );
    }

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

    // Block a second invite while one is still pending for this email.
    const { data: pendingInvite } = await supabase
      .from("invitations")
      .select("id")
      .eq("email", email)
      .eq("tenant_id", profile.tenant_id)
      .eq("status", "pending")
      .limit(1);

    if (pendingInvite && pendingInvite.length > 0)
      return NextResponse.json(
        {
          success: false,
          message:
            "There's already a pending invitation for this email in your organization.",
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
    // Seven days. Two was too short in practice: an invitation sent on a
    // Friday afternoon was dead before the recipient came back to it, and
    // someone who has to find their company's VAT number before finishing
    // onboarding does not do that the same evening.
    const INVITE_VALID_DAYS = 7;
    // A literal escape inside a template-literal array kept getting mangled
    // by tooling; naming it once is clearer than fighting the escaping.
    const NEWLINE = String.fromCharCode(10);
    const expires_at = new Date(
      Date.now() + INVITE_VALID_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
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
    // The currency the plan is priced in, resolved once so the stored row
    // and the email agree. The insert below computes the same thing
    // inline; this is that value, named.
    const planCurrency =
      isAdvertiser &&
      String(body.plan_currency ?? "EUR").toUpperCase() === "USD"
        ? "USD"
        : "EUR";

    const payload = {
      email,
      tenant_id: profile.tenant_id,
      tenant_name: tenant.name,
      sender_id: profile.user_id,
      sender_profile_id: profile.id,
      token,
      expires_at,
      role,
      // Referrer + commission fields are super-admin only (same gate).
      // A plain admin's affiliate_id is dropped rather than linking.
      affiliate_id: callerCommissionAllowed ? affiliate_id : null,
      commission_type,
      commission_rate,
      commission_amount,
      // Plan fields (advertiser only)
      plan_id,
      monthly_fee,
      included_ad_accounts,
      topup_fee_pct,
      // THE CURRENCY, which was missing.
      //
      // create_subscription_from_invite does
      // `upper(coalesce(v_inv.plan_currency,'EUR'))`, so a $225 plan
      // became a EUR 225 subscription — about EUR 26 a month more than
      // agreed, invoiced in EUR, and collectable only from the EUR
      // wallet. A customer who funds a USD wallet then goes past_due
      // every month and is dunned for money they cannot pay with.
      plan_currency: isAdvertiser
        ? String(body.plan_currency ?? "EUR").toUpperCase() === "USD"
          ? "USD"
          : "EUR"
        : null,
    };

    const { error } = await supabase.from("invitations").insert(payload);

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 },
      );
    }

    // Who is inviting, by first name. "Sender Bart is genoeg hoeft geen
    // email van mij" — a work email address in the greeting reads as a
    // system notice; a name reads as a person asking.
    const { data: senderProfile } = await supabase
      .from("user_profiles")
      .select("full_name")
      .eq("id", profile.id)
      .maybeSingle();
    const senderName = firstName(senderProfile?.full_name) || "Your PSM contact";

    // What they are being invited ONTO, when the invite carries a plan. The
    // plan-at-invite feature exists so the terms are agreed before signup;
    // stating them in the email is the whole point of agreeing them early.
    const planLines: string[] = [];
    if (isAdvertiser) {
      if (monthly_fee != null) {
        // WITH THE CURRENCY. This wrote "225.00 per month" with no
        // symbol, on the email where somebody agrees to a price in
        // writing — and the invitation stores plan_currency, so they can
        // then be invoiced EUR 225 or USD 225 and the email supports
        // either reading.
        const cur = planCurrency;
        planLines.push(
          `<strong>${cur} ${Number(monthly_fee).toFixed(2)}</strong> per month`,
        );
      }
      if (included_ad_accounts != null) {
        planLines.push(
          `<strong>${included_ad_accounts}</strong> ad account${
            included_ad_accounts === 1 ? "" : "s"
          } included`,
        );
      }
      if (topup_fee_pct != null) {
        planLines.push(`<strong>${topup_fee_pct}%</strong> top-up fee`);
      }
    }

    const planBlock = planLines.length
      ? `
        <div style="margin:22px 0;padding:14px 16px;background:#f1f4fb;border:1px solid #e3e8f4;border-radius:12px;">
          <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#818ead;font-weight:700;">Your plan</div>
          <div style="margin-top:6px;font-size:15px;color:#12162a;line-height:1.7;">
            ${planLines.join(" &middot; ")}
          </div>
        </div>`
      : "";

    // Inline styles and a table-free single column: every mail client
    // strips <style> blocks, and a float-based layout collapses in Outlook.
    const html = `
      <div style="margin:0;padding:24px 12px;background:#f4f6fc;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e6e9f2;border-radius:18px;overflow:hidden;">
          <div style="padding:22px 26px;background:linear-gradient(135deg,#04050E,#0c1230);">
            <div style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-.01em;">Prime Scale Media</div>
            <div style="margin-top:2px;font-size:13px;color:#8b93a6;">Advertiser &amp; affiliate platform</div>
          </div>

          <div style="padding:26px;">
            <h1 style="margin:0 0 10px;font-size:21px;line-height:1.3;color:#12162a;font-weight:800;">
              ${senderName} invited you to ${tenant.name}
            </h1>
            <p style="margin:0;font-size:15px;line-height:1.6;color:#5c6577;">
              Accept the invitation to set up your account. You will be asked
              for your company details before anything is billed.
            </p>

            ${planBlock}

            <a target="_blank" href="${inviteLink}"
               style="display:inline-block;margin-top:4px;padding:13px 22px;background:#3a6fff;color:#ffffff;border-radius:12px;text-decoration:none;font-size:15px;font-weight:700;">
              Accept invitation
            </a>

            <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#8b93a6;">
              This link is valid for ${INVITE_VALID_DAYS} days. If you did not
              expect this invitation you can ignore this email — nothing
              happens until you accept it.
            </p>
          </div>
        </div>
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
          subject: `${senderName} invited you to ${tenant.name}`,
          // A plain-text part, not an empty string. Spam filters score a
          // multipart message with a blank text/plain lower, and some
          // clients show that blank part instead of the HTML.
          text: [
            `${senderName} invited you to ${tenant.name} on Prime Scale Media.`,
            ``,
            `Accept: ${inviteLink}`,
            ``,
            `This link is valid for ${INVITE_VALID_DAYS} days. If you did not expect this invitation you can ignore this email.`,
          ].join(NEWLINE),
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
