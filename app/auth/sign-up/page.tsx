import InviteSignUpForm from "@/components/invite-sign-up-form";
import InviteExpired from "@/components/invites/invite-expired";
import { SignUpForm } from "@/components/sign-up-form";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Suspense } from "react";

type PageProps = {
  searchParams: Promise<{ token?: string }>;
};
export default async function Page({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const supabase = await createClient();
  const cookieStore = await cookies();
  const referralCode = cookieStore.get("ref")?.value;
  const tenantSlug = cookieStore.get("tenant")?.value;

  if (!token) {
    if (!referralCode || !tenantSlug) {
      redirect("/auth/login");
    }
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md">
          <SignUpForm referralCode={referralCode} tenantSlug={tenantSlug} />
        </div>
      </div>
    );
  }

  const { data: invite, error } = await supabase
    .from("invitations")
    .select("*, tenant:tenants(*), sender_profile:user_profiles(*)")
    .eq("token", token)
    .maybeSingle();

  if (error) throw new Error(error?.message);

  if (new Date(invite.expires_at) < new Date()) {
    return (
      <Suspense fallback={null}>
        <InviteExpired />
      </Suspense>
    );
  }

  if (invite) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md">
          <InviteSignUpForm invite={invite} />
        </div>
      </div>
    );
  }
}
