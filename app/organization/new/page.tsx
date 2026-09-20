import CreateOrganization from "@/components/onboard/organization-form";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import React from "react";

// Client Component that instantiates the Supabase browser client
// at module load. Force dynamic so `next build` never tries to
// prerender it without Supabase env vars.
export const dynamic = "force-dynamic";

/**
 * ── THIS ROUTE HAD NO GUARD AT ALL ───────────────────────────────────
 *
 * It sits outside the (app) group, so it gets no role check, no
 * inactive check and no shell, and the middleware only requires that a
 * session exists. Any signed-in advertiser or affiliate reached a live
 * tenant-creation form by typing the URL.
 *
 * createTenantForCurrentUser does refuse them -- "This account already
 * belongs to an organisation" -- but only AFTER they have filled the
 * form in, which is the wrong end of the transaction to find out.
 *
 * It matters more than it looks: when an invitation is consumed and the
 * profile insert then fails, /onboard finds no profile and no pending
 * invite and sends the customer HERE. Somebody halfway through joining
 * a company should not be shown a form that offers to make them a new
 * one.
 */
export default async function Page() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/auth/login");

  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("user_id", userData.user.id)
    .limit(1);
  // Already in an organisation: /onboard knows where each role belongs.
  if (profiles?.[0]?.id) redirect("/onboard");

  return (
    <main className="max-w-md mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Get started</h1>
        <p className="text-muted-foreground mt-1">
          Create your organization or accept invites to join existing ones.
        </p>
      </header>
      <section className="max-w-md">
        <CreateOrganization />
      </section>
    </main>
  );
}
