"use client";
import { AppProvider } from "@/context/app-provider";
import { UserProfile } from "@/lib/types/user";
import { User } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { AppSidebar } from "../app-sidebar";
import { SidebarInset, SidebarProvider } from "../ui/sidebar";
import { Toaster } from "../ui/sonner";
import { AppHeader } from "../app-header";

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
        <SidebarProvider>
          <AppSidebar variant="inset" />
          <SidebarInset>
            <AppHeader />
            {children}
          </SidebarInset>
          <Toaster position="top-right" />
        </SidebarProvider>
        <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
      </QueryClientProvider>
    </AppProvider>
  );
}
