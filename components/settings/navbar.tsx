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
    /* The strip is a SURFACE, like the cards under it — same 16px gutter,
       same 14px radius, same border and panel background. It used to be a
       full-bleed white bar with square corners and a hairline under it,
       sitting directly on top of a rounded card: the outer edges lined up
       but the shapes did not, so the two read as different pages stacked.

       The active tab is a filled pill rather than an underline, because an
       underline inside a rounded container lands on the container's own
       curve and looks like a rendering fault. */
    <nav
      aria-label="Section"
      className="sticky top-0 z-10 mx-auto mt-4 w-full max-w-3xl"
    >
      <div className="relative overflow-hidden rounded-[14px] border bg-card p-1 shadow-sm">
        {/* Wider than a phone, so it scrolls in place instead of pushing the
            settings page sideways. The fade says it continues — a tab cut
            dead at the edge reads as broken rather than as more to come. */}
        <ul className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {links.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href} className="shrink-0">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center whitespace-nowrap rounded-[10px] px-3 py-1.5 text-[13px] transition-colors sm:text-sm",
                    active
                      ? "bg-primary/10 font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  )}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-1 right-1 w-7 rounded-r-[13px] bg-gradient-to-l from-card to-transparent"
        />
      </div>
    </nav>
  );
}
