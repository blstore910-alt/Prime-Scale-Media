"use client";

import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import InputField from "../form/input-field";
import TextareaField from "../form/textarea-field";
import { useProfileData, useUpdateProfile } from "./use-profile-data";
import { Loader2 } from "lucide-react";

const validationSchema = z.object({
  // Profile
  full_name: z.string().min(1, "Full Name is required"),
  email: z.string().email("Invalid email").optional(),

  // Company
  company_name: z.string().optional(),
  official_email: z
    .string()
    .email("Invalid email")
    .optional()
    .or(z.literal("")),
  phone: z.string().optional(),
  website_url: z.string().url("Invalid URL").optional().or(z.literal("")),
  vat_no: z.string().optional(),
  registration_no: z.string().optional(),

  // Address
  address: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  zipcode: z.string().optional(),
});

type FormValues = z.infer<typeof validationSchema>;

export default function GeneralSettings() {
  const { data, isLoading } = useProfileData();
  const { mutate: updateProfile, isPending } = useUpdateProfile();

  if (isLoading || !data) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <GeneralSettingsForm
      data={data}
      updateProfile={updateProfile}
      isPending={isPending}
    />
  );
}

type ProfileData = NonNullable<ReturnType<typeof useProfileData>["data"]>;

function GeneralSettingsForm({
  data,
  updateProfile,
  isPending,
}: {
  data: ProfileData;
  updateProfile: ReturnType<typeof useUpdateProfile>["mutate"];
  isPending: boolean;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(validationSchema),
    defaultValues: {
      full_name: data.profile.full_name || "",
      email: data.profile.email || "",
      company_name: data.company?.name || "",
      official_email: data.company?.official_email || "",
      phone: data.company?.phone || "",
      website_url: data.company?.website_url || "",
      vat_no: data.company?.vat_no || "",
      registration_no: data.company?.registration_no || "",
      address: data.company?.address || "",
      state: data.company?.state || "",
      country: data.company?.country || "",
      zipcode: data.company?.zipcode || "",
    },
  });

  const onSubmit = (values: FormValues) => {
    if (!data?.profile?.id) return;

    updateProfile({
      profileId: data.profile.id,
      advertiserId: data.advertiser?.id,
      profileUpdates: {
        full_name: values.full_name,
        // email: values.email,
      },
      companyUpdates: {
        name: values.company_name,
        official_email: values.official_email || null,
        phone: values.phone || null,
        website_url: values.website_url || null,
        vat_no: values.vat_no || null,
        registration_no: values.registration_no || null,
        address: values.address || null,
        state: values.state || null,
        country: values.country || null,
        zipcode: values.zipcode || null,
      },
    });
  };

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-6 w-full max-w-4xl mx-auto py-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            General Settings
          </h2>
          <p className="text-muted-foreground">
            Manage your account settings and company information.
          </p>
        </div>
      </div>

      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Update your personal details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField
              id="full_name"
              control={form.control}
              name="full_name"
              label="Full Name"
              placeholder="John Doe"
            />
            <InputField
              id="email"
              control={form.control}
              name="email"
              label="Email"
              placeholder="john@example.com"
              // readOnly // Uncomment if email should be read-only
            />
          </div>
        </CardContent>
      </Card>

      {/* Company Information */}
      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
          <CardDescription>
            Manage your company details and contact info.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField
              id="company_name"
              control={form.control}
              name="company_name"
              label="Company Name"
              placeholder="Acme Inc."
            />
            <InputField
              id="phone"
              control={form.control}
              name="phone"
              label="Phone"
              placeholder="+1 (555) 000-0000"
            />
            <InputField
              id="official_email"
              control={form.control}
              name="official_email"
              label="Official Email"
              placeholder="contact@acme.com"
            />
            <InputField
              id="website_url"
              control={form.control}
              name="website_url"
              label="Website URL"
              placeholder="https://acme.com"
            />
            <InputField
              id="registration_no"
              control={form.control}
              name="registration_no"
              label="Registration No"
              placeholder="REG-123456"
            />
            <InputField
              id="vat_no"
              control={form.control}
              name="vat_no"
              label="VAT No"
              placeholder="VAT-123456"
            />
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
          <CardDescription>Billing and correspondence address.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <TextareaField
            control={form.control}
            id="address"
            name="address"
            label="Street Address"
            placeholder="123 Main St"
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InputField
              id="state"
              control={form.control}
              name="state"
              label="State/Province"
              placeholder="State"
            />
            <InputField
              id="country"
              control={form.control}
              name="country"
              label="Country"
              placeholder="Country"
            />
            <InputField
              id="zipcode"
              control={form.control}
              name="zipcode"
              label="Zip Code"
              placeholder="00000"
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </div>
    </form>
  );
}
