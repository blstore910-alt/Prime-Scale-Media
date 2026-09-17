"use client";

import { AppProvider } from "@/context/app-provider";
import { UserProfile } from "@/lib/types/user";
import { User } from "@supabase/supabase-js";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "../ui/sonner";
import { makeQueryClient } from "@/lib/make-query-client";
import PushNotificationManager from "../push-notification-manager";

const queryClient = makeQueryClient();

// Affiliate area providers only. The affiliate experience (AffiliateApp,
// rendered by /my-referrals) is a single-page port of the mockup that
// brings its own shell (sidebar / topbar / bottom bar).
export default function AffiliateLayout({
  children,
  user,
  profile,
}: {
  user: User;
  children: React.ReactNode;
  profile: UserProfile;
}) {
  return (
    <AppProvider user={user} profile={profile}>
      <QueryClientProvider client={queryClient}>
        {/* Affiliates were the one role with no push manager mounted, so an
            affiliate could never turn push on — while the preferences dialog
            still offered them the toggles. Admins and advertisers have had
            it all along. */}
        <PushNotificationManager />
        {children}
        <Toaster position="top-right" />
      </QueryClientProvider>
    </AppProvider>
  );
}
