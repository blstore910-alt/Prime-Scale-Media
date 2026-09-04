"use client";

import { AppProvider } from "@/context/app-provider";
import { UserProfile } from "@/lib/types/user";
import { User } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "../ui/sonner";
import PsmAppShell from "../advertiser/psm-shell";

const queryClient = new QueryClient();

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
        <PsmAppShell variant="affiliate">{children}</PsmAppShell>
        <Toaster position="top-right" />
      </QueryClientProvider>
    </AppProvider>
  );
}
