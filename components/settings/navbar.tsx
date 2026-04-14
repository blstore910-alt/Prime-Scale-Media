"use client";
import { useAppContext } from "@/context/app-provider";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
const commonLinks = [{ href: "/settings/general", label: "General" }];

const adminLinks = [
  // ...commonLinks,
  { href: "/settings/finance", label: "Finance" },
];

export default function SettingsNavbar() {
  const pathname = usePathname();
  const { profile } = useAppContext();
  const links = profile?.role === "admin" ? adminLinks : commonLinks;
  return (
    <nav
      aria-label="Section"
      className="w-full px-4 mt-4 sticky top-0 bg-background"
    >
      <ul className="flex items-center gap-1 border-b">
        {links.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative -mb-px inline-flex items-center px-3 py-2 text-sm border-b-2 transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
