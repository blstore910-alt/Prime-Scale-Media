"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import InputField from "@/components/form/input-field";
import { Loader2, RotateCcw, X } from "lucide-react";
import { UserProfile } from "@/lib/types/user";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useState } from "react";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import PhoneInputField from "../form/phone-input-field";
import Image from "next/image";
import { useFormDraft } from "@/hooks/use-form-draft";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";

const companySchema = z
  .object({
    name: z.string().min(2, "Company Name is required"),
    official_email: z.email("Invalid email"),
    phone: z.string().min(5, "Valid phone number is required"),
    website_url: z.string().optional().or(z.literal("")),
    vat_no: z.string().optional(),

    address: z.string().min(5, "Address is required"),
    state: z.string().min(1, "State is required"),
    country: z.string().min(1, "Country is required"),
    zipcode: z.string().min(1, "Zipcode is required"),
    is_not_vat: z.boolean(),
    billing: z.object({
      same_as_company: z.boolean(),
      address: z.string().min(5, "Billing Address is required"),
      state: z.string().min(1, "Billing State is required"),
      country: z.string().min(1, "Billing Country is required"),
      zipcode: z.string().min(1, "Billing Zipcode is required"),
    }),
  })
  .refine(
    (data) => {
      if (!data.is_not_vat && (!data.vat_no || data.vat_no.trim() === "")) {
        return false;
      }
      return true;
    },
    {
      message: "VAT No is required",
      path: ["vat_no"],
    },
  );

type FormValues = z.infer<typeof companySchema>;

