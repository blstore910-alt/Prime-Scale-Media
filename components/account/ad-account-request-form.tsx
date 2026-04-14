"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Resolver, useForm, Control, Controller } from "react-hook-form";
import * as z from "zod";
import { useEffect } from "react";
import InputField from "../form/input-field";
import SelectField from "../form/select-field";
import TextareaField from "../form/textarea-field";
import { DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { toast } from "sonner";
import { TIMEZONES } from "@/lib/constants";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useAppContext } from "@/context/app-provider";
import { useCreateAdAccountRequest } from "@/hooks/use-create-ad-account-request";

const validations = z
  .object({
    platform: z.enum(["meta-ads", "tiktok-ads", "google-ads"]),
    currency: z.enum(["USD", "EUR"]),
    timezone: z.string().min(1, "Timezone is required"),
    notes: z.string().optional(),
    website_url: z.string().url("Invalid URL").optional().or(z.literal("")),

    // Metadata fields
    google_email: z.string().optional(),
    tiktok_business_center_id: z.string().optional(),
    tiktok_email: z.string().optional(),
    tiktok_countries: z.string().optional(),
    facebook_business_manager_id: z.string().optional(),
    personal_facebook_profile_link: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.platform === "google-ads") {
      if (!data.google_email) {
        ctx.addIssue({
          code: "custom",
          message: "Google Email is required",
          path: ["google_email"],
        });
      } else if (!z.string().email().safeParse(data.google_email).success) {
        ctx.addIssue({
          code: "custom",
          message: "Invalid email address",
          path: ["google_email"],
        });
      }
    }

    if (data.platform === "tiktok-ads") {
      if (!data.tiktok_business_center_id) {
        ctx.addIssue({
          code: "custom",
          message: "Business Center ID is required",
          path: ["tiktok_business_center_id"],
        });
      }
      if (!data.tiktok_email) {
        ctx.addIssue({
          code: "custom",
          message: "TikTok Email is required",
          path: ["tiktok_email"],
        });
      } else if (!z.string().email().safeParse(data.tiktok_email).success) {
        ctx.addIssue({
          code: "custom",
          message: "Invalid email address",
          path: ["tiktok_email"],
        });
      }
      if (!data.tiktok_countries) {
        ctx.addIssue({
          code: "custom",
          message: "Countries list is required",
          path: ["tiktok_countries"],
        });
      }
    }

    if (data.platform === "meta-ads") {
      if (!data.facebook_business_manager_id) {
        ctx.addIssue({
          code: "custom",
          message: "FB Business Manager ID is required",
          path: ["facebook_business_manager_id"],
        });
      }
      if (!data.personal_facebook_profile_link) {
        ctx.addIssue({
          code: "custom",
          message: "Personal FB Profile Link is required",
          path: ["personal_facebook_profile_link"],
        });
      } else if (
        !z.string().url().safeParse(data.personal_facebook_profile_link).success
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Invalid URL",
          path: ["personal_facebook_profile_link"],
        });
      }
    }
  });

type FormValues = z.infer<typeof validations>;

const defaultValues: FormValues = {
  platform: "meta-ads",
  currency: "EUR",
  timezone: "",
  notes: "",
  website_url: "",
  // Metadata fields
  google_email: "",
  tiktok_business_center_id: "",
  tiktok_email: "",
  tiktok_countries: "",
  facebook_business_manager_id: "",
  personal_facebook_profile_link: "",
};

// Sub-components for platform specific fields
const GoogleFields = ({ control }: { control: Control<FormValues> }) => (
  <div className="my-4">
    <InputField
      label="Google Email"
      name="google_email"
      id="google-email"
      placeholder="email@example.com"
      control={control}
    />
  </div>
);

const TikTokFields = ({ control }: { control: Control<FormValues> }) => (
  <div className="my-4 space-y-4">
    <InputField
      label="Business Center ID"
      name="tiktok_business_center_id"
      id="tiktok-bc-id"
      placeholder="Enter Business Center ID"
      control={control}
    />
    <InputField
      label="TikTok Account Email"
      name="tiktok_email"
      id="tiktok-email"
      placeholder="email@example.com"
      control={control}
    />
    <InputField
      label="Countries"
      name="tiktok_countries"
      id="tiktok-countries"
      placeholder="US, UK, CA (comma separated)"
      control={control}
    />
  </div>
);

const MetaFields = ({ control }: { control: Control<FormValues> }) => (
  <div className="my-4 space-y-4">
    <InputField
      label="Facebook Business Manager ID"
      name="facebook_business_manager_id"
      id="fb-bm-id"
      placeholder="Enter FB BM ID"
      control={control}
    />
    <InputField
      label="Personal Facebook Profile Link"
      name="personal_facebook_profile_link"
      id="fb-profile-link"
      placeholder="https://facebook.com/username"
      control={control}
    />
  </div>
);

// Logos
const GoogleLogo = () => (
  <svg
    viewBox="0 0 24 24"
    className="w-6 h-6"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

const TikTokLogo = () => (
  <svg
    fill="currentColor"
    viewBox="0 0 24 24"
    className="w-6 h-6 text-black dark:text-white"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
  </svg>
);

const MetaLogoSimple = () => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className="w-6 h-6 text-blue-600"
  >
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-4.42 3.58-8 8-8s8 3.58 8 8-3.58 8-8 8z" />
    <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
  </svg>
);

