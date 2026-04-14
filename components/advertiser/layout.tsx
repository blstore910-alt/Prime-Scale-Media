"use client";

import { AppProvider } from "@/context/app-provider";
import { UserProfile } from "@/lib/types/user";
import { User } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "../ui/sonner";
import { SidebarInset, SidebarProvider } from "../ui/sidebar";
import { AppSidebar } from "../app-sidebar";
import { AppHeader } from "../app-header";
import { MobileNav } from "../mobile-nav";
import PushNotificationManager from "../push-notification-manager";

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
        <SidebarProvider>
          <AppSidebar variant="inset" />

          <SidebarInset>
            <AppHeader />
            <PushNotificationManager />
            {children}
            <div className="h-12"></div>
          </SidebarInset>
          <Toaster position="top-right" />

          <MobileNav />
        </SidebarProvider>
        {/* <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" /> */}
      </QueryClientProvider>
    </AppProvider>
  );
}
