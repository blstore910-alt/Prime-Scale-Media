"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Resolver,
  useForm,
  Control,
  useWatch,
  UseFormSetValue,
} from "react-hook-form";
import * as z from "zod";
import { useEffect } from "react";
import InputField from "../form/input-field";
import SelectField from "../form/select-field";
import TextareaField from "../form/textarea-field";
import { DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAppContext } from "@/context/app-provider";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PLATFORMS, TIMEZONES } from "@/lib/constants";

const defaultValues = {
  name: "",
  bm_id: "",
  fee: 0,
  advertiser_id: "",
  platform: "",
  airtable: false,
  start_date: new Date().toISOString(),
  timezone: "",
  notes: "",
  website_url: "",
  // Meta fields
  google_email: "",
  tiktok_business_center_id: "",
  tiktok_email: "",
  tiktok_countries: "", // Comma separated list
  facebook_business_manager_id: "",
  personal_facebook_profile_link: "",
};

const validations = z
  .object({
    name: z.string().min(1, "Name is required"),
    bm_id: z.string().optional(),
    fee: z.coerce.number().min(0).max(100),
    advertiser_id: z.string().min(1, "Advertiser is required"),
    platform: z.string().min(1, "Platform is required"),
    airtable: z.boolean(),
    start_date: z.string().min(1, "Start date is required"),
    timezone: z.string().min(1, "Timezone is required"),
    notes: z.string().optional(),
    website_url: z.string().optional().or(z.literal("")),

    // Metadata fields
    google_email: z.string().optional(),
    tiktok_business_center_id: z.string().optional(),
    tiktok_email: z.string().optional(),
    tiktok_countries: z.string().optional(),
    facebook_business_manager_id: z.string().optional(),
    personal_facebook_profile_link: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.platform === "google") {
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

    if (data.platform === "tiktok") {
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

    if (data.platform.includes("meta")) {
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

const MetaFields = ({
  control,
  setValue,
}: {
  control: Control<FormValues>;
  setValue: UseFormSetValue<FormValues>;
}) => {
  const fbBmId = useWatch({ control, name: "facebook_business_manager_id" });

  useEffect(() => {
    setValue("bm_id", fbBmId);
  }, [fbBmId, setValue]);

  return (
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
};

export default function AccountForm({
  setOpen,
}: {
  setOpen: (open: boolean) => void;
}) {
  const { control, handleSubmit, reset, watch, setValue } = useForm<FormValues>(
    {
      defaultValues,
      resolver: zodResolver(validations) as Resolver<FormValues>,
    },
  );

  const selectedPlatform = watch("platform");

  const queryClient = useQueryClient();
  const { user, profile, dispatch } = useAppContext();

  const { mutate, isPending } = useMutation({
    mutationKey: ["create-ad-account"],
    mutationFn: async (values: FormValues) => {
      const supabase = createClient();

      // Construct metadata based on platform
      let metadata: Record<
        string,
        string | string[] | number | boolean | null | undefined
      > = {};

      if (values.platform === "google") {
        metadata = { google_email: values.google_email };
      } else if (values.platform === "tiktok") {
        metadata = {
          tiktok_business_center_id: values.tiktok_business_center_id,
          tiktok_email: values.tiktok_email,
          tiktok_countries:
            values.tiktok_countries
              ?.split(",")
              .map((c) => c.trim())
              .filter(Boolean) || [],
        };
      } else if (values.platform.includes("meta")) {
        metadata = {
          facebook_business_manager_id: values.facebook_business_manager_id,
          personal_facebook_profile_link: values.personal_facebook_profile_link,
        };
      }

      // Prepare payload excluding temp form fields
      const payload = {
        name: values.name,
        bm_id: values.bm_id || null,
        fee: values.fee,
        advertiser_id: values.advertiser_id,
        platform: values.platform,
        airtable: values.airtable,
        start_date: new Date().toISOString(),
        timezone: values.timezone,
        notes: values.notes || null,
        website_url: values.website_url || null,
        created_by: user?.id,
        tenant_id: profile?.tenant_id,
        metadata: metadata,
      };
      const { data, error } = await supabase
        .from("ad_accounts")
        .insert(payload)
        .select("*");

      dispatch("close-quick-create");
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("New Ad Account created successfully.");
      reset();
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["ad-accounts"] });
    },
    onError: (error) => {
      toast.error(`Error creating ad account`, { description: error.message });
    },
  });

  const { data: advertisers } = useQuery({
    queryKey: ["advertisers"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertisers")
        .select("*, profile:user_profiles(*)")
        .eq("tenant_id", profile?.tenant_id);
      if (error) throw error;
      return data;
    },
  });

  const options = advertisers?.map((advertiser) => {
    const {
      id,
      tenant_client_code,
      profile: { full_name },
    } = advertiser;
    return {
      value: id,
      label: (
        <span className="inline-flex w-full justify-between">
          <span>{tenant_client_code}:</span>
          &nbsp;
          <span>{`${full_name}`}</span>&nbsp;&nbsp;
        </span>
      ),
    };
  });

  const handleCreateAccount = (values: FormValues) => mutate(values);

  return (
    <>
      <form id="account-form" onSubmit={handleSubmit(handleCreateAccount)}>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto overflow-x-hidden px-1">
          <SelectField
            label="Select Platform"
            name="platform"
            id="platform-select"
            control={control}
            options={PLATFORMS}
            placeholder="Select"
          />

          <InputField
            label="Account Name"
            name="name"
            id="account-name"
            placeholder="e.g. AA-B-00-1111"
            control={control}
            className=" placeholder:normal-case"
          />

          <SelectField
            label="Select Advertiser"
            name="advertiser_id"
            id="advertiser-select"
            control={control}
            options={options || []}
            placeholder="Select"
          />

          <InputField
            label="Fee (%)"
            name="fee"
            id="fee-percent"
            type="number"
            control={control}
          />

          <SelectField
            label="Timezone"
            name="timezone"
            id="timezone-select"
            control={control}
            options={TIMEZONES}
            placeholder="Select Timezone"
          />

          {/* Platform Specific Metadata Fields */}
          {selectedPlatform === "google" && <GoogleFields control={control} />}
          {selectedPlatform === "tiktok" && <TikTokFields control={control} />}
          {selectedPlatform && selectedPlatform.includes("meta") && (
            <MetaFields control={control} setValue={setValue} />
          )}

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
        <Button type="submit" form="account-form">
          {isPending && <Loader2 className="animate-spin" />}
          <span>Create Account</span>
        </Button>
      </DialogFooter>
    </>
  );
}
