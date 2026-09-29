"use client";

import { AppProvider } from "@/context/app-provider";
import { UserProfile } from "@/lib/types/user";
import { User } from "@supabase/supabase-js";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "../ui/sonner";
import InviteForm from "../invites/invite-form";
import PushNotificationManager from "../push-notification-manager";
import AdminShell from "./adm-shell";
import { makeQueryClient } from "@/lib/make-query-client";

const queryClient = makeQueryClient();

export default function AdminLayout({
  children,
  profile,
  user,
  ownerIds,
}: {
  children: React.ReactNode;
  profile: UserProfile;
  user: User;
  /** Every owner of this tenant. See the note in app-provider. */
  ownerIds?: string[];
}) {
  return (
    <AppProvider user={user} profile={profile} ownerIds={ownerIds}>
      <QueryClientProvider client={queryClient}>
        <AdminShell>
            {children}
        <PushNotificationManager />
          <InviteForm />
        </AdminShell>
        <Toaster position="top-right" />
      </QueryClientProvider>
    </AppProvider>
  );
}
