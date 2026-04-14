"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, LogOut } from "lucide-react";
import Link from "next/link";
import ReadonlyTopupsTable from "@/components/topups/readonly-topups-table";
import { AppProvider } from "@/context/app-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserProfile } from "@/lib/types/user";
import { User } from "@supabase/supabase-js";

const queryClient = new QueryClient();

export default function InactiveContent({
  user,
  profile,
}: {
  user: User;
  profile: UserProfile;
}) {
  return (
    <AppProvider user={user} profile={profile}>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            <Card className="shadow-lg border-yellow-100 bg-yellow-50/30">
              <CardContent className="pt-8">
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="rounded-full bg-yellow-100 p-4 shrink-0">
                    <AlertCircle className="w-8 h-8 text-yellow-600" />
                  </div>
                  <div className="flex-1 text-center md:text-left">
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">
                      Account Inactive
                    </h1>
                    <p className="text-gray-600">
                      Hello{" "}
                      <span className="font-semibold">{profile.full_name}</span>
                      , your account has been temporarily deactivated. Please
                      contact our support team to reactivate your account and
                      regain access. Below is your recent topup history for your
                      reference.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Button asChild variant="outline">
                      <Link href="/auth/login">
                        <LogOut className="w-4 h-4 mr-2" />
                        Switch Account
                      </Link>
                    </Button>
                    <Button asChild>
                      <a href="mailto:support@psm-logbook.com">
                        Contact Support
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800">
                  Topup Records
                </h2>
                <p className="text-sm text-muted-foreground">Read-only view</p>
              </div>
              <ReadonlyTopupsTable />
            </div>

            <p className="text-center text-sm text-gray-500 mt-8">
              &copy; {new Date().getFullYear()} PSM Logbook. All rights
              reserved.
            </p>
          </div>
        </div>
      </QueryClientProvider>
    </AppProvider>
  );
}
