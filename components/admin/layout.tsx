"use client";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppProvider } from "@/context/app-provider";
import { UserProfile } from "@/lib/types/user";
import { User } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "../ui/sonner";
import InviteForm from "../invites/invite-form";
import { MobileNav } from "../mobile-nav";
import PushNotificationManager from "../push-notification-manager";
import {
  ReactQueryDevtools,
  ReactQueryDevtoolsPanel,
} from "@tanstack/react-query-devtools";

const queryClient = new QueryClient();
export default function AdminLayout({
  children,
  profile,
  user,
}: {
  children: React.ReactNode;
  profile: UserProfile;
  user: User;
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
            <InviteForm />
          </SidebarInset>
          <Toaster position="top-right" />

          <MobileNav />
        </SidebarProvider>
        <ReactQueryDevtools />
      </QueryClientProvider>
    </AppProvider>
  );
}
