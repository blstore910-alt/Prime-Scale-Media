"use client";

import { type LucideIcon } from "lucide-react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { TablerIcon } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavMainItem = {
  title: string;
  url: string;
  icon?: LucideIcon | TablerIcon;
  /**
   * Optional badge count (e.g. pending items). Rendered as a small
   * pill to the right of the label; omitted when 0 or undefined.
   */
  badge?: number;
};

export function NavMain({ items }: { items: NavMainItem[] }) {
  const pathname = usePathname();
  const { isMobile, toggleSidebar } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2"></SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                isActive={pathname.includes(item.url)}
                tooltip={item.title}
                onClick={() => isMobile && toggleSidebar()}
                asChild
              >
                <Link
                  href={item.url}
                  className="flex items-center justify-between w-full"
                >
                  <span className="flex items-center gap-2">
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </span>
                  {typeof item.badge === "number" && item.badge > 0 && (
                    <span
                      aria-label={`${item.badge} pending`}
                      className="ml-auto rounded-full bg-amber-500 text-white text-[10px] font-semibold min-w-5 h-5 px-1.5 inline-flex items-center justify-center tabular-nums"
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
