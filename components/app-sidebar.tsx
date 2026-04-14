"use client";

import {
  IconAd,
  IconCashRegister,
  IconMailForward,
  IconReceipt,
  IconUsers,
  type TablerIcon,
} from "@tabler/icons-react";
import {
  ClipboardListIcon,
  Coins,
  FileTextIcon,
  HelpCircleIcon,
  History,
  LayoutDashboardIcon,
  SettingsIcon,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import * as React from "react";

import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAppContext } from "@/context/app-provider";
import Image from "next/image";

// Advertiser Navigation Items
const advertiserNavItems = {
  main: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboardIcon,
    },
    {
      title: "My Ad Accounts",
      url: "/accounts",
      icon: IconAd,
    },
    {
      title: "Topups",
      url: "/top-ups",
      icon: IconCashRegister,
    },
    {
      title: "My Subscription",
      url: "/my-subscription",
      icon: Coins,
    },
    {
      title: "My Referrals",
      url: "/my-referrals",
      icon: IconMailForward,
    },
    {
      title: "Wallet",
      url: "/wallet",
      icon: Wallet,
    },
    {
      title: "Invoices",
      url: "/invoices",
      icon: IconReceipt,
    },
  ],
  secondary: [
    {
      title: "Get Help",
      url: "/help",
      icon: HelpCircleIcon,
    },
  ],
};

// Admin Navigation Items with Sections
const getAdminNavItems = (isSuperAdmin: boolean) => ({
  main: [
    {
      title: "General",
      items: [
        {
          title: "Dashboard",
          url: "/dashboard",
          icon: LayoutDashboardIcon,
        },
        {
          title: "Advertisers",
          url: "/users",
          icon: IconUsers,
        },
        {
          title: "Ad Accounts",
          url: "/accounts",
          icon: IconAd,
        },
        {
          title: "Topups",
          url: "/top-ups",
          icon: IconCashRegister,
        },
        {
          title: "Account Requests",
          url: "/ad-account-requests",
          icon: FileTextIcon,
        },
        {
          title: "Subscriptions",
          url: "/subscriptions",
          icon: Coins,
        },
        {
          title: "Invoices",
          url: "/invoices",
          icon: IconReceipt,
        },
        {
          title: "Wallets",
          url: "/wallets",
          icon: Wallet,
        },
        {
          title: "Wallet Topups",
          url: "/wallet-topups",
          icon: ClipboardListIcon,
        },
      ],
    },
    ...(isSuperAdmin
      ? [
          {
            title: "Referrals",
            items: [
              {
                title: "Referral Links",
                url: "/affiliates",
                icon: IconMailForward,
              },
              {
                title: "Referral Commissions",
                url: "/commissions",
                icon: Coins,
              },
            ],
          },
        ]
      : []),
  ],
  secondary: isSuperAdmin
    ? [
        {
          title: "Settings",
          url: "/settings/finance",
          icon: SettingsIcon,
        },
        {
          title: "Activity Logs",
          url: "/activity-logs",
          icon: History,
        },
        {
          title: "Invites",
          url: "/invites",
          icon: IconUsers,
        },
        {
          title: "Admins",
          url: "/admins",
          icon: IconUsers,
        },
        {
          title: "Get Help",
          url: "/help",
          icon: HelpCircleIcon,
        },
      ]
    : [
        {
          title: "Get Help",
          url: "/help",
          icon: HelpCircleIcon,
        },
      ],
});

// Component for rendering admin sections
function AdminSidebarContent({
  sections,
}: {
  sections: Array<{
    title: string;
    items: Array<{
      title: string;
      url: string;
      icon?: LucideIcon | TablerIcon;
    }>;
  }>;
}) {
  return (
    <>
      {sections.map((section) => (
        <div key={section.title}>
          {section.title && (
            <h3 className="px-2 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {section.title}
            </h3>
          )}
          <NavMain items={section.items} />
        </div>
      ))}
    </>
  );
}

// Component for rendering advertiser sidebar
function AdvertiserSidebarContent() {
  return (
    <>
      <NavMain items={advertiserNavItems.main} />
      <NavSecondary items={advertiserNavItems.secondary} className="mt-auto" />
    </>
  );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { profile, isSuperAdmin } = useAppContext();
  const { full_name, email } = profile || {};
  const adminNavItems = getAdminNavItems(isSuperAdmin);

  return (
    <>
      <Sidebar collapsible="offcanvas" {...props}>
        <SidebarHeader>
          <div className="flex gap-2 items-center h-28">
            <Image
              src={"/images/psm-logo.svg"}
              height={1080}
              width={1080}
              alt="PSM Logo"
              className="object-cover h-40 w-auto mx-auto"
            />
          </div>
        </SidebarHeader>
        <SidebarContent>
          {profile?.role === "admin" ? (
            <>
              <AdminSidebarContent sections={adminNavItems.main} />
              <NavSecondary
                items={adminNavItems.secondary}
                className="mt-auto"
              />
            </>
          ) : (
            <AdvertiserSidebarContent />
          )}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <NavUser
                user={{
                  avatar: "",
                  email: email || "",
                  name: full_name as string,
                  client_code: profile?.advertiser?.[0]?.tenant_client_code,
                }}
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
    </>
  );
}
