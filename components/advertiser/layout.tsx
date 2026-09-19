"use client";

import { AppProvider } from "@/context/app-provider";
import { UserProfile } from "@/lib/types/user";
import { User } from "@supabase/supabase-js";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "../ui/sonner";
import PushNotificationManager from "../push-notification-manager";
import { makeQueryClient } from "@/lib/make-query-client";

const queryClient = makeQueryClient();

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
        {children}
        {/* AFTER the app, not before it. In the flow above {children} it
            rendered at the very top of the page and pushed the entire
            dashboard down when it appeared; it is a fixed overlay now, so
            its place in the tree only decides paint order. */}
        <PushNotificationManager />
        <Toaster position="top-right" />
      </QueryClientProvider>
    </AppProvider>
  );
}
