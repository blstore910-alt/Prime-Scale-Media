import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { createClient } from "@/lib/supabase/server";

// LoginForm reads ?reason= via useSearchParams(). Next.js 15
// requires that to be inside a Suspense boundary during prerender.
// The auth layout (app/auth/layout.tsx) provides the split-screen
// shell; this page just renders the sign-in flow into it.
export default async function Page() {
  // Someone already signed in does not need a sign-in form. It rendered one
  // — a bookmarked /auth/login, or the browser restoring the tab — which
  // reads as having been logged out. app/page.tsx has always done this; this
  // route had been missed.
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/dashboard");

  return (
    <Suspense fallback={<div className="card" style={{ minHeight: 360 }} />}>
      <LoginForm />
    </Suspense>
  );
}
