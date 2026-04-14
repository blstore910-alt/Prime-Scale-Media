"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Control,
  Resolver,
  useForm,
  useWatch,
  UseFormSetValue,
} from "react-hook-form";
import * as z from "zod";
import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PLATFORMS, TIMEZONES } from "@/lib/constants";
import { AdAccount } from "@/lib/types/account";
import InputField from "../form/input-field";
import SelectField from "../form/select-field";
import SwitchField from "../form/switch-field";
import TextareaField from "../form/textarea-field";
import { Button } from "../ui/button";
import { DialogFooter } from "../ui/dialog";
import useUpdateAccount from "./use-update-account";

const validations = z
  .object({
    name: z.string().min(1, "Name is required"),
    bm_id: z.string().optional(),
    fee: z.coerce.number().min(0).max(100),
    advertiser_id: z.string().min(1, "Advertiser is required"),
    platform: z.string().min(1, "Platform is required"),
    is_active: z.boolean(),
    airtable: z.boolean(),
    start_date: z.string().min(1, "Start date is required"),
    timezone: z.string().min(1, "Timezone is required"),
    notes: z.string().optional(),
    website_url: z.string().url("Invalid URL").optional().or(z.literal("")),

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

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getCountries(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .join(", ");
  }
  return typeof value === "string" ? value : "";
}

function normalizeTimezone(value: string | null | undefined) {
  if (!value) return "";

  const raw = value.trim();
  if (!raw) return "";

  const exact = TIMEZONES.find((timezone) => timezone.value === raw);
  if (exact) return exact.value;

  const byLabel = TIMEZONES.find((timezone) => timezone.label === raw);
  if (byLabel) return byLabel.value;

  const candidate = raw.match(/\(([^)]+)\)$/)?.[1] ?? raw;
  const byIana = TIMEZONES.find((timezone) =>
    timezone.value.includes(`(${candidate})`),
  );
  if (byIana) return byIana.value;

  return raw;
}

function getInitialValues(account: AdAccount): FormValues {
  const metadata = (account.metadata as Record<string, unknown> | null) ?? null;

  return {
    name: account.name ?? "",
    bm_id: account.bm_id ? String(account.bm_id) : "",
    fee: account.fee ?? 0,
    advertiser_id: account.advertiser_id ?? "",
    platform: account.platform ?? "",
    is_active: account.status === "active",
    airtable: account.airtable ?? false,
    start_date: account.start_date ?? new Date().toISOString(),
    timezone: normalizeTimezone(account.timezone),
    notes: account.notes ?? "",
    website_url: account.website_url ?? "",
    google_email: getString(metadata?.google_email),
    tiktok_business_center_id: getString(metadata?.tiktok_business_center_id),
    tiktok_email: getString(metadata?.tiktok_email),
    tiktok_countries: getCountries(metadata?.tiktok_countries),
    facebook_business_manager_id: getString(
      metadata?.facebook_business_manager_id,
    ),
    personal_facebook_profile_link: getString(
      metadata?.personal_facebook_profile_link,
    ),
  };
}

function getAdvertiserLabel(account: AdAccount) {
  const clientCode = account.advertiser?.tenant_client_code;
  const fullName = account.advertiser?.profile?.full_name;

  if (!clientCode && !fullName) {
    return account.advertiser_id;
  }

  return (
    <span className="inline-flex w-full justify-between">
      <span>{clientCode ? `${clientCode}:` : ""}</span>
      &nbsp;
      <span>{fullName || account.advertiser_id}</span>&nbsp;&nbsp;
    </span>
  );
}

