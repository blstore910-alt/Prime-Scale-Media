"use client";

import { AppProvider } from "@/context/app-provider";
import { UserProfile } from "@/lib/types/user";
import { User } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "../ui/sonner";
import InviteForm from "../invites/invite-form";
import PushNotificationManager from "../push-notification-manager";
import AdminShell from "./adm-shell";

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
        <AdminShell>
          <PushNotificationManager />
          {children}
          <InviteForm />
        </AdminShell>
        <Toaster position="top-right" />
      </QueryClientProvider>
    </AppProvider>
  );
}
