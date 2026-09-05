import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

// LoginForm reads ?reason= via useSearchParams(). Next.js 15
// requires that to be inside a Suspense boundary during prerender.
// The auth layout (app/auth/layout.tsx) provides the split-screen
// shell; this page just renders the sign-in flow into it.
export default function Page() {
  return (
    <Suspense fallback={<div className="card" style={{ minHeight: 360 }} />}>
      <LoginForm />
    </Suspense>
  );
}
