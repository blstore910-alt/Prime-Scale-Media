import CreateOrganization from "@/components/onboard/organization-form";
import React from "react";

// Client Component that instantiates the Supabase browser client
// at module load. Force dynamic so `next build` never tries to
// prerender it without Supabase env vars.
export const dynamic = "force-dynamic";

export default function Page() {
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
