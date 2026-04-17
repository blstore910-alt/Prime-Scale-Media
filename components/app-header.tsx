"use client";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeSwitcher } from "./theme-switcher";
import { NotificationsPopover } from "./notifications/notifications-popover";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/client";
import { LogOutIcon, UserCircleIcon } from "lucide-react";
import Link from "next/link";

const pageTitles = {
  "/dashboard": "Dashboard",
  "/accounts": "Ad Accounts",
  "/top-ups": "Topups",
  "/my-subscription": "My Subscription",
  "/my-referrals": "My Referrals",
  "/wallet": "Wallet",
  "/invoices": "Invoices",
  "/help": "Get Help",
  "/users": "Advertisers",
  "/ad-account-requests": "Account Requests",
  "/subscriptions": "Subscriptions",
  "/wallets": "Wallets",
  "/wallet-topups": "Wallet Topups",
  "/affiliates": "Referral Links",
  "/commissions": "Referral Commissions",
  "/settings/finance": "Settings",
  "/activity-logs": "Activity Logs",
  "/invites": "Invites",
  "/admins": "Admins",
};

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  return (
    <header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear sticky top-0 z-20 bg-background rounded-t-lg">
      <div className="flex items-center justify-between w-full px-4 lg:px-6 ">
        <div className="flex w-full items-center gap-1 lg:gap-2">
          <>
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mx-2 data-[orientation=vertical]:h-4"
            />
          </>

          <h1 className="text-lg font-semibold font-display">
            {pageTitles[pathname as keyof typeof pageTitles] ?? "Dashboard"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" asChild>
            <Link href="/profile">
              <UserCircleIcon className="text-muted-foreground" />
            </Link>
          </Button>
          <NotificationsPopover />
          <ThemeSwitcher variant="outline" />
          <Button size="icon" variant="outline" onClick={logout}>
            <LogOutIcon className="text-muted-foreground" />
          </Button>
        </div>
      </div>
    </header>
  );
}
