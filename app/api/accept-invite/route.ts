import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const { status, role, tenant_id, invite_id } = body;
  if (!status || !role || !tenant_id || !invite_id) {
    return NextResponse.json(
      { success: false, message: "Missing required fields" },
      { status: 400 },
    );
  }

  const { data: userData } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("invitations")
    .update({ status })
    .eq("id", invite_id)
    .select("*");

  if (error) {
    console.error(error);
    return NextResponse.json(
      {
        success: false,
        message:
          "An error occured while updating invitation status. Please try again.",
      },
      { status: 500 },
    );
  }

  if (status === "accepted") {
    const { data, error } = await supabase
      .from("user_profiles")
      .insert({
        user_id: userData.user?.id,
        tenant_id,
        role,
        full_name: userData?.user?.user_metadata.display_name,
        email: userData?.user?.email,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      return NextResponse.json(
        {
          success: false,
          message: "An error occured while creating user profile",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Invite accepted and user profile created",
      },
      { status: 201, headers: { "Set-Cookie": `profile=${data.id}` } },
    );
  }

  return NextResponse.json(
    { success: true, message: "Invite rejected successfully" },
    { status: 201 },
  );
}
