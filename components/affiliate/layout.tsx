"use client";

import { AppProvider } from "@/context/app-provider";
import { UserProfile } from "@/lib/types/user";
import { User } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "../ui/sonner";

const queryClient = new QueryClient();

// Affiliate area providers only. The affiliate experience (AffiliateApp,
// rendered by /my-referrals) is a single-page port of the mockup that
// brings its own shell (sidebar / topbar / bottom bar).
export default function AffilateLayout({
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
        {children}
        <Toaster position="top-right" />
      </QueryClientProvider>
    </AppProvider>
  );
}
