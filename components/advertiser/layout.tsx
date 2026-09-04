"use client";

import { AppProvider } from "@/context/app-provider";
import { UserProfile } from "@/lib/types/user";
import { User } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "../ui/sonner";
import PushNotificationManager from "../push-notification-manager";
import PsmAppShell from "./psm-shell";

const queryClient = new QueryClient();

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
        <PsmAppShell variant="advertiser">
          <PushNotificationManager />
          {children}
        </PsmAppShell>
        <Toaster position="top-right" />
      </QueryClientProvider>
    </AppProvider>
  );
}
