import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

// LoginForm reads ?reason= via useSearchParams(). Next.js 15
// requires that to be inside a Suspense boundary during prerender.
export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Suspense fallback={<div className="h-96" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
