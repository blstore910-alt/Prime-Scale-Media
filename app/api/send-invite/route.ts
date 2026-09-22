import { isMaintenanceMode } from "@/actions/_shared";
import { apiRequireOwner } from "@/lib/auth/api-require-admin";
import { firstName } from "@/lib/display-name";
import { sendEmail } from "@/lib/email-sender";
import {
  emailLayout,
  emailPanel,
  emailParagraph,
  escapeHtml,
} from "@/lib/pure-email-layout";
import { LIMITS, rateLimitCheck } from "@/lib/rate-limit";
import { createAdminClient, createClient } from "@/lib/supabase/server";
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
    // ── OWNER, LIKE EVERY DOOR IN FRONT OF IT ─────────────────────
    //
    // The "Invite" button is gated on isSuperAdmin and /invites is
    // requireSuperAdmin — and this route, the only thing that actually
    // creates an invitation, was apiRequireAdmin. So an employee admin
    // could POST here directly and mint a tenant member, with no screen
    // anywhere on which to see, resend or cancel what they had created.
    // The commission and plan fields were already dropped for a
    // non-owner, which says the boundary was known and moved one field
    // at a time instead of once.
    const { profile, error: authError } = await apiRequireOwner();
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

    // ── PRICING IS THE OWNER'S, ON EVERY DOOR ─────────────────────────
    //
    // This route is guarded by apiRequireAdmin, and the /invites PAGE is
    // requireSuperAdmin — but a page guard is not a boundary, because an
    // API route never goes through a layout. The commission fields above
    // were owner-gated for exactly this reason and the PLAN fields were
    // not, so an employee admin refused by upsertPlan, by
    // createSubscriptionAsAdmin ("Only the account owner can start, stop
    // or price a subscription") and by changeSubscriptionAmount could
    // POST one invite carrying monthly_fee: 5, topup_fee_pct: 0,
    // included_ad_accounts: 1000 — and create_subscription_from_invite
    // writes exactly that on accept. Same side door, one field along.
    //
    // Dropped rather than refused, to match how the commission fields
    // behave: the invite still goes out, on the tenant's defaults.
    const canPrice = callerCommissionAllowed;
    const priceable = isAdvertiser && canPrice;

    // A plan id from ANOTHER tenant was storable too — nothing checked
    // it belonged to us. Verified here rather than trusted.
    let plan_id: string | null = null;
    if (priceable && typeof body.plan_id === "string" && body.plan_id.length > 0) {
      const { data: planRow } = await supabase
        .from("plans")
        .select("id")
        .eq("id", body.plan_id)
        .eq("tenant_id", profile.tenant_id)
        .maybeSingle();
      plan_id = planRow?.id ? body.plan_id : null;
    }
    const monthly_fee = priceable
      ? numOrNull(body.monthly_fee, 0, 1_000_000)
      : null;
    const included_ad_accounts = priceable
      ? numOrNull(body.included_ad_accounts, 0, 1000)
      : null;
    const topup_fee_pct = priceable
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

    // ── THE WRITE GOES THROUGH THE ADMIN CLIENT ──────────────────────
    //
    // Not because the caller lacks the right -- apiRequireOwner() has
    // already established they are the owner -- but so that the live
    // database can REVOKE insert/update/delete on `invitations` from
    // `authenticated` without breaking this route.
    //
    // It has to, because the RLS policy is `invitations_write_admin
    // for all using (_is_admin_of(tenant_id))`: any active employee
    // admin can insert, update or delete an invitation straight from
    // the browser console with the anon key. They can re-price a
    // pending offer the owner authored -- monthly_fee 0, topup_fee_pct
    // 0, their own affiliate_id -- and create_subscription_from_invite
    // writes exactly those numbers on accept. The owner guard on this
    // route is not the boundary; the GRANT is, and Postgres checks it
    // before the policy.
    //
    // Every field of `payload` is built from the owner's own profile
    // and the validated body above; nothing from the caller is spread
    // in.
    const adminDb = await createAdminClient();
    const { error } = await adminDb.from("invitations").insert(payload);

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

    // ── THE HOUSE LAYOUT (lib/pure-email-layout) ─────────────────────
    // The owner, 22-09: "maak email ook meer pro, alle emails". Names are
    // escaped: a first name or an organisation name is typed by a person.
    const who = escapeHtml(senderName);
    const org = escapeHtml(tenant.name);
    const html = emailLayout({
      preheader: `${senderName} invited you to ${tenant.name} — accept to set up your account.`,
      title: `${who} invited you to ${org}`,
      bodyHtml:
        emailParagraph(
          "Accept the invitation to set up your account. You will be asked for your company details before anything is billed.",
        ) + (planLines.length ? emailPanel("Your plan", planLines.join(" &middot; ")) : ""),
      cta: { label: "Accept invitation", href: inviteLink },
      footnoteHtml: `This link is valid for ${INVITE_VALID_DAYS} days. Did not expect this invitation? Ignore this email — nothing happens until you accept it.`,
    });

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
