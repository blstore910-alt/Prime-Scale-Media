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

// The brand's rocket, same drawing the auth screens and both app shells use.
function RocketMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={29}
      height={29}
      fill="none"
      stroke="#fff"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}

// Whatever the row holds, as a string a text input can show. null,
// undefined and a number all have to become "" or the field renders
// "null" or refuses to be controlled.
const str = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v);

export default function CompanyOnboardingForm({
  profile,
  advertiserId,
  company,
}: {
  profile: UserProfile;
  advertiserId?: string;
  /** What is already stored, so the form does not start blank. */
  company?: Record<string, unknown> | null;
}) {
  // billings comes back as an array from the embed.
  const billing = (() => {
    const b = (company as { billings?: unknown } | null | undefined)?.billings;
    const row = Array.isArray(b) ? b[0] : b;
    return (row ?? null) as Record<string, unknown> | null;
  })();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { isSubmitted, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(companySchema),
    // ── PREFILLED, BECAUSE BLANK HERE DELETES THINGS ────────────────
    //
    // This started as eleven empty strings and reset() only ran from
    // the draft-restore banner, so the commonest real path -- fill
    // Settings > Company, be told "Still needed: the billing address is
    // on the full form", press Finish it -- landed on a BLANK form.
    //
    // Retyping from blank is not merely tedious. The submit maps
    // `website_url: data.website_url || null` and
    // `vat_no: data.is_not_vat ? null : data.vat_no || null`, so an
    // empty Website box NULLS the website they had just saved, and
    // ticking "not VAT registered" nulls the VAT number. A form that
    // does not show what it holds will quietly delete it.
    defaultValues: {
      name: str(company?.name),
      official_email: str(company?.official_email),
      phone: str(company?.phone),
      website_url: str(company?.website_url),

      vat_no: str(company?.vat_no),
      address: str(company?.address),
      state: str(company?.state),
      country: str(company?.country),
      zipcode: str(company?.zipcode),
      is_not_vat: company?.is_not_vat === true,
      billing: {
        // "Same as company" only when there is no separate billing row
        // yet. Once one exists, showing it is the point.
        same_as_company: !billing,
        address: str(billing?.address),
        state: str(billing?.state),
        country: str(billing?.country),
        zipcode: str(billing?.zipcode),
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

  // ── TYPED, NOT PREFILLED ──────────────────────────────────────────
  //
  // This asked whether the four fields were non-empty. Once the form
  // started prefilling from the stored company, they are non-empty on
  // first paint -- and /complete-profile only renders for a company
  // that is INCOMPLETE, which is exactly the population that already
  // has some of them stored. So a customer opened the page, decided to
  // do it later, pressed Back, and got "Leave site? Changes you made
  // may not be saved" about changes they never made.
  //
  // formState.isDirty compares against defaultValues, which is the
  // prefill -- so it is true only when a person has actually changed
  // something.
  useUnsavedChangesWarning(isDirty && !isSubmitting);

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
        {/* The real mark, at a size that leaves room for the form. This was
            /images/psm-logo.svg — an older circular badge, unrelated to the
            brand the rest of the app uses — rendered 176px tall with
            object-cover, so it filled the first screenful of a page whose
            whole job is a long form. */}
        <div className="flex justify-center pt-6">
          <span
            className="grid h-14 w-14 place-items-center rounded-2xl"
            style={{
              background: "linear-gradient(135deg,#0c1030,#0a0e24)",
              boxShadow:
                "0 12px 30px -10px rgba(58,90,230,.6), 0 0 30px rgba(91,141,255,.45), 0 0 0 1px rgba(91,141,255,.32)",
            }}
          >
            <RocketMark />
          </span>
        </div>
        <CardHeader>
          <CardTitle>Complete Your Company Profile</CardTitle>
          <CardDescription>
            {/* NOT "to access the platform". The (app) layout computes
                that completeness rule and then deliberately DISCARDS it
                -- browsing is allowed. What is actually gated is being
                invoiced, topping up and requesting an ad account. This
                page's only other control is Log out, so telling
                somebody who wanted a look round that they must finish
                twelve fields or sign out is both untrue and a dead
                end. */}
            We need these to put your company on your invoices. You can look
            round without them — but topping up, requesting an ad account and
            being invoiced all wait until they are filled in.
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
                label="Email *"
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