export default function CompanyOnboardingForm({
  profile,
  advertiserId,
}: {
  profile: UserProfile;
  advertiserId?: string;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { isSubmitted },
  } = useForm<FormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: "",
      official_email: "",
      phone: "",
      website_url: "",

      vat_no: "",
      address: "",
      state: "",
      country: "",
      zipcode: "",
      is_not_vat: false,
      billing: {
        same_as_company: true,
        address: "",
        state: "",
        country: "",
        zipcode: "",
      },
    },
  });

  // Auto-save + restore — long form, don't lose user's typing.
  const liveValues = watch();
  const draft = useFormDraft<FormValues>({
    formKey: "company-onboarding",
    values: liveValues,
    userScope: profile.id ?? null,
  });

  // Warn on close/refresh once anything has been typed.
  const dirty =
    !!liveValues.name ||
    !!liveValues.official_email ||
    !!liveValues.phone ||
    !!liveValues.address;
  useUnsavedChangesWarning(dirty && !isSubmitting);

  const values = watch();

  React.useEffect(() => {
    if (values.billing.same_as_company) {
      setValue("billing.address", values.address, {
        shouldValidate: isSubmitted,
      });
      setValue("billing.state", values.state, { shouldValidate: isSubmitted });
      setValue("billing.country", values.country, {
        shouldValidate: isSubmitted,
      });
      setValue("billing.zipcode", values.zipcode, {
        shouldValidate: isSubmitted,
      });
    }
  }, [
    values.billing.same_as_company,
    values.address,
    values.state,
    values.country,
    values.zipcode,
    setValue,
    isSubmitted,
  ]);

  const onSubmit = async (data: FormValues) => {
    if (!profile.id || !advertiserId) {
      toast.error("Profile or Advertiser ID missing");
      return;
    }

    setIsSubmitting(true);
    try {
      const isSameAddress = data.billing.same_as_company;
      const { saveOwnCompanyOnboarding } = await import(
        "@/actions/company-actions"
      );
      const result = await saveOwnCompanyOnboarding({
        company: {
          name: data.name,
          official_email: data.official_email,
          phone: data.phone,
          website_url: data.website_url || null,
          vat_no: data.is_not_vat ? null : data.vat_no || null,
          address: data.address,
          country: data.country,
          state: data.state,
          zipcode: data.zipcode,
          is_not_vat: data.is_not_vat,
        },
        billing: {
          address: isSameAddress ? data.address : data.billing.address,
          state: isSameAddress ? data.state : data.billing.state,
          country: isSameAddress ? data.country : data.billing.country,
          zipcode: isSameAddress ? data.zipcode : data.billing.zipcode,
        },
      });
      if (!result.ok) throw new Error(result.error);

      await draft.clear();
      toast.success("Company information saved!");
      router.refresh();
      setTimeout(() => {
        router.push("/");
      }, 100);
    } catch (error) {
      const err = error as Error;
      toast.error("Failed to save company information", {
        description: err.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <Card>
        <div>
          <Image
            src={"/images/psm-logo.svg"}
            height={150}
            width={150}
            alt="PSM Logo"
            className="object-cover h-44 mx-auto w-auto"
          />
        </div>
        <CardHeader>
          <CardTitle>Complete Your Company Profile</CardTitle>
          <CardDescription>
            You must provide your company details and VAT information to access
            the platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {draft.hasDraft && draft.restoredDraft && (
            <div className="mb-4 rounded-md border border-blue-300 bg-blue-50 dark:bg-blue-950/30 p-3 flex items-start gap-3">
              <div className="flex-1 text-sm">
                <p className="font-medium text-blue-900 dark:text-blue-100">
                  Unsaved changes from earlier
                </p>
                <p className="text-blue-800 dark:text-blue-200 text-xs mt-1">
                  Auto-saved{" "}
                  {new Date(draft.restoredDraft.savedAt).toLocaleString()}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  reset(draft.restoredDraft!.values);
                  draft.dismissDraft();
                  toast.success("Draft restored");
                }}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Restore
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  void draft.clear();
                }}
                aria-label="Discard draft"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField
                id="company-name"
                control={control}
                name="name"
                label="Company Name *"
                placeholder="Acme Inc."
              />
              <PhoneInputField
                id="phone"
                control={control}
                name="phone"
                label="Phone *"
                placeholder="+1 (555) 000-0000"
              />
              <InputField
                id="official-email"
                control={control}
                name="official_email"
                label="Official Email *"
                placeholder="contact@acme.com"
              />
              <InputField
                id="website-url"
                control={control}
                name="website_url"
                label="Website URL"
                placeholder="https://acme.com"
              />

              <div>
                <InputField
                  id="vat-no"
                  control={control}
                  name="vat_no"
                  label="VAT No *"
                  disabled={values.is_not_vat}
                  placeholder="VAT-123456"
                />
                <div className="flex gap-2 mt-1">
                  <Checkbox
                    name={"is_not_vat"}
                    id={"is_not_vat"}
                    checked={values.is_not_vat}
                    onCheckedChange={(value) =>
                      setValue("is_not_vat", value as boolean)
                    }
                  />
                  <Label
                    htmlFor="is_not_vat"
                    className="text-muted-foreground text-sm"
                  >
                    {"My Company isn't VAT registered"}
                  </Label>
                </div>
              </div>
            </div>

            <InputField
              id="address"
              control={control}
              name="address"
              label="Street Address *"
              placeholder="123 Main St"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InputField
                id="state"
                control={control}
                name="state"
                label="State/City *"
                placeholder="State"
              />
              <InputField
                id="country"
                control={control}
                name="country"
                label="Country *"
                placeholder="Country"
              />
              <InputField
                id="zipcode"
                control={control}
                name="zipcode"
                label="Zip Code *"
                placeholder="00000"
              />
            </div>

            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-lg font-bold">Billing Information</h3>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="same-as-company"
                  checked={values.billing.same_as_company}
                  onCheckedChange={(checked) => {
                    setValue("billing.same_as_company", checked as boolean);
                  }}
                />
                <Label
                  htmlFor="same-as-company"
                  className="text-sm font-medium"
                >
                  Same as company address
                </Label>
              </div>
              <div className="space-y-4">
                <InputField
                  id="billing-address"
                  control={control}
                  name="billing.address"
                  label="Street Address *"
                  placeholder="123 Main St"
                  disabled={values.billing.same_as_company}
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <InputField
                    id="billing-state"
                    control={control}
                    name="billing.state"
                    label="State/City *"
                    placeholder="State"
                    disabled={values.billing.same_as_company}
                  />
                  <InputField
                    id="billing-country"
                    control={control}
                    name="billing.country"
                    label="Country *"
                    placeholder="Country"
                    disabled={values.billing.same_as_company}
                  />
                  <InputField
                    id="billing-zipcode"
                    control={control}
                    name="billing.zipcode"
                    label="Zip Code *"
                    placeholder="00000"
                    disabled={values.billing.same_as_company}
                  />
                </div>
              </div>
            </div>

            <div className="justify-end flex pt-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save & Continue
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
