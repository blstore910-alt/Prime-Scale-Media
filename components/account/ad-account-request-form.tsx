"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { isUrlLike } from "@/lib/url-field";
import { Resolver, useForm, Control, Controller } from "react-hook-form";
import * as z from "zod";
import { useEffect, useRef, useState } from "react";
import InputField from "../form/input-field";
import SelectField from "../form/select-field";
import TextareaField from "../form/textarea-field";
import { DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import ConfirmModal, { ConfirmFact } from "@/components/ui/confirm-modal";
import { toast } from "sonner";
import {
  AD_ACCOUNT_REQUEST_FEE_EUR,
  TIMEZONES,
} from "@/lib/constants";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useCreateAdAccountRequest } from "@/hooks/use-create-ad-account-request";
import { useFormDraft } from "@/hooks/use-form-draft";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";

const validations = z
  .object({
    platform: z.enum(["meta-ads", "tiktok-ads", "google-ads"]),
    currency: z.enum(["USD", "EUR"]),
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

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isDirty },
  } = useForm<FormValues>({
    defaultValues,
    resolver: zodResolver(validations) as Resolver<FormValues>,
  });

  const selectedPlatform = watch("platform");
  const selectedCurrency = watch("currency");
  const liveValues = watch();

  // Wallet-impact preview: fee is €50 (EUR) or the rounded USD equivalent
  // via the active rate; show current balance + balance after.
  const advertiserId = profile?.advertiser?.[0]?.id ?? null;
  const { data: feePreview, isError: feePreviewError } = useQuery({
    queryKey: ["request-fee-preview", advertiserId, profile?.tenant_id],
    enabled: !!advertiserId && !!profile?.tenant_id,
    queryFn: async () => {
      const supabase = createClient();
      const [w, r, plan, reqs, perks] = await Promise.all([
        supabase
          .from("wallets")
          .select("usd_balance, eur_balance")
          .eq("advertiser_id", advertiserId)
          .maybeSingle(),
        supabase
          .from("exchange_rates")
          .select("eur")
          .eq("tenant_id", profile?.tenant_id)
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("advertiser_plans")
          .select("included_ad_accounts")
          .eq("advertiser_id", advertiserId)
          .maybeSingle(),
        // Non-rejected requests count toward the included allowance.
        supabase
          .from("ad_account_requests")
          .select("id, status")
          .eq("advertiser_id", advertiserId),
        // A free_ad_account_requests perk also makes the request free once
        // the plan allowance is used up — mirror ad_account_request_create_paid
        // so the preview doesn't show a fee (and block submit) for a request
        // the server would grant for free.
        supabase
          .from("advertiser_perks")
          .select("remaining, expires_at, starts_at")
          .eq("advertiser_id", advertiserId)
          .eq("kind", "free_ad_account_requests")
          .eq("active", true),
      ]);
      // Promise.all resolves even when an individual sub-query carries an
      // .error, so a failed read became a confident zero: a failed `wallets`
      // read meant balance 0 and blocked submit with "not enough balance"
      // on a wallet holding thousands, and a failed `advertiser_plans` read
      // meant "0 included" and charged for a request the server would have
      // granted for free. The code below already handles feePreview being
      // undefined correctly (see feeEnough) — so make a partial failure
      // behave like the total failure it effectively is.
      const failed = [w, r, plan, reqs, perks].find((res) => res.error);
      if (failed?.error) throw failed.error;

      // ── THE SAME COMPARISON THE SQL MAKES, CASE AND ALL ───────────
      //
      // ad_account_request_create_paid counts with
      // `coalesce(status,'') not in ('rejected','cancelled')` -- no
      // lower(). This lowercased first, so one request stored as
      // 'Rejected' made the client count 0 used and print "Included in
      // your plan - no fee" while the server counted 1 and debited
      // EUR 50 -- or refused with "Insufficient wallet balance" if the
      // wallet was short. The screen has to lose that argument, not
      // win it.
      const used = (reqs.data ?? []).filter(
        (x: { status: string | null }) =>
          !["rejected", "cancelled"].includes(x.status ?? ""),
      ).length;
      const nowMs = new Date().getTime();
      const hasFreePerk = (perks.data ?? []).some(
        (p: {
          remaining: number | null;
          expires_at: string | null;
          starts_at: string | null;
        }) =>
          Number(p.remaining ?? 0) > 0 &&
          (!p.expires_at || new Date(p.expires_at).getTime() > nowMs) &&
          (!p.starts_at || new Date(p.starts_at).getTime() <= nowMs),
      );
      return {
        usd: Number(w.data?.usd_balance ?? 0),
        eur: Number(w.data?.eur_balance ?? 0),
        rate: Number(r.data?.eur) || 0.86,
        included: Number(plan.data?.included_ad_accounts ?? 0),
        used,
        hasFreePerk,
      };
    },
  });

  // First N requests (plan-included) are free; the fee only applies once
  // the included allowance is used up. Mirrors ad_account_request_create_paid.
  const included = feePreview?.included ?? 0;
  const used = feePreview?.used ?? 0;
  const isFree = used < included || (feePreview?.hasFreePerk ?? false);
  const feeAmount = isFree
    ? 0
    : selectedCurrency === "EUR"
      ? AD_ACCOUNT_REQUEST_FEE_EUR
      : Math.round(AD_ACCOUNT_REQUEST_FEE_EUR / (feePreview?.rate || 0.86));
  const feeSymbol = selectedCurrency === "USD" ? "$" : "€";
  const feeBalance =
    selectedCurrency === "USD" ? (feePreview?.usd ?? 0) : (feePreview?.eur ?? 0);
  // While the fee/balance preview is still loading (or errored) feePreview
  // is undefined and feeBalance defaults to 0 — don't flash a false
  // "not enough balance" or disable submit until we actually know.
  const feeEnough = isFree || !feePreview || feeBalance >= feeAmount;
  // ── AND THE SAME THING FOR THE SENTENCES, NOT ONLY THE GATE ─────────
  //
  // The line above already treats an unloaded preview as "don't refuse".
  // Five lines up, the STATEMENTS built from the same undefined value
  // were printed as fact: included = 0 and used = 0 make isFree false, so
  // the card reads "Ad-account request fee: €50 / Charged from your
  // wallet when you submit. Balance: €0.00 → €-50.00", and the
  // confirmation says "Cost: €50 from your wallet".
  //
  // Two false money statements at once. The request may be included free
  // in their plan, in which case the server charges nothing; and their
  // balance is not €0.00. This is not a rare failure — the query fires
  // when the dialog mounts, so that card renders it on EVERY open until
  // the fetch lands. A customer reads "€-50.00" and backs out of a
  // request that was free.
  const feeUnknown = !feePreview || feePreviewError;

  const draft = useFormDraft<FormValues>({
    formKey: "ad-account-request",
    values: liveValues,
    userScope: profile?.id ?? null,
  });
  useUnsavedChangesWarning(isDirty);

  // ── THE CURRENCY FOLLOWS THE PLATFORM, BOTH WAYS ──────────────────
  //
  // This only forced EUR -> USD when leaving Meta, and never came back.
  // So: open the dialog (Meta, EUR), tap TikTok to see what it is (USD
  // is its only option, and is selected for you), tap back to Meta --
  // and USD stays. EUR reappears as a choice and is NOT reselected.
  //
  // The currency radios sit below the fold while you are reading the
  // platform list, so nothing on screen says what just happened. An ad
  // account keeps its currency for life, so that customer ends up
  // asking for a USD account while their wallet, their plan and their
  // existing account are all in euros -- and every funding of it needs
  // a USD wallet they have never put money in.
  //
  // Leaving Meta still forces USD, because that is the only currency
  // the other platforms have. RETURNING to Meta now restores EUR, which
  // is both the form's default and the only currency the customer was
  // ever offered before they went wandering.
  const prevPlatform = useRef(selectedPlatform);
  useEffect(() => {
    const was = prevPlatform.current;
    prevPlatform.current = selectedPlatform;

    if (selectedPlatform !== "meta-ads") {
      if (selectedCurrency === "EUR") setValue("currency", "USD");
      return;
    }
    // Came BACK to Meta from a USD-only platform: undo the forcing.
    if (was !== "meta-ads" && selectedCurrency === "USD") {
      setValue("currency", "EUR");
    }
  }, [selectedPlatform, selectedCurrency, setValue]);

  // A request is not a purchase and it is not instant: a person picks it up,
  // sets the account up on our Business Manager, and — when the plan's
  // included accounts are used up — the wallet is charged. So the last tap
  // says what is about to happen and asks once. It is a step inside this
  // dialog rather than a second dialog, because a dialog on top of a dialog
  // in a portal is where focus handling goes wrong.
  const [confirming, setConfirming] = useState<FormValues | null>(null);
  // A ref, because state read out of a closure is the latch that does
  // not latch. See the note on the confirm handler below.
  const submitLatch = useRef(false);

  const onSubmit = (values: FormValues) => {
    if (!profile) {
      toast.error("User profile not found");
      return;
    }
    if (!confirming) {
      setConfirming(values);
      return;
    }

    // No advertiser id is read here any more: ad_account_request_create_paid
    // derives the advertiser, the tenant and the email from auth.uid(),
    // and took the three this form used to send only to drop them.

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
        platform: values.platform,
        currency: values.currency,
        timezone: values.timezone,
        website_url: values.website_url || undefined,
        notes: values.notes || undefined,
        metadata,
      },
      {
        onSuccess: async () => {
          // ── CLOSE THE CONFIRMATION FIRST ──────────────────────────
          //
          // draft.clear() opens IndexedDB and runs a readwrite
          // transaction. For the whole of that the RPC has committed,
          // the success toast has fired, isPending is false so the
          // confirm button has re-enabled with its normal label, and
          // the submitLatch has already released -- it fires when
          // handleSubmit resolves, not when the mutation settles.
          //
          // So the customer reads "Request sent" over a modal still
          // asking "Send this request? Cost: EUR 50 from your wallet",
          // with a live button. A second tap re-enters onSubmit with
          // `confirming` still truthy and calls mutate() again: a
          // second EUR 50 debit and a second request.
          setConfirming(null);
          setOpen(false);
          reset();
          await draft.clear();
        },
        // ── A RETRY MUST NOT BE ONE TAP AWAY ───────────────────────────
        //
        // `confirming` was cleared only on success, so a failure left the
        // dialog open with a live "Yes, send it" and the pending flag
        // dropped. ad_account_request_create_paid has no idempotency key
        // and no unique constraint: every call locks the wallet, debits
        // 50 EUR and inserts a row.
        //
        // The dangerous shape is a call that COMMITTED and whose response
        // was lost — a 504, a dropped connection, a suspended tab. The
        // toast says "Failed to submit request", the customer taps again,
        // and 100 EUR is gone for one account with two pending rows.
        //
        // Closing the confirmation sends them back through the form,
        // where the wallet figure has been refetched and will show what
        // actually happened. It is one extra tap when the failure was
        // genuine, and it is the only thing standing between a lost
        // response and a double charge until the RPC takes a request key.
        onError: () => {
          setConfirming(null);
        },
      },
    );
  };

  return (
    <>
      <form id="ad-account-request-form" onSubmit={handleSubmit(onSubmit)}>
        {/* Wallet impact — included-free vs the €50 (or USD-equiv) fee. */}
        <div
          className={`mb-4 rounded-md border p-3 text-sm ${
            isFree
              ? "border-emerald-500/40 bg-emerald-500/5"
              : feeEnough
                ? "bg-muted/30"
                : "border-destructive/50 bg-destructive/5"
          }`}
        >
          {feeUnknown ? (
            <>
              <div className="font-medium">
                Checking what this request costs…
              </div>
              <div className="text-muted-foreground text-xs mt-0.5">
                {feePreviewError
                  ? "We couldn't read your plan and balance just now. Your plan may include this request at no cost — we'll charge the right amount when you submit."
                  : "Your plan may include it at no cost."}
              </div>
            </>
          ) : isFree ? (
            <>
              <div className="font-medium">Included in your plan — no fee</div>
              <div className="text-muted-foreground text-xs mt-0.5">
                {/* The free branch is reached AFTER the allowance is
                    exhausted -- that is what a free-request perk is for
                    -- so `included - used` is negative by definition
                    here, and with no plan row at all `included` is 0
                    and it read "-4 of 0". Clamped, and the sentence
                    says which of the two is covering it, because the
                    server distinguishes plan_included from perk and
                    this did not. */}
                {Math.max(0, included - used)} of {included} included ad
                account{included === 1 ? "" : "s"} left
                {included - used <= 0
                  ? " — this one is covered by a free-request perk"
                  : ""}
                . Your wallet won&apos;t be charged for this request.
              </div>
            </>
          ) : (
            <>
              <div className="font-medium">
                Ad-account request fee: {feeSymbol}
                {feeAmount}
              </div>
              <div className="text-muted-foreground text-xs mt-0.5">
                Charged from your wallet when you submit. Balance: {feeSymbol}
                {feeBalance.toFixed(2)} → {feeSymbol}
                {(feeBalance - feeAmount).toFixed(2)}
              </div>
              {!feeEnough && (
                <div className="text-destructive text-xs mt-1 font-medium">
                  Not enough balance — top up before requesting.
                </div>
              )}
            </>
          )}
        </div>
        {/* The "Unsaved draft from ... Restore" strip used to sit here.
            Taken out at the owner's request: on a form people fill
            once, it is a second thing to read and dismiss before
            they can start, and it sat between the fee notice and
            the first field. use-form-draft still keeps the typing
            safe across a reload; it simply no longer interrupts. */}
        <div className="space-y-6 max-h-[70dvh] overflow-y-auto px-1 py-2">
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
                  {/* EUR FIRST, because EUR is the default. A ticked
                      option drawn second, behind an unticked USD, reads
                      as though USD is the main choice and EUR the
                      afterthought — it is the other way round. */}
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
          disabled={isPending || !feeEnough}
        >
          <span>Send the request</span>
        </Button>
      </DialogFooter>

      {/* This used to be a bordered panel pinned to the bottom of the form.
          On a phone the form is several screens long, so the confirmation
          appeared below the fold: the customer pressed Send, nothing visibly
          happened, and they pressed it again. A modal cannot be scrolled
          past. */}
      <ConfirmModal
        open={!!confirming}
        onOpenChange={(next) => {
          if (!next) setConfirming(null);
        }}
        title="Send this request?"
        lead={
          isFree
            ? "Someone here picks it up and sets the account up on our Business Manager. Only send it if you actually want this account."
            : "The fee leaves your wallet the moment you send this, and someone here sets the account up on our Business Manager."
        }
        cta="Yes, send it"
        busy={isPending}
        busyLabel="Sending…"
        disabled={!feeEnough}
        /* ── SHUT THE DOOR BEFORE THE VALIDATION, NOT AFTER ──────────
           This is the only money confirmation in the app that does not
           call its mutation directly. handleSubmit is react-hook-form's
           async wrapper over an async zod resolver, so mutate() — and
           therefore isPending — is not reached until that promise chain
           settles. At the instant of the click busy is still false, the
           button is not disabled, and the handler does not close the
           dialog: setConfirming(null) only happens in the mutation
           callbacks. So the confirm button stays live across the whole
           validation gap, and two presses both reach mutate().

           ad_account_request_create_paid takes a lock on the wallet and
           then inserts unconditionally — no request key, no unique
           constraint. Two calls is EUR 100 debited and two pending
           requests for one ad account.

           A ref, not state: state read out of a closure is exactly the
           latch that does not latch. */
        onConfirm={() => {
          if (submitLatch.current) return;
          submitLatch.current = true;
          void handleSubmit(onSubmit)().finally(() => {
            submitLatch.current = false;
          });
        }}
      >
        <ConfirmFact label="Platform" value={PLATFORM_LABEL[confirming?.platform ?? "meta-ads"]} />
        <ConfirmFact label="Currency" value={confirming?.currency ?? ""} />
        <ConfirmFact
          label="Cost"
          value={
            feeUnknown
              ? "Worked out when you submit"
              : isFree
                ? "Included in your plan"
                : `${feeSymbol}${feeAmount} from your wallet`
          }
          strong
        />
      </ConfirmModal>
    </>
  );
}

// The slugs are what the database stores; these are what a person calls them.
const PLATFORM_LABEL: Record<string, string> = {
  "meta-ads": "Meta",
  "tiktok-ads": "TikTok",
  "google-ads": "Google",
};
