"use client";

import { Button } from "@/components/ui/button";
import { signOutCompletely } from "@/lib/auth/sign-out";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    setIsLoading(true);
    await signOutCompletely();
    router.refresh();
    router.push("/auth/login");
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleLogout}
      disabled={isLoading}
      className="text-muted-foreground hover:text-foreground"
    >
      {isLoading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <LogOut className="h-4 w-4 mr-2" />
      )}
      Log out
    </Button>
  );
}
