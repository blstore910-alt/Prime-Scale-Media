"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  IconAd,
  IconCashRegister,
  IconDashboard,
  IconReceipt,
  IconActivity,
  IconWallet,
  IconUsers,
} from "@tabler/icons-react";
import { useAppContext } from "@/context/app-provider";

// base items used by advertisers (non-admins)
const navItemsAdvertiser = [
  {
    title: "Ad Accounts",
    href: "/accounts",
    icon: IconAd,
  },
  {
    title: "Topups",
    href: "/top-ups",
    icon: IconCashRegister,
  },
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: IconDashboard,
  },
  {
    title: "Wallet",
    href: "/wallet",
    icon: IconWallet,
  },
  {
    title: "Invoices",
    href: "/invoices",
    icon: IconReceipt,
  },
];

// items shown to administrators
const navItemsAdmin = [
  {
    title: "Users",
    href: "/users",
    icon: IconUsers,
  },
  {
    title: "Ad Accounts",
    href: "/accounts",
    icon: IconAd,
  },
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: IconDashboard,
  },
  {
    title: "Topups",
    href: "/top-ups",
    icon: IconCashRegister,
  },
  {
    title: "Wallet Topups",
    href: "/wallet-topups",
    icon: IconWallet,
  },
];

export function MobileNav() {
  const pathname = usePathname();
  const { profile, isSuperAdmin } = useAppContext();

  // pick appropriate set based on role
  const navItems =
    profile?.role === "admin" ? navItemsAdmin : navItemsAdvertiser;

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background/80 backdrop-blur-lg">
      <nav className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.title}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <div className="relative">
                <Icon size={24} stroke={isActive ? 2 : 1.5} />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />
                )}
              </div>
              <span className="text-[10px] font-medium">{item.title}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
