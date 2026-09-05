"use client";

import { AppProvider } from "@/context/app-provider";
import { UserProfile } from "@/lib/types/user";
import { User } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "../ui/sonner";
import PushNotificationManager from "../push-notification-manager";

const queryClient = new QueryClient();

// Advertiser area providers only. The advertiser experience (AdvertiserApp,
// rendered by /dashboard) is a single-page port of the mockup that brings
// its own shell (sidebar / topbar / bottom bar).
export default function AdvertiserLayout({
  children,
  profile,
  user,
}: {
  user: User;
  children: React.ReactNode;
  profile: UserProfile;
}) {
  return (
    <AppProvider user={user} profile={profile}>
      <QueryClientProvider client={queryClient}>
        <PushNotificationManager />
        {children}
        <Toaster position="top-right" />
      </QueryClientProvider>
    </AppProvider>
  );
}
