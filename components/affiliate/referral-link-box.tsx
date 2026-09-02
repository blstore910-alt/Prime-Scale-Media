"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppContext } from "@/context/app-provider";
import { getURL } from "@/lib/utils";
import { Copy } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

// The affiliate's shareable sign-up link. Extracted so both the
// advertiser-as-affiliate and standalone-affiliate views can show it
// above the dashboard.
export default function ReferralLinkBox() {
  const { profile } = useAppContext();
  const tenantSlug = profile?.tenant?.slug;
  const referralCode = profile?.advertiser?.[0]?.tenant_client_code;

  const referralLink = useMemo(() => {
    if (!tenantSlug || !referralCode) return "";
    const baseUrl = getURL().replace(/\/$/, "");
    const url = new URL(`${baseUrl}/auth/sign-up`);
    url.searchParams.set("t", tenantSlug);
    url.searchParams.set("ref", referralCode);
    return url.toString();
  }, [tenantSlug, referralCode]);

  const handleCopy = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      toast.success("Referral link copied.");
    } catch (error) {
      toast.error("Failed to copy referral link.", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Your referral link</p>
          <p className="text-xs text-muted-foreground">
            Share this link — anyone who signs up through it is tracked as your
            referral.
          </p>
        </div>
        {referralLink ? (
          <div className="flex w-full flex-1 items-center gap-2 sm:max-w-xl">
            <Input value={referralLink} readOnly className="truncate" />
            <Button
              variant="outline"
              onClick={handleCopy}
              aria-label="Copy referral link"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground sm:max-w-xs sm:text-right">
            Your referral link isn&apos;t set up yet — an admin needs to assign
            you a client code first.
          </p>
        )}
      </div>
    </div>
  );
}
