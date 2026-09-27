"use client";

import { useAppContext } from "@/context/app-provider";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  isUrlLike,
  normaliseUrl,
  URL_FIELD_MESSAGE,
} from "@/lib/url-field";
import {
  Control,
  Resolver,
  useForm,
  useWatch,
  UseFormSetValue,
} from "react-hook-form";
import * as z from "zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { TIMEZONES } from "@/lib/constants";
import { useAdAccountTypes } from "@/hooks/use-ad-account-types";
import { useAdAccountCost } from "@/hooks/use-ad-account-cost";
import { primaryBmId } from "@/lib/pure-bm-ids";
import { platformGroupFromSlug } from "@/lib/types/ad-account-type";
import { AdAccount } from "@/lib/types/account";
import { AD_ACCOUNT_STATUS_CHOICES } from "@/lib/ad-account-status";
import InputField from "../form/input-field";
import SelectField from "../form/select-field";
import TextareaField from "../form/textarea-field";
import { Button } from "../ui/button";
import { DialogFooter } from "../ui/dialog";
import useUpdateAccount from "./use-update-account";

const validations = z
  .object({
    name: z.string().min(1, "Name is required"),
    bm_id: z.string().optional(),
    fee: z.coerce.number().min(0).max(100),
    // "" means "leave it alone" -- distinct from 0, which is a real
    // supplier fee of nothing. Only sent when the owner changed it.
    supplier_fee_pct: z
      .union([z.literal(""), z.coerce.number().min(0).max(100)])
      .optional(),
    advertiser_id: z.string().min(1, "Advertiser is required"),
    platform: z.string().min(1, "Platform is required"),
    currency: z.enum(["EUR", "USD"], {
      message: "Pick the currency this account is funded in",
    }),
    status: z.string().min(1),
    airtable: z.boolean(),
    start_date: z.string().min(1, "Start date is required"),
    timezone: z.string().min(1, "Timezone is required"),
    notes: z.string().optional(),
    website_url: z
      .string()
      .transform(normaliseUrl)
      .refine(isUrlLike, URL_FIELD_MESSAGE)
      .optional()
      .or(z.literal("")),

    google_email: z.string().optional(),
    tiktok_business_center_id: z.string().optional(),
    tiktok_email: z.string().optional(),
    tiktok_countries: z.string().optional(),
    facebook_business_manager_id: z.string().optional(),
    personal_facebook_profile_link: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const group = platformGroupFromSlug(data.platform);
    if (group === "google") {
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

    if (group === "tiktok") {
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

    if (group === "meta") {
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
        !isUrlLike(data.personal_facebook_profile_link)
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
    // Whatever it is now; "" is not a valid choice, so a row that
    // somehow carries neither falls back to the tenant's own currency
    // rather than silently offering to make it dollars.
    currency:
      String(account.currency ?? "").toUpperCase() === "USD" ? "USD" : "EUR",
    // The stored value, not a boolean. A switch could only ever say
    // active/inactive, so "banned" and "disabled" had nowhere to live and
    // every account that was off for any reason read the same.
    status: (account.status ?? "active").trim().toLowerCase() || "active",
    airtable: account.airtable ?? false,
    start_date: account.start_date ?? new Date().toISOString(),
    timezone: normalizeTimezone(account.timezone),
    notes: account.notes ?? "",
    website_url: account.website_url ?? "",
    google_email: getString(metadata?.google_email),
    tiktok_business_center_id: getString(metadata?.tiktok_business_center_id),
    tiktok_email: getString(metadata?.tiktok_email),
    tiktok_countries: getCountries(metadata?.tiktok_countries),
    // ── A LIST WOULD HAVE EMPTIED THIS BOX ──────────────────
    // getString returns "" for anything that is not a string, and this
    // form's own validation then refuses to save until somebody
    // retypes it -- so one account carrying the new multi-BM shape
    // became uneditable, in every field, with the message pointing at
    // a box that had just been silently cleared.
    //
    // An ad account has ONE business manager, so the first is the
    // right one to show; the full list lives on the request.
    facebook_business_manager_id:
      primaryBmId(metadata?.facebook_business_manager_id) ??
      getString(metadata?.facebook_business_manager_id),
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
  const currentStatus = watch("status");
  // Whatever the row holds stays offered, so saving an account the supplier
  // sync marked 'paused' does not quietly flip it to active.
  const statusOptions = [
    ...AD_ACCOUNT_STATUS_CHOICES.map((c) => ({
      label: c.label,
      value: c.value,
    })),
    ...(AD_ACCOUNT_STATUS_CHOICES.some((c) => c.value === currentStatus)
      ? []
      : [
          {
            label: `${currentStatus.charAt(0).toUpperCase()}${currentStatus.slice(1)} (current)`,
            value: currentStatus,
          },
        ]),
  ];
  const statusHint =
    AD_ACCOUNT_STATUS_CHOICES.find((c) => c.value === currentStatus)?.hint ??
    "This is the status the account already has.";
  const queryClient = useQueryClient();
  const { isSuperAdmin } = useAppContext();
  const { updateAccount, isPending } = useUpdateAccount();

  const { options: typeOptions, bySlug } = useAdAccountTypes();
  const selectedGroup =
    bySlug.get(selectedPlatform)?.platform_group ??
    platformGroupFromSlug(selectedPlatform);

  // What we pay on THIS account. Read separately from the account row on
  // purpose -- it lives in the admin-only ad_account_costs table so no
  // customer-facing query can pick it up by accident.
  const {
    supplierFeePct,
    isPending: costPending,
    isError: costError,
  } = useAdAccountCost(account.id);

  // Fill the box once the figure arrives, and only while it is still
  // untouched -- a value somebody typed is never overwritten by a
  // late-arriving fetch.
  const filledCost = useRef(false);
  useEffect(() => {
    if (filledCost.current) return;
    if (costPending) return;
    filledCost.current = true;
    setValue("supplier_fee_pct", supplierFeePct == null ? "" : supplierFeePct, {
      shouldDirty: false,
    });
  }, [costPending, supplierFeePct, setValue]);
  // A fresh account means a fresh read.
  useEffect(() => {
    filledCost.current = false;
  }, [account.id]);

  const [askOpen, setAskOpen] = useState(false);
  const [askFee, setAskFee] = useState("");
  const [askWhy, setAskWhy] = useState("");
  const [asking, setAsking] = useState(false);

  const submitAsk = async () => {
    const pct = Number(askFee);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.error("Enter a percentage between 0 and 100.");
      return;
    }
    if (askWhy.trim().length < 3) {
      toast.error("Say why", {
        description: "The owner is deciding on a price from this alone.",
      });
      return;
    }
    setAsking(true);
    try {
      const { requestFeeChange } = await import(
        "@/actions/fee-change-actions"
      );
      const res = await requestFeeChange({
        adAccountId: account.id,
        requestedFee: pct,
        reason: askWhy.trim(),
      });
      if (!res.ok) {
        toast.error("That was not sent", { description: res.error });
        return;
      }
      toast.success("Sent to the owner", {
        description: "You will get a notice either way, with the reason.",
      });
      setAskOpen(false);
      setAskFee("");
      setAskWhy("");
    } finally {
      setAsking(false);
    }
  };

  const supplierFeeWatch = watch("supplier_fee_pct");
  const feeWatch = watch("fee");
  const marginText = (() => {
    const charge = Number(feeWatch);
    const cost = Number(supplierFeeWatch);
    if (
      supplierFeeWatch === "" ||
      supplierFeeWatch == null ||
      !Number.isFinite(charge) ||
      !Number.isFinite(cost)
    ) {
      return "Leave blank if unknown — margin stays unreported rather than assumed.";
    }
    const margin = charge - cost;
    // Deliberately "top-up margin": DST is a separate cost, charged
    // against our reserve as the advertiser spends. Calling this the
    // margin full stop would overstate what we earn.
    return margin < 0
      ? `⚠ Top-up margin ${margin.toFixed(2)}% — we would pay the supplier more than we charge.`
      : `Top-up margin ${margin.toFixed(2)}% (we charge ${charge}%, we pay ${cost}%).`;
  })();

  const handleUpdateAccount = (values: FormValues) => {
    let metadata: Record<string, unknown> = {};

    const group =
      bySlug.get(values.platform)?.platform_group ??
      platformGroupFromSlug(values.platform);
    if (group === "google") {
      metadata = { google_email: values.google_email };
    } else if (group === "tiktok") {
      metadata = {
        tiktok_business_center_id: values.tiktok_business_center_id,
        tiktok_email: values.tiktok_email,
        tiktok_countries:
          values.tiktok_countries
            ?.split(",")
            .map((country) => country.trim())
            .filter(Boolean) || [],
      };
    } else if (group === "meta") {
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
          // Only when the owner actually set one. An employee admin's
          // payload never carries the key, so upsertSupplierFee is not
          // even reached -- and it refuses them anyway, which is where
          // the boundary is.
          ...(isSuperAdmin &&
          values.supplier_fee_pct !== "" &&
          values.supplier_fee_pct != null
            ? { supplier_fee_pct: Number(values.supplier_fee_pct) }
            : {}),
          advertiser_id: values.advertiser_id,
          platform: values.platform,
          // Added with the field itself. The payload here is built by
          // hand, so a new control that is not listed saves silently:
          // the dropdown moves, the toast says "updated successfully"
          // and the column never changes.
          currency: values.currency,
          status: values.status,
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
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={handleSubmit(handleUpdateAccount)}
      >
        {/* Flexes instead of a fixed 70vh: the fields take whatever is left
            after the header and the footer, so the footer is always on
            screen however tall the sheet ends up. */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-1">
          {/* DISABLED, like the advertiser select below it, because the
              server drops `platform` from the update allowlist and always
              did — so this was a live dropdown whose change was silently
              thrown away under the words "Ad Account updated
              successfully". `metadata` on the same save DOES persist, so
              the two disagreed afterwards.

              It is not an oversight in the allowlist either: platform
              decides the premium two-point fee discount
              (topup-actions reads it) and the beneficiary bank a customer
              is told to pay. Changing it under an account with history
              re-prices every future top-up and re-routes real transfers.
              That belongs in a deliberate move, not in a general edit
              form — so the form now says what the server does. */}
          <SelectField
            label="Select Platform"
            name="platform"
            id="update-platform-select"
            control={control}
            options={typeOptions}
            placeholder="Select"
            disabled
          />

          {/* ── AND HERE, SO A WRONG ONE CAN BE PUT RIGHT ──────────
              Neither form carried a currency, so every account the app
              made came out USD and nothing could correct it. Changing
              this on an account that has already been funded
              reinterprets what those top-ups were in, so it is an
              admin's judgement call, not a routine edit — but leaving
              no control at all is how AA-PSM0007-EU-01 ended up a
              dollar account for a customer holding euros. */}
          <SelectField
            label="Currency"
            name="currency"
            id="update-account-currency"
            control={control}
            options={[
              { label: "EUR — euro account", value: "EUR" },
              { label: "USD — dollar account", value: "USD" },
            ]}
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

          {/* Disabled for an employee admin, like the create form and
              the inline cell -- this was the one writer of the customer
              price left open, so they found out by being refused after
              pressing Save. */}
          <InputField
            label="Fee (%) — what the customer pays"
            name="fee"
            id="update-fee-percent"
            type="number"
            control={control}
            disabled={!isSuperAdmin}
          />
          {!isSuperAdmin && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Visible to admins; only the super-admin can change what a
                customer is charged.
              </p>
              {/* ── A REFUSAL WITH NOWHERE TO GO IS NOT A PROCESS ─────
                  The owner, 27-09: "als admin de fee moet aanpassen dan
                  moet de request bij a super admin belanden, niet
                  aanpassen dan niet."

                  The refusing half was already here, and stricter than
                  it looks — feeIsAPrice allows only a blank, the plan
                  rate or the type default. What was missing is where a
                  refusal goes. Until now it ended at "ask the owner",
                  which in practice means a message on the phone, or
                  nothing at all. */}
              <button
                type="button"
                className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
                onClick={() => setAskOpen(true)}
              >
                Ask the owner to change it
              </button>
            </div>
          )}

          {/* ── WHAT WE PAY, WHICH NO SCREEN SHOWED ─────────────────
              The owner, 27-09: "supplier fee moet ook admin kunnen zien
              niet changen."

              The CREATE form has carried this field all along; this one
              never did, and neither does the details sheet. So the cost
              was typed once and disappeared -- getAdAccountCosts had no
              callers at all. An admin weighing a fee change could see
              the price and not the cost, which is the half that says
              whether the change sells at a loss.

              Read-only unless you own the tenant, and that is enforced
              in upsertSupplierFee, not here: a disabled input is not a
              boundary. */}
          <div className="space-y-1">
            <InputField
              label="Supplier top-up fee (%) — what we pay"
              name="supplier_fee_pct"
              id="update-supplier-fee-percent"
              type="number"
              control={control}
              disabled={!isSuperAdmin}
            />
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {costPending
                ? "Looking up what we pay…"
                : costError
                  ? "We could not read what we pay on this account. Not zero — unknown."
                  : !isSuperAdmin
                    ? "Visible to admins; only the super-admin can change it."
                    : marginText}
            </p>
          </div>

          {/* Inactive is NOT in this menu on purpose: it is worked out
              from the account's own history (no top-up in 30 days), so
              nothing has to remember to un-set it. See
              lib/ad-account-status.ts. */}
          <SelectField
            label="Account Status"
            name="status"
            id="update-account-status"
            control={control}
            options={statusOptions}
            placeholder="Select status"
          />
          <p className="-mt-2 text-xs text-muted-foreground">{statusHint}</p>

          <SelectField
            label="Timezone"
            name="timezone"
            id="update-timezone-select"
            control={control}
            options={timezoneOptions}
            placeholder="Select Timezone"
          />

          {selectedGroup === "google" && <GoogleFields control={control} />}
          {selectedGroup === "tiktok" && <TikTokFields control={control} />}
          {selectedGroup === "meta" && (
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
      <DialogFooter className="mt-4 shrink-0">
        <Button type="submit" form="update-account-form" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin" />}
          <span>{isPending ? "Saving…" : "Update Account"}</span>
        </Button>
      </DialogFooter>

      {/* Not nested inside the form: a submit button inside a form
          submits it, and this one has its own. */}
      {askOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Ask the owner to change this fee"
          onClick={(e) => {
            if (e.target === e.currentTarget && !asking) setAskOpen(false);
          }}
        >
          <div className="w-full max-w-sm space-y-3 rounded-lg bg-background p-4 shadow-lg">
            <div>
              <h3 className="text-sm font-semibold">Ask the owner</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {account.name ?? "This account"} is on{" "}
                {account.fee == null ? "no rate of its own" : `${account.fee}%`}
                . Nothing changes until the owner says yes.
              </p>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-medium">New fee (%)</span>
              <input
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={askFee}
                onChange={(e) => setAskFee(e.target.value)}
                className="w-full rounded-md border px-2 py-1.5 text-sm"
                autoFocus
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">Why</span>
              <textarea
                rows={3}
                value={askWhy}
                onChange={(e) => setAskWhy(e.target.value)}
                placeholder="What was agreed, and with whom"
                className="w-full rounded-md border px-2 py-1.5 text-sm"
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={asking}
                onClick={() => setAskOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={asking}
                onClick={() => void submitAsk()}
              >
                {asking ? "Sending…" : "Send to the owner"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
