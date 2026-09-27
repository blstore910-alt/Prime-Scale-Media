"use client";

import InputField from "@/components/form/input-field";
import SelectField from "@/components/form/select-field";
import { useAppContext } from "@/context/app-provider";
import { toastResult } from "@/lib/action-warning";
import { PLATFORMS } from "@/lib/constants";
import { useAdAccountTypes } from "@/hooks/use-ad-account-types";
import { platformGroupFromSlug } from "@/lib/types/ad-account-type";
import { AdAccountRequest } from "@/lib/types/ad-account-request";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { suggestFeePct } from "@/lib/pure-fee-suggestion";
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

  // ── THE CUSTOMER'S OWN RATE, WHICH THIS DIALOG NEVER READ ─────────
  //
  // The owner, 27-09: "psm 0004 is 5% dus moet hier ook 5% staan en geen
  // 3%."
  //
  // This is the dialog admins actually use — it is how a request becomes
  // an account — and it knew only the ad-account TYPE's default. The
  // advertiser's agreed plan rate was never looked up at all, so every
  // account born here was priced at the type's rate whatever had been
  // agreed with that customer. All five ad accounts on the live tenant
  // came out at 3.00 this way, one of them for a customer on 5%.
  const advertiserId = request?.advertiser_id ?? null;
  const { data: planPct } = useQuery({
    queryKey: ["advertiser-plan-fee", advertiserId],
    enabled: !!advertiserId && open,
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertiser_plans")
        .select("topup_fee_pct")
        .eq("advertiser_id", advertiserId)
        .maybeSingle();
      // A rate we could not read is not "no rate" — throwing leaves the
      // query in error rather than handing back a confident null that
      // would silently price the account at the type default.
      if (error) throw error;
      const n = Number(
        (data as { topup_fee_pct?: number | null } | null)?.topup_fee_pct,
      );
      return Number.isFinite(n) ? n : null;
    },
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
    // Plan rate first, type default second. One shared rule with the
    // ad-account create form — see lib/pure-fee-suggestion.ts.
    const suggested = suggestFeePct({
      planPct,
      typePct: t?.default_fee_pct,
    });
    form.reset({
      name: "",
      fee: suggested.pct ?? 0,
      platform: slug,
    });
  }, [open, request?.id, request?.platform, form, typesLoading, planPct]);

  // Changing the platform re-offers a rate — but through the same rule,
  // so a customer's plan rate survives the change instead of being
  // overwritten by the new type's default.
  const watchedPlatform = form.watch("platform");
  const prevPlatformRef = useRef(watchedPlatform);
  useEffect(() => {
    if (watchedPlatform && watchedPlatform !== prevPlatformRef.current) {
      const t = bySlug.get(watchedPlatform);
      const suggested = suggestFeePct({
        planPct,
        typePct: t?.default_fee_pct,
      });
      // null means we could not work one out. Leaving the box as it is
      // beats writing a 0 that reads as "charge nothing, for ever".
      if (suggested.pct != null) form.setValue("fee", suggested.pct);
    }
    prevPlatformRef.current = watchedPlatform;
  }, [watchedPlatform, bySlug, form, planPct]);

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
      // ── AND CARRY THE WARNING OUT ────────────────────────────────
      //
      // createAdAccountFromRequest returns `warning` when the customer
      // could not be told -- the literal sentence is "The customer was
      // NOT notified: <why>. Tell them by hand." This mutationFn
      // returned undefined, so onSuccess fired a plain green tick and
      // the warning was gone. The account exists, the request is
      // completed, and the person it is for has heard nothing.
      return (result as { warning?: string | null }).warning ?? null;
    },
    onSuccess: (warning) => {
      toastResult(
        { warning: warning ?? undefined },
        "Ad account created from request.",
      );
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
    // NOT DISMISSABLE MID-WRITE. Cancel is disabled while this runs, but
    // Escape, the backdrop and the corner X went straight through -- so
    // the box vanished with the write still in flight and no toast yet.
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isPending) return;
        onOpenChange(next);
      }}
    >
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
