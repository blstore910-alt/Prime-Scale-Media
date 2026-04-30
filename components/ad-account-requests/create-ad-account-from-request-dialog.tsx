"use client";

import InputField from "@/components/form/input-field";
import SelectField from "@/components/form/select-field";
import { useAppContext } from "@/context/app-provider";
import { PLATFORMS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { AdAccountRequest } from "@/lib/types/ad-account-request";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Resolver, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

const META_PLATFORM_OPTIONS = PLATFORMS.filter((platform) =>
  platform.value.includes("meta"),
);

const schema = z.object({
  name: z.string().min(1, "Account name is required"),
  fee: z.coerce.number().min(0).max(100),
  platform: z.string().min(1, "Platform is required"),
});

type FormValues = z.infer<typeof schema>;

function mapRequestedPlatform(platform: string | null) {
  if (!platform) return "";
  if (PLATFORMS.some((item) => item.value === platform)) return platform;
  if (platform === "google-ads") return "google";
  if (platform === "tiktok-ads") return "tiktok";
  if (platform === "meta-ads" || platform.includes("meta")) {
    return META_PLATFORM_OPTIONS[0]?.value || "";
  }
  if (platform.includes("google")) return "google";
  if (platform.includes("tiktok")) return "tiktok";
  return "";
}

function isMetaRequest(platform: string | null) {
  return (platform || "").includes("meta");
}

function toBmId(metadata: Record<string, unknown> | null | undefined) {
  const raw = metadata?.facebook_business_manager_id;
  if (raw === null || raw === undefined || raw === "") return null;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

export default function CreateAdAccountFromRequestDialog({
  request,
  open,
  onOpenChange,
}: {
  request: AdAccountRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user, profile } = useAppContext();
  const queryClient = useQueryClient();

  const defaultPlatform = useMemo(
    () => mapRequestedPlatform(request?.platform || null),
    [request?.platform],
  );
  const shouldShowMetaPlatformSelect = isMetaRequest(request?.platform || null);

  const form = useForm<FormValues>({
    defaultValues: {
      name: "",
      fee: 0,
      platform: defaultPlatform,
    },
    resolver: zodResolver(schema) as Resolver<FormValues>,
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: "",
      fee: 0,
      platform: mapRequestedPlatform(request?.platform || null),
    });
  }, [open, request?.id, request?.platform, form]);

  const metadata =
    (request?.metadata as Record<string, unknown> | null | undefined) ?? null;
  const { mutate, isPending } = useMutation({
    mutationKey: ["create-account-from-request", request?.id],
    mutationFn: async (values: FormValues) => {
      if (!request) throw new Error("Request not found.");
      if (!request.advertiser_id) {
        throw new Error("This request has no advertiser to assign.");
      }
      if (!user?.id) throw new Error("User not found.");

      const supabase = createClient();

      const accountPayload = {
        name: values.name,
        bm_id: values.platform.includes("meta") ? toBmId(metadata) : null,
        fee: values.fee,
        currency: request.currency,
        advertiser_id: request.advertiser_id,
        platform: values.platform,
        airtable: false,
        start_date: new Date().toISOString(),
        timezone: request.timezone || "UTC",
        notes: request.notes || null,
        website_url: request.website_url || null,
        created_by: user.id,
        tenant_id: request.tenant_id || profile?.tenant_id,
        metadata: metadata || {},
      };

      const { error: createError } = await supabase
        .from("ad_accounts")
        .insert(accountPayload);

      if (createError) throw new Error(createError.message);

      const { error: requestUpdateError } = await supabase
        .from("ad_account_requests")
        .update({ status: "completed", rejection_reason: null })
        .eq("id", request.id);

      if (requestUpdateError) {
        throw new Error(
          "Ad account created, but failed to update request status.",
        );
      }
    },
    onSuccess: () => {
      toast.success("Ad account created from request.");
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["ad-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["ad-account-requests"] });
      if (request?.id) {
        queryClient.invalidateQueries({
          queryKey: ["ad-account-request-details", request.id],
        });
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create ad account.");
      queryClient.invalidateQueries({ queryKey: ["ad-accounts"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-96">
        <DialogHeader>
          <DialogTitle>Create Ad Account</DialogTitle>
          <DialogDescription>
            Complete the required fields to create an ad account from this
            request.
          </DialogDescription>
        </DialogHeader>

        <form
          id="create-account-from-request-form"
          onSubmit={form.handleSubmit((values) => mutate(values))}
        >
          <div className="max-h-[68vh] overflow-y-auto space-y-4 px-1 py-1">
            <InputField
              label="Account Name"
              name="name"
              id="request-account-name"
              placeholder="e.g. AA-B-00-1111"
              control={form.control}
            />

            <InputField
              label="Fee (%)"
              name="fee"
              id="request-account-fee"
              type="number"
              control={form.control}
            />

            {shouldShowMetaPlatformSelect ? (
              <SelectField
                label="Platform"
                name="platform"
                id="request-platform-select"
                control={form.control}
                options={META_PLATFORM_OPTIONS}
                placeholder="Select Meta Platform"
              />
            ) : (
              <div className="rounded-md border px-3 py-2 text-sm">
                <span className="text-muted-foreground">Platform:</span>{" "}
                <span className="font-medium">
                  {PLATFORMS.find(
                    (platform) => platform.value === form.watch("platform"),
                  )?.label ||
                    form.watch("platform") ||
                    "-"}
                </span>
              </div>
            )}
          </div>
        </form>

        <DialogFooter className="mt-2">
          <Button
            variant="ghost"
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-account-from-request-form"
            disabled={isPending}
          >
            {isPending && <Loader2 className="animate-spin" />}
            Create Ad Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