export default function AdAccountRequestForm({
  setOpen,
}: {
  setOpen: (open: boolean) => void;
}) {
  const { profile } = useAppContext();
  const { mutate, isPending } = useCreateAdAccountRequest();

  const { control, handleSubmit, reset, watch, setValue } = useForm<FormValues>(
    {
      defaultValues,
      resolver: zodResolver(validations) as Resolver<FormValues>,
    },
  );

  const selectedPlatform = watch("platform");
  const selectedCurrency = watch("currency");

  // Auto-switch currency to USD if EUR is selected and platform is not meta-ads
  useEffect(() => {
    if (selectedPlatform !== "meta-ads" && selectedCurrency === "EUR") {
      setValue("currency", "USD");
    }
  }, [selectedPlatform, selectedCurrency, setValue]);

  const onSubmit = (values: FormValues) => {
    if (!profile) {
      toast.error("User profile not found");
      return;
    }

    // Get advertiser_id from profile
    const advertiser_id = profile.advertiser?.[0]?.id || null;

    // Build metadata object based on platform
    let metadata: Record<string, unknown> = {};

    if (values.platform === "google-ads") {
      metadata = {
        google_email: values.google_email,
      };
    } else if (values.platform === "tiktok-ads") {
      metadata = {
        tiktok_business_center_id: values.tiktok_business_center_id,
        tiktok_email: values.tiktok_email,
        tiktok_countries: values.tiktok_countries,
      };
    } else if (values.platform === "meta-ads") {
      metadata = {
        facebook_business_manager_id: values.facebook_business_manager_id,
        personal_facebook_profile_link: values.personal_facebook_profile_link,
      };
    }

    mutate(
      {
        advertiser_id,
        tenant_id: profile.tenant_id,
        email: profile.email,
        platform: values.platform,
        currency: values.currency,
        timezone: values.timezone,
        website_url: values.website_url || undefined,
        notes: values.notes || undefined,
        metadata,
      },
      {
        onSuccess: () => {
          reset();
          setOpen(false);
        },
      },
    );
  };

  return (
    <>
      <form id="ad-account-request-form" onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-6 max-h-[70vh] overflow-y-auto px-1 py-2">
          {/* Platform Radio Group */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Select Platform</Label>
            <Controller
              control={control}
              name="platform"
              render={({ field }) => (
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-4"
                >
                  <div>
                    <RadioGroupItem
                      value="meta-ads"
                      id="meta-ads"
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor="meta-ads"
                      className="flex sm:flex-col items-center sm:justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:ring-2 peer-data-[state=checked]:ring-primary cursor-pointer transition-all"
                    >
                      <MetaLogoSimple />
                      <span className=" font-semibold">Meta Ads</span>
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem
                      value="tiktok-ads"
                      id="tiktok-ads"
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor="tiktok-ads"
                      className="flex sm:flex-col items-center sm:justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:ring-2 peer-data-[state=checked]:ring-primary cursor-pointer transition-all"
                    >
                      <TikTokLogo />
                      <span className=" font-semibold">TikTok Ads</span>
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem
                      value="google-ads"
                      id="google-ads"
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor="google-ads"
                      className="flex sm:flex-col items-center sm:justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:ring-2 peer-data-[state=checked]:ring-primary cursor-pointer transition-all"
                    >
                      <GoogleLogo />
                      <span className=" font-semibold">Google Ads</span>
                    </Label>
                  </div>
                </RadioGroup>
              )}
            />
            {control.getFieldState("platform").error && (
              <p className="text-sm font-medium text-destructive">
                {control.getFieldState("platform").error?.message}
              </p>
            )}
          </div>
          {/* Currency Radio Group */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Currency</Label>
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <RadioGroup
                  onValueChange={field.onChange}
                  value={field.value}
                  className="grid grid-cols-2 gap-4"
                >
                  <div>
                    <RadioGroupItem
                      value="USD"
                      id="usd"
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor="usd"
                      className="flex flex-row items-center justify-center gap-2 rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:ring-2 peer-data-[state=checked]:ring-primary cursor-pointer transition-all"
                    >
                      <span className="text-xl">$</span>
                      <span className="font-semibold">USD</span>
                    </Label>
                  </div>
                  {selectedPlatform === "meta-ads" && (
                    <div>
                      <RadioGroupItem
                        value="EUR"
                        id="eur"
                        className="peer sr-only"
                      />
                      <Label
                        htmlFor="eur"
                        className="flex flex-row items-center justify-center gap-2 rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:ring-2 peer-data-[state=checked]:ring-primary cursor-pointer transition-all"
                      >
                        <span className="text-xl">€</span>
                        <span className="font-semibold">EUR</span>
                      </Label>
                    </div>
                  )}
                </RadioGroup>
              )}
            />
            {control.getFieldState("currency").error && (
              <p className="text-sm font-medium text-destructive">
                {control.getFieldState("currency").error?.message}
              </p>
            )}
          </div>

          <SelectField
            label="Timezone"
            name="timezone"
            id="timezone-select"
            control={control}
            options={TIMEZONES}
            placeholder="Select Timezone"
          />

          {/* Platform Specific Metadata Fields */}
          {selectedPlatform === "google-ads" && (
            <GoogleFields control={control} />
          )}
          {selectedPlatform === "tiktok-ads" && (
            <TikTokFields control={control} />
          )}
          {selectedPlatform === "meta-ads" && <MetaFields control={control} />}

          <InputField
            label="Website URL"
            name="website_url"
            id="website-url"
            placeholder="https://example.com"
            control={control}
          />

          <TextareaField
            label="Notes"
            name="notes"
            id="account-notes"
            placeholder="Add notes..."
            control={control}
          />
        </div>
      </form>
      <DialogFooter className="mt-4">
        <Button
          type="submit"
          form="ad-account-request-form"
          disabled={isPending}
        >
          <span>{isPending ? "Submitting..." : "Submit Request"}</span>
        </Button>
      </DialogFooter>
    </>
  );
}
