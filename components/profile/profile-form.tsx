"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "../ui/separator";
import {
  useProfileData,
  useUpdateProfile,
} from "@/components/settings/use-profile-data";
import { Loader2, UserCircle, Building2 } from "lucide-react";
import InputField from "@/components/form/input-field";
import PhoneInputField from "@/components/form/phone-input-field";

const profileFormSchema = z.object({
  // Profile
  full_name: z
    .string()
    .min(2, { message: "Full name must be at least 2 characters." }),
  email: z.string().email(),

  // Company
  name: z.string().min(1, "Company name is required"),
  phone: z.string().min(1, "Phone number is required"),
  website_url: z.string().url().optional().or(z.literal("")),
  vat_no: z.string().optional(),
  registration_no: z.string().optional(),
  official_email: z.string().email(),

  // Address
  address: z.string().min(1, "Address is required"),
  country: z.string().min(1, "Country is required"),
  state: z.string().min(1, "State is required"),
  zipcode: z.string().min(1, "Zipcode is required"),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function ProfileForm() {
  const { data, isLoading } = useProfileData();
  const { mutate: updateProfile, isPending } = useUpdateProfile();

  if (isLoading || !data) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ProfileEditForm
      data={data}
      updateProfile={updateProfile}
      isPending={isPending}
    />
  );
}

function ProfileEditForm({
  data,
  updateProfile,
  isPending,
}: {
  data: NonNullable<ReturnType<typeof useProfileData>["data"]>;
  updateProfile: ReturnType<typeof useUpdateProfile>["mutate"];
  isPending: boolean;
}) {
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      full_name: data.profile.full_name || "",
      email: data.profile.email || "",
      name: data.company?.name || "",
      phone: data.company?.phone || "",
      website_url: data.company?.website_url || "",
      vat_no: data.company?.vat_no || "",
      registration_no: data.company?.registration_no || "",
      address: data.company?.address || "",
      country: data.company?.country || "",
      state: data.company?.state || "",
      zipcode: data.company?.zipcode || "",
      official_email: data.company?.official_email || "",
    },
    mode: "onChange",
  });

  function onSubmit(values: ProfileFormValues) {
    if (!data?.profile?.id) return;

    updateProfile({
      profileId: data.profile.id,
      advertiserId: data.advertiser?.id,
      profileUpdates: {
        full_name: values.full_name,
      },
      companyUpdates: {
        name: values.name,
        phone: values.phone,
        website_url: values.website_url || null,
        vat_no: values.vat_no || null,
        registration_no: values.registration_no || null,
        address: values.address,
        state: values.state,
        country: values.country,
        zipcode: values.zipcode,
        official_email: values.official_email,
      },
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Personal Info */}
        <div className="lg:col-span-1 space-y-8">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <UserCircle className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Personal Details</CardTitle>
              </div>
              <CardDescription>Manage your public identity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <InputField
                  id="full_name"
                  name="full_name"
                  label="Full Name"
                  control={form.control}
                  placeholder="John Doe"
                />
                <InputField
                  id="email"
                  name="email"
                  label="Contact Email"
                  control={form.control}
                  readOnly
                  disabled
                  className="bg-muted/50"
                  description="Email cannot be changed"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Business & Location Details Combined */}
        <div className="lg:col-span-2 space-y-8">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">
                  Business & Location Info
                </CardTitle>
              </div>
              <CardDescription>
                Your registered business and location details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <InputField
                  id="name"
                  name="name"
                  label="Company Name"
                  control={form.control}
                  placeholder="Acme Inc."
                />
                <InputField
                  id="official_email"
                  name="official_email"
                  label="Official Email"
                  control={form.control}
                  placeholder="official@example.com"
                />
                <PhoneInputField
                  id="phone"
                  name="phone"
                  label="Business Phone"
                  control={form.control}
                />
                <InputField
                  id="website_url"
                  name="website_url"
                  label="Business Website"
                  control={form.control}
                  placeholder="https://example.com"
                />
                <InputField
                  id="vat_no"
                  name="vat_no"
                  label="VAT ID"
                  control={form.control}
                  placeholder="VAT-123456"
                />
                <InputField
                  id="registration_no"
                  name="registration_no"
                  label="Registration #"
                  control={form.control}
                  placeholder="B-123456"
                  className="md:col-span-2"
                />
              </div>

              <Separator className="bg-primary/5" />

              <div className="space-y-6">
                <InputField
                  id="address"
                  name="address"
                  label="Full Street Address"
                  control={form.control}
                  placeholder="1234 Emerald St, Suite 100"
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <InputField
                    id="country"
                    name="country"
                    label="Country"
                    control={form.control}
                    placeholder="United Kingdom"
                  />
                  <InputField
                    id="state"
                    name="state"
                    label="State/Region"
                    control={form.control}
                    placeholder="Greater London"
                  />
                  <InputField
                    id="zipcode"
                    name="zipcode"
                    label="Zip/Postal"
                    control={form.control}
                    placeholder="EC1V 2NX"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button
          type="submit"
          disabled={isPending}
          size="lg"
          className="min-w-[150px] shadow-lg shadow-primary/20"
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving Profile...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </div>
    </form>
  );
}
