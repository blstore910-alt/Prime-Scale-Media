"use client";
import { useAppContext } from "@/context/app-provider";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
const commonLinks = [{ href: "/settings/general", label: "General" }];

const adminLinks = [
  ...commonLinks,
  { href: "/settings/finance", label: "Finance" },
  { href: "/settings/ad-account-types", label: "Ad account types" },
  { href: "/settings/plans", label: "Plans" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/banks", label: "Banks" },
];

export default function SettingsNavbar() {
  const pathname = usePathname();
  const { profile } = useAppContext();
  const links = profile?.role === "admin" ? adminLinks : commonLinks;
  return (
    /* The strip spans the page, but its CONTENT lines up with the cards
       below it. It used to be w-full with its own padding while every
       settings page is max-w-3xl and centred, so the tabs and the rule under
       them ran wider than the card they belong to — which reads as two
       layouts stacked rather than one page. */
    <nav
      aria-label="Section"
      className="sticky top-0 z-10 mt-4 w-full bg-background/95 backdrop-blur"
    >
      {/* Own scroller: the tab strip is wider than a phone, and without this
          it pushed the whole settings page sideways instead of scrolling. */}
      <ul className="mx-auto flex max-w-3xl items-center gap-1 overflow-x-auto border-b px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
