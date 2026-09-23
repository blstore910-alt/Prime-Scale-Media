"use client";

import InputField from "@/components/form/input-field";
import SelectField from "@/components/form/select-field";
import { useAppContext } from "@/context/app-provider";
import { PLATFORMS } from "@/lib/constants";
import { useAdAccountTypes } from "@/hooks/use-ad-account-types";
import { platformGroupFromSlug } from "@/lib/types/ad-account-type";
import { AdAccountRequest } from "@/lib/types/ad-account-request";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
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
    // A request only says "meta". WHICH Meta account -- EU, HK premium,
    // ... -- sets our supplier cost and the customer's fee, so it is the
    // admin's decision. Preselecting the first entry in the list shipped
    // AA-PSM0005-EU-02 as Hong Kong premium for a customer who asked for
    // EU, without anybody choosing anything. Empty, so the select shows
    // its "Select Meta Platform" placeholder and the schema (min(1))
    // refuses to submit until a person has picked one.
    return "";
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
  const { user } = useAppContext();
  const queryClient = useQueryClient();
  const { types, bySlug, isLoading: typesLoading } = useAdAccountTypes();
  // The map arrives twice -- once as the seed, once from the database --
  // and a new identity each time. In the dependency list below that ran
  // the reset a SECOND time, ~200ms after opening, wiping whatever the
  // admin had already typed into Account Name.
  const bySlugRef = useRef(bySlug);
  bySlugRef.current = bySlug;

  const metaOptions = useMemo(
    () =>
      types
        .filter((t) => t.platform_group === "meta")
        .map((t) => ({ label: t.label, value: t.slug })),
    [types],
  );

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

  // ── THE RESET HAS TO CARRY THE DEFAULT FEE TOO ─────────────────────
  //
  // This reset fee to 0 on every open, and the auto-fill below only
  // fires when the platform CHANGES. The dialog is mounted persistently
  // on /ad-account-requests, so the SECOND request of the same platform
  // in a session opened showing 0 and saved 0 — and PSM then earns 0% on
  // every future top-up on that account, for ever, silently.
  //
  // assignSupplierAdAccount treats exactly this as a refusal: "a fee we
  // were not given is a refusal, not a default". This path had no
  // equivalent, so the reset does the lookup itself.
  useEffect(() => {
    if (!open) return;
    // One reset, once the types are known. Resetting with the seed and
    // then again with the truth throws away what was typed in between.
    if (typesLoading) return;
    const slug = mapRequestedPlatform(request?.platform || null);
    const t = slug ? bySlugRef.current.get(slug) : undefined;
    if (slug && !t) {
      // "A fee we were not given is a refusal, not a default" -- so say
      // so instead of writing a silent 0 into an editable box.
      toast.error("We couldn't read the default fee for this platform", {
        description: "Set the fee by hand before saving — 0% is not a default.",
      });
    }
    form.reset({
      name: "",
      fee: t ? Number(t.default_fee_pct) : 0,
      platform: slug,
    });
  }, [open, request?.id, request?.platform, form, typesLoading]);

  // Auto-fill the fee from the selected type's default when the platform
  // changes (still editable). Ref-guarded so mount doesn't clobber.
  const watchedPlatform = form.watch("platform");
  const prevPlatformRef = useRef(watchedPlatform);
  useEffect(() => {
    if (watchedPlatform && watchedPlatform !== prevPlatformRef.current) {
      const t = bySlug.get(watchedPlatform);
      if (t) form.setValue("fee", t.default_fee_pct);
    }
    prevPlatformRef.current = watchedPlatform;
  }, [watchedPlatform, bySlug, form]);

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

      const { createAdAccountFromRequest } = await import(
        "@/actions/ad-account-actions"
      );
      const result = await createAdAccountFromRequest(request.id, {
        name: values.name,
        bm_id:
          platformGroupFromSlug(values.platform) === "meta"
            ? toBmId(metadata)
            : null,
        fee: values.fee,
        currency: request.currency,
        platform: values.platform,
        airtable: false,
        timezone: request.timezone || "UTC",
        notes: request.notes || null,
        website_url: request.website_url || null,
        metadata: metadata || {},
      });
      if (!result.ok) throw new Error(result.error);
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
          {/* dvh and smaller: 68vh plus a header plus a footer is past the
            92dvh sheet, which pushed the Create button below the fold
            behind a nested scroller. */}
        <div className="max-h-[55dvh] overflow-y-auto space-y-4 px-1 py-1">
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
                options={metaOptions.length ? metaOptions : META_PLATFORM_OPTIONS}
                placeholder="Select Meta Platform"
              />
            ) : (
              <div className="rounded-md border px-3 py-2 text-sm">
                <span className="text-muted-foreground">Platform:</span>{" "}
                <span className="font-medium">
                  {bySlug.get(form.watch("platform"))?.label ||
                    PLATFORMS.find(
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