export default function UpdateAccountForm({
  account,
  setOpen,
}: {
  account: AdAccount;
  setOpen: (open: boolean) => void;
}) {
  const initialValues = useMemo(() => getInitialValues(account), [account]);
  const timezoneOptions = useMemo(() => {
    if (!initialValues.timezone) return TIMEZONES;

    const exists = TIMEZONES.some(
      (timezone) => timezone.value === initialValues.timezone,
    );
    if (exists) return TIMEZONES;

    return [
      { label: initialValues.timezone, value: initialValues.timezone },
      ...TIMEZONES,
    ];
  }, [initialValues.timezone]);

  const { control, handleSubmit, watch, setValue, reset } = useForm<FormValues>(
    {
      defaultValues: initialValues,
      resolver: zodResolver(validations) as Resolver<FormValues>,
    },
  );

  useEffect(() => {
    reset(initialValues);
  }, [initialValues, reset]);

  const selectedPlatform = watch("platform");
  const isActive = watch("is_active");
  const queryClient = useQueryClient();
  const { updateAccount, isPending } = useUpdateAccount();

  const handleUpdateAccount = (values: FormValues) => {
    let metadata: Record<string, unknown> = {};

    if (values.platform === "google") {
      metadata = { google_email: values.google_email };
    } else if (values.platform === "tiktok") {
      metadata = {
        tiktok_business_center_id: values.tiktok_business_center_id,
        tiktok_email: values.tiktok_email,
        tiktok_countries:
          values.tiktok_countries
            ?.split(",")
            .map((country) => country.trim())
            .filter(Boolean) || [],
      };
    } else if (values.platform.includes("meta")) {
      metadata = {
        facebook_business_manager_id: values.facebook_business_manager_id,
        personal_facebook_profile_link: values.personal_facebook_profile_link,
      };
    }

    updateAccount(
      {
        id: account.id,
        payload: {
          name: values.name,
          bm_id: values.bm_id || null,
          fee: values.fee,
          advertiser_id: values.advertiser_id,
          platform: values.platform,
          status: values.is_active ? "active" : "inactive",
          timezone: values.timezone,
          notes: values.notes || null,
          website_url: values.website_url || null,
          metadata,
        },
      },
      {
        onSuccess: () => {
          toast.success("Ad Account updated successfully.");
          setOpen(false);
          queryClient.invalidateQueries({
            queryKey: ["account-details", account.id],
          });
        },
        onError: (error) => {
          toast.error("Error updating ad account", {
            description: error.message,
          });
        },
      },
    );
  };

  return (
    <>
      <form
        id="update-account-form"
        onSubmit={handleSubmit(handleUpdateAccount)}
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto overflow-x-hidden px-1">
          <SelectField
            label="Select Platform"
            name="platform"
            id="update-platform-select"
            control={control}
            options={PLATFORMS}
            placeholder="Select"
          />

          <InputField
            label="Account Name"
            name="name"
            id="update-account-name"
            placeholder="e.g. AA-B-00-1111"
            control={control}
            className="placeholder:normal-case"
          />

          <SelectField
            label="Select Advertiser"
            name="advertiser_id"
            id="update-advertiser-select"
            control={control}
            options={[
              {
                value: account.advertiser_id,
                label: getAdvertiserLabel(account),
              },
            ]}
            placeholder="Select"
            disabled
          />

          <InputField
            label="Fee (%)"
            name="fee"
            id="update-fee-percent"
            type="number"
            control={control}
          />

          <SwitchField
            label="Account Status"
            description={isActive ? "Active" : "Inactive"}
            name="is_active"
            id="update-account-status"
            control={control}
          />

          <SelectField
            label="Timezone"
            name="timezone"
            id="update-timezone-select"
            control={control}
            options={timezoneOptions}
            placeholder="Select Timezone"
          />

          {selectedPlatform === "google" && <GoogleFields control={control} />}
          {selectedPlatform === "tiktok" && <TikTokFields control={control} />}
          {selectedPlatform && selectedPlatform.includes("meta") && (
            <MetaFields control={control} setValue={setValue} />
          )}

          <InputField
            label="Website URL"
            name="website_url"
            id="update-website-url"
            placeholder="https://example.com"
            control={control}
          />

          <TextareaField
            label="Notes"
            name="notes"
            id="update-account-notes"
            placeholder="Add notes..."
            control={control}
          />
        </div>
      </form>
      <DialogFooter className="mt-4">
        <Button type="submit" form="update-account-form">
          {isPending && <Loader2 className="animate-spin" />}
          <span>Update Account</span>
        </Button>
      </DialogFooter>
    </>
  );
}
