import { sendEmail } from "@/lib/email-sender";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const {
      email,
      role,
      tenant_id,
      tenant_name,
      affiliate_id,
      commission_type,
      commission_rate,
      commission_amount,
    } = body;

    if (!email || !role || !tenant_id) {
      return NextResponse.json(
        { error: "Missing required fields: email, role, or tenant_id" },
        { status: 400 },
      );
    }
    const { data } = await supabase
      .from("user_profiles")
      .select("*")
      .match({
        email,
        tenant_id,
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

    const { data: sender } = await supabase.auth.getUser();
    const { data: tenant } = await supabase
      .from("tenants")
      .select()
      .eq("id", tenant_id)
      .single();

    const token = randomUUID();
    const expires_at = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL}/invite/accept?token=${token}`;

    const payload = {
      email,
      tenant_id,
      tenant_name,
      sender_id: sender.user?.id,
      sender_profile_id: body.sender_profile_id,
      token,
      expires_at,
      role,
      // Affiliate fields
      affiliate_id: affiliate_id || null,
      commission_type: commission_type || null,
      commission_rate: commission_rate || null,
      commission_amount: commission_amount || null,
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

    await sendEmail({
      to: email,
      subject: `You're invited to join ${tenant.name} on PSM Dashboard`,
      text: ``,
      html,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Invitation email sent successfully.",
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    console.error("Unexpected error in /api/send-invite:", err);

    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 },
    );
  }
}
