"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { SUPPORT_EMAIL } from "@/lib/constants";
import ReadonlyTopupsTable from "@/components/topups/readonly-topups-table";
import { AppProvider } from "@/context/app-provider";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/make-query-client";
import { UserProfile } from "@/lib/types/user";
import { User } from "@supabase/supabase-js";

// The SHARED factory, like every other shell. A bare QueryClient here meant
// this screen alone had no error floor: a failed read left `data` undefined,
// the top-up history rendered empty, and a deactivated customer was told
// they had never topped up — with no toast to say the request had failed.
// It also had staleTime 0 and refetch-on-focus, so every tab switch reloaded
// the whole page's data.
const queryClient = makeQueryClient();

export default function InactiveContent({
  user,
  profile,
}: {
  user: User;
  profile: UserProfile;
}) {
  // The person looking at this page, so the table below can be
  // scoped to their own payments instead of the tenant's.
  const advertiserId =
    (profile as { advertiser?: { id?: string }[] | { id?: string } | null })
      ?.advertiser instanceof Array
      ? (profile as { advertiser?: { id?: string }[] }).advertiser?.[0]?.id ?? null
      : ((profile as { advertiser?: { id?: string } | null }).advertiser?.id ?? null);

  return (
    <AppProvider user={user} profile={profile}>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            <Card className="shadow-lg border-yellow-100 bg-yellow-50/30">
              <CardContent className="pt-8">
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="rounded-full bg-yellow-100 p-4 shrink-0">
                    <AlertCircle className="w-8 h-8 text-yellow-600" />
                  </div>
                  <div className="flex-1 text-center md:text-left">
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">
                      Account Inactive
                    </h1>
                    <p className="text-gray-600">
                      Hello{" "}
                      <span className="font-semibold">{profile.full_name}</span>
                      , your account has been temporarily deactivated. Please
                      contact our support team to reactivate your account and
                      regain access. Below is your recent topup history for your
                      reference.
                    </p>
                  </div>
                  {/* ── A DEAD END, UNTIL NOW ────────────────────────
                      "Switch Account" was a Link to /auth/login. The
                      session is still valid, so that page redirects to
                      /dashboard, the (app) layout sees status ===
                      "inactive" and sends them back here. A deactivated
                      customer was in a loop with no way out and no way
                      to sign in as somebody else. A real sign-out —
                      which the app already has, and /complete-profile
                      already uses — is the exit. */}
                  <div className="flex flex-wrap gap-3">
                    <LogoutButton />
                    <Button asChild>
                      <a href={`mailto:${SUPPORT_EMAIL}`}>Contact Support</a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800">
                  Topup Records
                </h2>
                <p className="text-sm text-muted-foreground">Read-only view</p>
              </div>
              {/* THEIR OWN TOP-UPS, NOT THE TENANT'S.
                  This renders the admin table, which reads top_ups_view
                  with no advertiser and no tenant predicate — it relied
                  entirely on the view carrying RLS, and the view is still
                  owner-semantics on live. Even once that is fixed the
                  payload is the whole view row, including top_ups.source,
                  which the GDPR export excludes by name because it can
                  carry a supplier identifier.
                  Scoped to the person looking, and to the columns the row
                  renderer actually uses. */}
              <ReadonlyTopupsTable advertiserId={advertiserId} />
            </div>

            <p className="text-center text-sm text-gray-500 mt-8">
              {/* "PSM Logbook" is a different product. The invite
                  screen carried the same line and was corrected; this
                  one is customer-facing too. */}
              &copy; {new Date().getFullYear()} Prime Scale Media. All rights
              reserved.
            </p>
          </div>
        </div>
      </QueryClientProvider>
    </AppProvider>
  );
}
