"use client";

import { useT } from "@/hooks/use-t";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  requestAgain,
  requestAgainBlocks,
  requestAgainMessage,
} from "@/lib/pure-request-again";
import {
  isUrlLike,
  normaliseUrl,
  URL_FIELD_MESSAGE,
} from "@/lib/url-field";
import {
  Resolver,
  useForm,
  useFormState,
  useWatch,
  Control,
  Controller,
  Path,
  UseFormSetValue,
} from "react-hook-form";
import * as z from "zod";
import { useEffect, useRef, useState } from "react";
import InputField from "../form/input-field";
import { Input } from "../ui/input";
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
import {
  BM_ID_MAX,
  parseBmIds,
  validateBmIds,
} from "@/lib/pure-bm-ids";
import { useFormDraft } from "@/hooks/use-form-draft";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";

const validations = z
  .object({
    platform: z.enum(["meta-ads", "tiktok-ads", "google-ads"]),
    currency: z.enum(["USD", "EUR"]),
    timezone: z.string().min(1, "Timezone is required"),
    notes: z.string().optional(),
    website_url: z
      .string()
      // Normalised on the way IN, not only on the way out: what
      // gets stored is what five screens later put in an href,
      // and "acme.com" there is a link to our own 404.
      .transform(normaliseUrl)
      .refine(isUrlLike, URL_FIELD_MESSAGE)
      .optional()
      .or(z.literal("")),

    // Metadata fields
    google_email: z.string().optional(),
    tiktok_business_center_id: z.string().optional(),
    tiktok_email: z.string().optional(),
    tiktok_countries: z.string().optional(),
    // ── ONE TO FIVE BUSINESS MANAGERS ────────────────────────────
    // The owner, 27-09: "advertisers mogen meerdere bms doen bij nieuwe
    // ad acc request en max 5 bm ids en min 1."
    //
    // Kept under the SAME metadata key, because the creating RPC passes
    // the object through whole and every reader looks it up by name --
    // a new key would have meant six readers finding nothing. The list
    // is validated in one place (lib/pure-bm-ids.ts) so the form, the
    // admin dialog and the account sheet cannot disagree about the
    // shape.
    facebook_business_manager_id: z.array(z.string()).optional(),
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
      const bm = validateBmIds(data.facebook_business_manager_id ?? []);
      if (!bm.ok) {
        ctx.addIssue({
          code: "custom",
          message: bm.error,
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
  // One empty box to start: the minimum is one, so asking for it is
  // honest about what has to be filled in.
  facebook_business_manager_id: [""],
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

// ── ONE TO FIVE BUSINESS MANAGERS ───────────────────────────
//
// The owner, 27-09: "advertisers mogen meerdere bms doen bij nieuwe ad
// acc request en max 5 bm ids en min 1."
//
// An advertiser who runs several business managers was filing a separate
// request per BM, or putting them all in the notes where nothing reads
// them. One row per BM, add and remove, first one required.
const BmIdFields = ({
  control,
  setValue,
}: {
  control: Control<FormValues>;
  setValue: UseFormSetValue<FormValues>;
}) => {
  const { t: tr } = useT();
  // ── THE REFUSAL HAD NOWHERE TO LAND ───────────────────────────────
  //
  // The Meta branch attaches its error to the ARRAY ROOT
  // ("facebook_business_manager_id"), and the inputs are registered at
  // `...0`, `...1`. InputField only renders the error for its own exact
  // path, so nothing was highlighted -- and nothing is registered at
  // the root either, so react-hook-form had no ref to scroll to.
  //
  // The dialog OPENS on Meta with one empty BM box. Leave it empty,
  // fill in the rest, press "Send the request": zod refuses, no
  // confirmation appears, and not one word is shown. The button simply
  // does nothing. That is the default path through this form, and I
  // put it there with the 1-to-5 change.
  const { errors } = useFormState({ control });
  const bmError = (errors as Record<string, { message?: string } | undefined>)
    ?.facebook_business_manager_id?.message;

  // ── useFieldArray DOES NOT DO STRINGS ─────────────────────────────
  //
  // This used useFieldArray on `facebook_business_manager_id`, which is
  // an array of plain strings. react-hook-form's field array keeps an
  // `id` on every entry so it can key rows, and it can only do that on
  // OBJECTS -- given strings it hands back an empty `fields`.
  //
  // So the section rendered its heading and its "+ Add another BM ID"
  // button with NO INPUT BETWEEN THEM. Walked on production: the
  // required field a Meta request cannot be sent without had nowhere to
  // type it. My own regression, from the 1-to-5 change this morning,
  // and it blocked the entire journey.
  //
  // The list is short and the state is trivial, so it is held directly:
  // useWatch to read it, setValue to change it. No ids to key on, so
  // the index is the key -- which is safe here precisely because there
  // is no library-managed identity to get out of step with it.
  const watched = useWatch({ control, name: "facebook_business_manager_id" });
  const ids: string[] = Array.isArray(watched)
    ? (watched as string[])
    : [""];
  const rows = ids.length ? ids : [""];
  const write = (next: string[]) =>
    setValue("facebook_business_manager_id", next as never, {
      shouldDirty: true,
      shouldValidate: false,
    });

  return (
    <div className="space-y-2">
      {/* ── A LABEL IS A LABEL, NOT A COLUMN ─────────────────────────
          The owner, 28-09: "dit is lelijk, de button staat op een
          lelijke plek, misschien eronder."

          This was a <span>, which is INLINE -- so the add button
          flowed up onto the same line as the heading and sat there
          like a second title. A block label puts the button back
          where it belongs: under the rows it adds to. */}
      <label
        htmlFor="fb-bm-id"
        className="block text-sm font-medium"
      >
        Facebook Business Manager ID{rows.length > 1 ? "s" : ""}
      </label>
      {/* ── ONE REQUEST IS ONE ACCOUNT ───────────────────────────────
          Up to five ids can go in here, and nothing said what five
          gets you. An admin turning this into an account makes ONE --
          createAdAccountFromRequest marks the request completed the
          moment it saves -- and the fee is charged once. Somebody who
          read the five boxes as five accounts pays EUR 50, waits, and
          gets a single account. Say it here, where the boxes are. */}
      <p className="text-muted-foreground text-xs">
        {tr("req.thisIsOneAdAccount")}</p>
      {bmError && (
        <p className="text-sm text-destructive" role="alert">
          {bmError}
        </p>
      )}
      {rows.map((val, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1">
            <Input
              id={i === 0 ? "fb-bm-id" : `fb-bm-id-${i}`}
              placeholder={i === 0 ? tr("label.req.enterFbBmId") : tr("label.req.anotherBmId")}
              value={val ?? ""}
              onChange={(e) => {
                const next = [...rows];
                next[i] = e.target.value;
                write(next);
              }}
            />
          </div>
          {/* The first row has no remove button: one is the minimum, and
              a button that refuses is worse than no button. */}
          {rows.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 shrink-0"
              onClick={() => write(rows.filter((_, j) => j !== i))}
              aria-label={tr("req.removeBusinessManagerId", { v: String(i + 1) })}
            >
              {tr("btn.remove")}</Button>
          )}
        </div>
      ))}
      {rows.length < BM_ID_MAX ? (
        <div className="pt-1">
          {/* ── "ANOTHER" BEFORE THERE IS A FIRST ────────────────────
              The owner: "eerst moet er staan Add BM want is eerste in
              plaats van add another."

              There is always one empty row on screen, so the button
              always technically adds a second -- but to somebody who
              has not typed anything yet, "another" is a word about a
              thing that does not exist. It says "another" once one is
              actually filled in. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => write([...rows, ""])}
          >
            {/* ── "EXTRA", BECAUSE THERE IS ALREADY A BOX ──────────
                The owner, 28-09, looking at it: "hier moet add a extra
                bm id."

                There is always one field on screen, so this button
                never adds the FIRST one -- it adds one more. "Add a BM
                ID" read as the way to start, next to a box that was
                already waiting for exactly that, so the two competed
                for the same click. Same word whether or not the first
                box has been typed in: what the button does does not
                change. */}
            {tr("req.addAnExtraBmId")}</Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {tr("req.thatIsTheMaximumOf", { BMIDMAX: String(BM_ID_MAX) })}</p>
      )}
      {/* The second copy of the same sentence used to sit here, and it
          promised something that is not true: "we will come back to you
          about the rest". createAdAccountFromRequest marks the request
          completed the moment the account is saved, so there is no
          "rest" to come back to. The line under the label says what
          actually happens, once. */}
    </div>
  );
};

const MetaFields = ({
  control,
  setValue,
}: {
  control: Control<FormValues>;
  setValue: UseFormSetValue<FormValues>;
}) => (
  <div className="my-4 space-y-4">
    <BmIdFields control={control} setValue={setValue} />
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
  onNeedTopUp,
}: {
  setOpen: (open: boolean) => void;
  /**
   * Wat er moet gebeuren als hier te weinig saldo blijkt te zijn.
   * Optioneel met opzet: de adverteerder-app brengt de klant naar zijn
   * wallet, het beheerscherm (accounts-table) heeft daar niets te
   * zoeken en geeft hem niet mee -- dan blijft het bij de zin.
   */
  onNeedTopUp?: () => void;
}) {
  const { t: tr } = useT();
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
  const {
    data: feePreview,
    isError: feePreviewError,
    isFetching: feePreviewFetching,
    refetch: refetchFeePreview,
  } = useQuery({
    queryKey: ["request-fee-preview", advertiserId, profile?.tenant_id],
    enabled: !!advertiserId && !!profile?.tenant_id,
    queryFn: async () => {
      const supabase = createClient();
      const [w, r, plan, reqs, accts, perks] = await Promise.all([
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
        // Requests that have NOT yet become an account.
        supabase
          .from("ad_account_requests")
          // created_at/platform/currency are for the duplicate notice --
          // see lib/pure-request-again.ts. Same read, so the count that
          // decides the fee and the list that warns about a repeat can
          // never disagree with each other.
          .select("id, status, created_at, platform, currency")
          .eq("advertiser_id", advertiserId),
        // ── AND THE ACCOUNTS THEY ALREADY HOLD ────────────────────
        //
        // The allowance used to count REQUESTS only, so an account an
        // admin set up by hand -- which leaves no request row -- used
        // none of it. A customer on a one-account plan could hold two
        // and be charged for neither. The owner's rule: an ad account
        // is an ad account, wherever it came from.
        supabase
          .from("ad_accounts")
          .select("id")
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
      // ── BUT A MISSING TABLE IS NOT A FAILED READ ──────────────────
      //
      // `advertiser_plans` and `advertiser_perks` are both added by
      // hand-pasted migrations, and CLAUDE.md's rule is explicit:
      // anything reading something a pending migration has not added
      // must hold when it is absent. actions/topup-actions.ts already
      // does exactly this for the perks read.
      //
      // Treating 42P01 / 42703 as fatal here is worse than useless: the
      // card then reads "Checking what this request costs…" for ever,
      // the confirm says "Worked out when you submit", and because
      // feeEnough lets an UNKNOWN preview through, the submit button
      // stays live. The customer confirms a EUR 50 debit without the
      // app ever stating the price or their balance, with the
      // insufficient-balance gate switched off.
      //
      // Absent table or absent column: no plan, no perks. Anything else
      // still throws.
      const softMissing = (e: { code?: string } | null) =>
        e?.code === "42P01" || e?.code === "42703" || e?.code === "PGRST205";
      const planRow = plan.error
        ? softMissing(plan.error)
          ? null
          : (() => {
              throw plan.error;
            })()
        : plan.data;
      const perkRows = perks.error
        ? softMissing(perks.error)
          ? []
          : (() => {
              throw perks.error;
            })()
        : perks.data;

      // The other three ARE load-bearing: the wallet balance, the rate
      // and the request count each decide a figure on screen, so a
      // failure has to be an unknown price rather than a wrong one.
      const failed = [w, r, reqs, accts].find((res) => res.error);
      if (failed?.error) throw failed.error;

      // ── AND A ROW maybeSingle() COULD NOT SEE IS NOT A ZERO ───────
      //
      // maybeSingle() returns null WITHOUT an error both for "no row"
      // and for "RLS refused". For the wallet that turned into
      // "Balance: EUR 0.00 -> EUR -50.00" and "Not enough balance --
      // top up before requesting", with the submit AND the confirm both
      // disabled, for a customer holding thousands. A refused read
      // presented as a zero balance, stopping the journey dead.
      //
      // No wallet row means the price is UNKNOWN, which the rest of this
      // component already knows how to say.
      if (!w.data) {
        throw new Error(tr("req.weCouldNotReadYour"));
      }

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
      // ── WHAT THEY HOLD, PLUS WHAT IS STILL COMING ────────────────
      //
      // Accounts they already have (however they got them) plus
      // requests that have not turned into one yet. A COMPLETED request
      // is deliberately not counted here -- it produced an account, and
      // that account is in the first number. Counting both would charge
      // for the same account twice.
      //
      // Same arithmetic as ad_account_request_create_paid, and no
      // lower(): the SQL compares raw, so one request stored as
      // "Rejected" must not make the screen count one fewer than the
      // server and print "Included in your plan" over a EUR 50 debit.
      const openRows = (reqs.data ?? []).filter(
        (x: { status: string | null }) =>
          !["completed", "rejected", "cancelled"].includes(x.status ?? ""),
      ) as {
        created_at: string | null;
        platform: string | null;
        currency: string | null;
      }[];
      const used = (accts.data ?? []).length + openRows.length;
      const nowMs = new Date().getTime();
      const hasFreePerk = (perkRows ?? []).some(
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
        // ── NO MADE-UP RATE ──────────────────────────────────────
        //
        // This was `|| 0.86`, mirroring the same invented fallback in
        // ad_account_request_create_paid. Screen and server then agreed
        // on the same wrong number and nothing said a rate was missing:
        // at this tenant's real rate the fee is USD 57, at 0.86 it is
        // USD 58. A dollar too much per request, on a rate that is 1.4%
        // out.
        //
        // Plak 101 makes the RPC refuse instead of guess. Null here does
        // the same on this side: the fee is not shown and submit is
        // held, rather than quoting a figure we cannot stand behind.
        rate: Number(r.data?.eur) > 0 ? Number(r.data?.eur) : null,
        included: Number(planRow?.included_ad_accounts ?? 0),
        used,
        hasFreePerk,
        open: openRows.map((x) => ({
          createdAt: x.created_at,
          platform: x.platform,
          currency: x.currency,
        })),
      };
    },
  });

  // First N requests (plan-included) are free; the fee only applies once
  // the included allowance is used up. Mirrors ad_account_request_create_paid.
  const included = feePreview?.included ?? 0;
  const used = feePreview?.used ?? 0;
  const isFree = used < included || (feePreview?.hasFreePerk ?? false);
  // Null when the fee is in dollars and no rate could be read. Not 0 --
  // 0 would read as "free", which is a different thing entirely.
  const rateUnknown =
    !isFree && selectedCurrency !== "EUR" && !feePreview?.rate;
  const feeAmount = isFree
    ? 0
    : selectedCurrency === "EUR"
      ? AD_ACCOUNT_REQUEST_FEE_EUR
      : feePreview?.rate
        ? Math.round(AD_ACCOUNT_REQUEST_FEE_EUR / feePreview.rate)
        : null;
  const feeSymbol = selectedCurrency === "USD" ? "$" : "€";
  const feeBalance =
    selectedCurrency === "USD" ? (feePreview?.usd ?? 0) : (feePreview?.eur ?? 0);
  // While the fee/balance preview is still loading (or errored) feePreview
  // is undefined and feeBalance defaults to 0 — don't flash a false
  // "not enough balance" or disable submit until we actually know.
  const feeEnough =
    isFree || !feePreview || (feeAmount !== null && feeBalance >= feeAmount);
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
  // ── AND THE PRICE HAS TO BE ON SCREEN BEFORE THEY AGREE ──────────
  //
  // feeEnough deliberately lets an unknown preview through, so a
  // still-loading read cannot flash a false "not enough balance". But
  // it also left the SUBMIT live, so on a failed preview the customer
  // could confirm with the card reading "Checking what this request
  // costs..." and the confirmation reading "Cost: worked out when you
  // submit" -- agreeing to a EUR 50 debit with no price and no
  // balance, and with the insufficient-balance guard switched off by
  // the same undefined value.
  //
  // A loading preview resolves in a moment and is worth waiting for.
  // An ERRORED one will not resolve on its own, so it gets its own
  // sentence and a way out rather than a spinner for ever.
  const feeBlocksSubmit = !isFree && feeUnknown;

  // ── A CURRENCY THE PICKER NO LONGER OFFERS ────────────────────────
  //
  // EUR is rendered only for Meta (`selectedPlatform === "meta-ads"`),
  // and `currency` defaults to EUR. So somebody who picks TikTok or
  // Google holds currency "EUR" while the only option on screen is USD
  // -- the RadioGroup is controlled, so NOTHING is ticked, and the
  // request is filed in a currency the customer was never shown and
  // could not have chosen. Walked on production, 28-09.
  //
  // Whether EUR should be Meta-only at all is the owner's call. What
  // cannot stand either way is a stored value the screen does not
  // offer, so it is corrected to the one that IS offered, in an effect
  // rather than during render.
  const eurOffered = selectedPlatform === "meta-ads";
  useEffect(() => {
    if (!eurOffered && selectedCurrency === "EUR") {
      setValue("currency", "USD", { shouldDirty: true, shouldValidate: false });
    }
  }, [eurOffered, selectedCurrency, setValue]);


  const draft = useFormDraft<FormValues>({
    formKey: "ad-account-request",
    values: liveValues,
    userScope: profile?.id ?? null,
  });
  useUnsavedChangesWarning(isDirty);

  // ── AND THE DRAFT HAS TO BE READ BACK ─────────────────────────────
  //
  // The form SAVED a draft and never restored one. `draft.hasDraft` and
  // `draft.restoredDraft` were referenced nowhere, so the whole thing
  // was write-only: platform, timezone, the Business Manager id, the
  // profile link, the website and the notes all went when the dialog
  // closed, and reopening showed blank defaults.
  //
  // Escape or a tap on the dimmed area unmounts it, and
  // useUnsavedChangesWarning is a beforeunload handler -- it does not
  // fire on a dialog close. Reproduced by closing it on production:
  // everything typed, gone.
  //
  // CLAUDE.md names this form as one of the four that must never lose
  // typing, and both siblings (wallet-topup-dialog,
  // company-onboarding-form) already restore. This one did not.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    if (!draft.hasDraft || !draft.restoredDraft) return;
    restored.current = true;
    const v = draft.restoredDraft.values as Partial<FormValues>;
    // One field at a time, so a draft written by an older version of
    // this form cannot push an unknown key into the resolver.
    (
      [
        "platform",
        "currency",
        "timezone",
        // ── THE OTHER TWO PLATFORMS WERE LEFT OUT ────────────────
        // This list had only Meta's fields. A TikTok requester
        // reloaded and got `platform: tiktok-ads` back with all
        // three of its required boxes EMPTY -- and the restore is
        // silent, so nothing said their typing had been dropped.
        // Google's email the same. Same form, same rule, three
        // fields nobody added.
        "google_email",
        "tiktok_business_center_id",
        "tiktok_email",
        "tiktok_countries",
        "personal_facebook_profile_link",
        "website_url",
        "notes",
      ] as const
    ).forEach((k) => {
      const val = v[k as keyof FormValues];
      if (typeof val === "string" && val !== "") {
        setValue(k as Path<FormValues>, val as never, { shouldDirty: true });
      }
    });
    // The BM ids are a list now, so the string-only loop above skips
    // them -- and skipping them silently is exactly the lost typing this
    // whole effect exists to prevent. Restored through the same parser,
    // which also copes with a draft written when the field was one
    // string.
    const bm = parseBmIds(v.facebook_business_manager_id);
    if (bm.length) {
      setValue("facebook_business_manager_id" as Path<FormValues>, bm as never, {
        shouldDirty: true,
      });
    }
    draft.dismissDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.hasDraft, draft.restoredDraft]);

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
  // ── ARE THEY ASKING FOR THE SAME ACCOUNT AGAIN? ─────────────────
  //
  // Nothing visibly happens after a request is sent -- somebody here
  // sets it up by hand -- so a customer who is not sure it went through
  // files it again, and the second one is another EUR 50 out of the
  // wallet plus another slot off their plan allowance. The wallet
  // dialog already says this; this journey said nothing.
  //
  // Warn, never refuse: see lib/pure-request-again.ts.
  const again = requestAgain({
    open: feePreview?.open ?? [],
    platform: confirming?.platform ?? selectedPlatform,
    currency: confirming?.currency ?? selectedCurrency,
  });
  const againMessage = requestAgainMessage(again);
  // Only ever true inside the database's own 90-second twin window. The
  // insert cannot succeed there, so offering to send it is an invitation
  // to a 409 -- which is exactly what happened on production.
  const againBlocks = requestAgainBlocks(again);
  // A ref, because state read out of a closure is the latch that does
  // not latch. See the note on the confirm handler below.
  const submitLatch = useRef(false);

  const onSubmit = (values: FormValues) => {
    if (!profile) {
      toast.error(tr("req.userProfileNotFound"));
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
        // Trimmed, de-duplicated and capped by the same parser the
        // readers use, so what is stored is exactly what they expect.
        facebook_business_manager_id: parseBmIds(
          values.facebook_business_manager_id,
        ),
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
      {/* ── THE SEND BUTTON WAS CUT OFF, NOT BELOW THE FOLD ────────
          The owner, 28-09: "ik kan niet scrollen naar de blauwe knop
          onderaan."

          DialogContent is `flex max-h-[90dvh] flex-col
          overflow-hidden`. This form was a plain block with a
          FIXED-height scrollport inside it (max-h-[70dvh]), so on a
          390x812 phone the sum -- header 90 + fee card 70 + 70dvh of
          form + footer 50 -- came out over 90dvh. The parent is
          overflow-hidden, so the excess is CLIPPED rather than
          scrollable, and what hangs off the bottom is the footer with
          the only submit button in it. No gesture could reach it.

          Exactly the fault the review dialog already carries a note
          about. Flex column, the scrollport takes what is left
          (flex-1 min-h-0), the footer never shrinks. */}
      <form
        id="ad-account-request-form"
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={handleSubmit(onSubmit)}
      >
        {/* Wallet impact — included-free vs the €50 (or USD-equiv) fee. */}
        <div
          className={`mb-4 shrink-0 rounded-md border p-3 text-sm ${
            isFree
              ? "border-emerald-500/40 bg-emerald-500/5"
              : feeEnough
                ? "bg-muted/30"
                : "border-destructive/50 bg-destructive/5"
          }`}
        >
          {feePreviewError && !feePreviewFetching ? (
            /* The read FAILED. It will not resolve by itself, so this
               says so and offers the one thing that can help, instead
               of a spinner that never stops. The submit is off while
               this shows -- see feeBlocksSubmit. */
            <>
              <div className="font-medium">
                {tr("req.weCouldnTWorkOut")}</div>
              <div className="text-muted-foreground text-xs mt-0.5">
                {tr("req.yourPlanAndBalanceDidn")}</div>
              <button
                type="button"
                className="mt-2 text-xs font-medium underline underline-offset-2"
                onClick={() => void refetchFeePreview()}
              >
                {tr("label.req.tryAgain")}</button>
            </>
          ) : feeUnknown ? (
            <>
              <div className="font-medium">
                {tr("req.checkingWhatThisRequestCosts")}</div>
              <div className="text-muted-foreground text-xs mt-0.5">
                {tr("req.yourPlanMayIncludeIt")}</div>
            </>
          ) : isFree ? (
            <>
              <div className="font-medium">{tr("req.includedInYourPlanNo")}</div>
              <div className="text-muted-foreground text-xs mt-0.5">
                {/* The free branch is reached AFTER the allowance is
                    exhausted -- that is what a free-request perk is for
                    -- so `included - used` is negative by definition
                    here, and with no plan row at all `included` is 0
                    and it read "-4 of 0". Clamped, and the sentence
                    says which of the two is covering it, because the
                    server distinguishes plan_included from perk and
                    this did not. */}
                {Math.max(0, included - used)} of {included} {" "}{tr("req.includedAdAccount")}{included === 1 ? "" : "s"} left
                {included - used <= 0
                  ? ` ${tr("req.thisOneIsCoveredBy")}`
                  : ""}
                {tr("req.yourWalletWonTBe")}</div>
            </>
          ) : (
            <>
              {/* No rate, no figure. Quoting one from a guessed rate is
                  how the server and the screen came to agree on a fee
                  that was a dollar out. */}
              {rateUnknown || feeAmount === null ? (
                <>
                  <div className="font-medium">
                    {tr("req.weCanTWorkOut", { selectedCurrency: String(selectedCurrency) })}</div>
                  {/* ── ALLEEN EEN UITWEG DIE BESTAAT ─────────────
                      Dit zei onvoorwaardelijk "request a EUR account
                      instead". Maar de EUR-keuze wordt alleen getekend
                      voor meta-ads (`eurOffered`), en een effect duwt
                      de valuta daarbuiten meteen terug naar USD. Een
                      TikTok- of Google-aanvrager kreeg dus een uitweg
                      aangewezen die op zijn scherm niet bestaat -- en
                      dat is erger dan geen uitweg, want hij gaat hem
                      zoeken. */}
                  <div className="text-muted-foreground text-xs mt-0.5">
                    {tr("req.theConversionRateCouldNot", { v: String(eurOffered
                      ? "Ask us to set it, or request a EUR account instead — nothing is charged until you submit."
                      : "Ask us to set it — nothing is charged until you submit, so nothing is lost by waiting.") })}</div>
                </>
              ) : (
                <>
                  <div className="font-medium">
                    {tr("req.adAccountRequestFee", { feeSymbol: String(feeSymbol), feeAmount: String(feeAmount) })}</div>
                  <div className="text-muted-foreground text-xs mt-0.5">
                    {tr("req.chargedFromYourWalletWhen", { feeSymbol: String(feeSymbol), v: String(feeBalance.toFixed(2)), feeSymbol2: String(feeSymbol), v2: String((feeBalance - feeAmount).toFixed(2)) })}</div>
                  {!feeEnough && (
                    <div className="text-destructive text-xs mt-1 font-medium">
                      {tr("req.notEnoughBalanceTopUp")}{/* ── EN DE WEG ERHEEN ────────────────────────
                          De zin stond hier met een dode Send-knop
                          eronder en verder niets. Opwaarderen kan
                          alleen op een ander scherm, en dit is een
                          modal -- dus de klant moest zelf bedenken dat
                          hij hier weg moest, en durfde dat niet omdat
                          hij dacht het formulier kwijt te raken. (Dat
                          raakt hij niet: use-form-draft bewaart het.) */}
                      {onNeedTopUp ? (
                        <button
                          type="button"
                          className="underline underline-offset-2 ml-1 font-semibold"
                          onClick={() => {
                            setOpen(false);
                            onNeedTopUp();
                          }}
                        >
                          {tr("label.req.topUpNow")}</button>
                      ) : null}
                    </div>
                  )}
                </>
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
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-1 py-2">
          {/* Platform Radio Group */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">{tr("label.req.selectPlatform")}</Label>
            <Controller
              control={control}
              name="platform"
              render={({ field }) => (
                <RadioGroup
                  onValueChange={field.onChange}
                  // ── value, NOT defaultValue ─────────────────────
                  //
                  // Walked on production, 28-09, on PSM0016: the
                  // picker said "Meta Ads" with the blue ring on it
                  // while the form was on tiktok-ads -- the TikTok
                  // fields were rendered underneath and the currency
                  // row had collapsed to USD only. defaultValue is
                  // read ONCE at mount, so anything that changes the
                  // platform without a click (a restored draft, a
                  // reset, a re-render that remounts the group) leaves
                  // the tick on the wrong one. The customer picks a
                  // platform, the screen shows another, and the
                  // request is filed for the one they cannot see.
                  //
                  // The currency group two blocks down was already
                  // controlled; this one was not.
                  value={field.value}
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
            <Label className="text-base font-semibold">{tr("label.adv.currency")}</Label>
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
            label={tr("label.acct.timezone")}
            name="timezone"
            id="timezone-select"
            control={control}
            options={TIMEZONES}
            placeholder={tr("label.req.selectTimezone")}
          />

          {/* Platform Specific Metadata Fields */}
          {selectedPlatform === "google-ads" && (
            <GoogleFields control={control} />
          )}
          {selectedPlatform === "tiktok-ads" && (
            <TikTokFields control={control} />
          )}
          {selectedPlatform === "meta-ads" && (
            <MetaFields control={control} setValue={setValue} />
          )}

          <InputField
            label={tr("label.req.websiteUrl")}
            name="website_url"
            id="website-url"
            placeholder="https://example.com"
            control={control}
          />

          <TextareaField
            label={tr("req.notes")}
            name="notes"
            id="account-notes"
            placeholder={tr("req.addNotes")}
            control={control}
          />
        </div>
      </form>
      <DialogFooter className="mt-4 shrink-0">
        <Button
          type="submit"
          form="ad-account-request-form"
          disabled={isPending || !feeEnough || feeBlocksSubmit}
        >
          {/* A greyed-out button with no reason is its own dead end.
              The notice at the top of the form says what happened and
              offers Try again; the label says which of the two it is
              so nobody hunts for it. */}
          <span>
            {feeBlocksSubmit
              ? feePreviewError
                ? tr("req.priceUnknownTryAgainAbove")
                : tr("req.workingOutThePrice")
              : tr("label.req.sendTheRequest")}
          </span>
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
        title={tr("req.sendThisRequest")}
        lead={
          // The duplicate warning goes FIRST when there is one: it is the
          // reason to stop, and the sentence after it is the reason to
          // go ahead.
          [
            againMessage,
            isFree
              ? "Someone here picks it up and sets the account up on our Business Manager. Only send it if you actually want this account."
              : "The fee leaves your wallet the moment you send this, and someone here sets the account up on our Business Manager.",
          ]
            .filter(Boolean)
            .join(" ")
        }
        cta={againBlocks ? tr("label.req.waitAMoment") : tr("label.adv.yesSendIt")}
        busy={isPending}
        busyLabel={tr("btn.sending")}
        disabled={!feeEnough || feeBlocksSubmit || againBlocks}
        disabledHint={
          againBlocks
            ? "We won't take a second identical request this quickly. Close this, wait a moment, and send it again if you really want another account."
            : undefined
        }
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
        <ConfirmFact label={tr("label.adv.currency")} value={confirming?.currency ?? ""} />
        <ConfirmFact
          label={tr("label.req.cost")}
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
