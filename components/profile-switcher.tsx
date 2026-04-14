import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { ArrowUpCircleIcon, ChevronDownIcon, Loader2 } from "lucide-react";
import { SidebarMenuButton } from "./ui/sidebar";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAppContext } from "@/context/app-provider";
import { UserProfile } from "@/lib/types/user";
import { changeProfile } from "@/actions/user-actions";
import { usePathname } from "next/navigation";
import { Button } from "./ui/button";
import Link from "next/link";

type SwitcherButtonType = React.ElementType<{
  className: string;
  asChild?: boolean;
  size: "sm" | "lg" | "default";
  variant: "default" | "outline";
}>;

export default function ProfileSwitcher({
  switcher: SwitcherButton = SidebarMenuButton,
}: {
  switcher: SwitcherButtonType;
}) {
  const { profile } = useAppContext();
  const [isPending, startTransition] = React.useTransition();
  const pathname = usePathname();
  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*, tenant:tenants(name, id)")
        .eq("user_id", sessionData.session?.user.id);
      if (error) throw error;
      return data;
    },
  });

  const isAdmin = profile?.role === "admin";

  const handleProfileChange = async (value: string) => {
    if (value === profile?.id) return;
    startTransition(async () => {
      await changeProfile(value, pathname);
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SwitcherButton
          size={isAdmin ? "sm" : "default"}
          variant={isAdmin ? "default" : "outline"}
          asChild
          disabled
          className="data-[slot=sidebar-menu-button]:p-1.5! w-full justify-between"
        >
          <button className="flex items-center w-full justify-between">
            <span className="flex items-center gap-2">
              <ArrowUpCircleIcon className="h-5 w-5" />
              <span className="text-base font-semibold">
                {profile?.tenant?.name ?? "Organization"}
              </span>
            </span>
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ChevronDownIcon className="h-4 w-4 opacity-70" />
            )}
          </button>
        </SwitcherButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-(--radix-dropdown-menu-trigger-width)"
        side="bottom"
        align="start"
      >
        <DropdownMenuLabel>Your Organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={profile?.id}
          onValueChange={handleProfileChange}
        >
          {profiles?.length ? (
            profiles.map((profile: UserProfile) => (
              <DropdownMenuRadioItem
                value={profile.id}
                key={profile.id}
                className="justify-between"
              >
                <span>{profile.tenant?.name}</span>
                <span className="capitalize text-muted-foreground">
                  {profile.role}
                </span>
              </DropdownMenuRadioItem>
            ))
          ) : (
            <div className="text-center py-2">
              <p className="text-sm text-center text-muted-foreground">
                {"You don't have any other organization"}
              </p>
              <Button variant={"link"} asChild>
                <Link href={"/organization/new"}>Create New</Link>
              </Button>
            </div>
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
