"use client";

import { formatCurrency } from "@/lib/utils-pure";
import { landedOnAccount } from "@/lib/pure-topup-landed";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CURRENCY_SYMBOLS,
  DATE_FORMAT,
  DATE_TIME_FORMAT,
  PLATFORMS,
} from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { AdAccount } from "@/lib/types/account";
import { platformGroupFromSlug } from "@/lib/types/ad-account-type";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  XIcon,
  SlidersHorizontal,
  ArrowDownLeft,
  CalendarDays,
  Clock,
  Globe,
  Percent,
  Wallet as WalletIcon,
} from "lucide-react";

import { toast } from "sonner";
import { Badge } from "../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Separator } from "../ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import useUpdateAccount from "./use-update-account";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/context/app-provider";
import WithdrawDialog from "@/components/withdrawals/withdraw-dialog";
import { useState } from "react";
import { AD_ACCOUNT_STATUS_CHOICES } from "@/lib/ad-account-status";
import {
  accountLockedReason,
} from "@/lib/pure-account-status";
import {
  AD_ACCOUNT_CUSTOMER_COLUMNS,
  AD_ACCOUNT_CORE_COLUMNS,
} from "@/lib/ad-account-columns";

/**
 * The statuses a withdrawal is actually refused on, mirroring
 * requestAdAccountWithdrawal. banned and closed are the platform's
 * word, not ours, and the money is not ours to move on our own say-so;
 * everything else — including `disabled`, `paused` and a status we do
 * not recognise — can be emptied back to the wallet.
 */
const withdrawalRefused = (status: string | null | undefined) => {
  const s = String(status ?? "").toLowerCase();
  return s === "banned" || s === "closed";
};

/** What this sheet reads: the account, plus the trimmed advertiser embed. */
type AccountDetailsRow = Partial<AdAccount> & {
  // Always selected, by both the full and the core list, so the two
  // consumers that hand this row on can rely on them.
  id: string;
  name: string;
  currency: string | null;
  fee: number;
  advertiser_id: string;
  platform: string;
  status: string;
  tenant_id: string;
  advertiser?: {
    id?: string | null;
    tenant_client_code?: string | null;
    profile?: {
      full_name?: string | null;
      email?: string | null;
      is_active?: boolean | null;
    } | null;
  } | null;
};

/**
 * The network the account runs on, as a mark rather than a word.
 *
 * Monochrome, on `currentColor`, so it sits on the gradient without a
 * second colour scheme to maintain. Anything we do not recognise falls
 * back to a neutral screen -- never a wrong logo.
 */
/**
 * What a CUSTOMER may be told about where their account runs: the
 * network, and nothing narrower. The `platform` column holds the
 * ad-account TYPE slug, and a type names a supplier family.
 */
function networkLabel(slug?: string | null): string {
  const group = platformGroupFromSlug(String(slug ?? ""));
  return group === "meta"
    ? "Meta"
    : group === "google"
      ? "Google"
      : group === "tiktok"
        ? "TikTok"
        : "Ad account";
}

function PlatformGlyph({ slug }: { slug?: string | null }) {
  const key = String(slug ?? "").toLowerCase();
  if (key.includes("meta") || key.includes("facebook") || key.includes("instagram")) {
    return (
      <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden fill="none"
           stroke="currentColor" strokeWidth={1.9} strokeLinecap="round">
        <path d="M3 14.2c0-3.4 1.7-6.6 3.9-6.6 1.6 0 2.6 1.2 3.7 3l1.5 2.5c1.3 2.1 2.1 3.2 3.6 3.2 1.6 0 2.6-1.6 2.6-3.9 0-2.8-1.3-5.2-3.2-5.2-1.4 0-2.6 1-4 3.1" />
        <path d="M6.9 7.6C4.7 7.6 3 10.8 3 14.2c0 2.2 1 3.9 2.7 3.9 1.4 0 2.4-.8 3.8-3" />
      </svg>
    );
  }
  if (key.includes("google") || key.includes("gdn") || key.includes("youtube")) {
    return (
      <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden fill="currentColor">
        <path d="M12 11v2.6h4.4c-.2 1.1-1.4 3.3-4.4 3.3a4.9 4.9 0 1 1 0-9.8c1.4 0 2.4.6 2.9 1.1l2-1.9A7.6 7.6 0 1 0 12 19.6c4.4 0 7.3-3.1 7.3-7.4 0-.5 0-.9-.1-1.2H12Z" />
      </svg>
    );
  }
  if (key.includes("tiktok")) {
    return (
      <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden fill="currentColor">
        <path d="M16.3 3c.3 2 1.5 3.4 3.5 3.6v2.3c-1.2.1-2.4-.2-3.5-.9v5.6c0 3.4-2.6 5.4-5.3 5.4a5.2 5.2 0 0 1-.6-10.4v2.4a2.8 2.8 0 1 0 2.4 2.8V3h3.5Z" />
      </svg>
    );
  }
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden fill="none"
         stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M9 20h6M12 16.5V20" />
    </svg>
  );
}

export function AccountDetailsSheet({
  accountId,
  open,
  setOpen,
  onSetMinTopup,
}: {
  open: boolean;
  setOpen: () => void;
  accountId: string | null;
  /**
   * Admin-only. "Set topup limit" used to be a third button on every row of
   * the accounts list, where it wrapped the actions onto a second line for a
   * setting almost nobody touches. It belongs here, with the account's other
   * settings — a list is for scanning, a detail sheet is for changing specs.
   */
  onSetMinTopup?: (account: AdAccount) => void;
}) {
  const queryClient = useQueryClient();
  const { profile } = useAppContext();
  const isAdvertiser = profile?.role === "advertiser";
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["account-details", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const supabase = createClient();
      // Named columns, not two wildcards. An ADVERTISER opens this sheet
      // in their own app (components/advertiser/adv-app.tsx), so whatever
      // the query returns lands in their browser — and advertisers(*)
      // carried `note`, the admin's private free-text remark about that
      // customer, written from the /users sheet and rendered nowhere on
      // their side. It was in the JSON and only in the JSON.
      //
      // THE EMBED WAS NARROWED AND THE OUTER `*` WAS LEFT. So the same
      // fault stayed on the parent row: `ad_accounts.notes` is where an
      // operator writes, in this file's own words 130 lines down, "things
      // like a supplier account number and the rate we pay for it", and
      // `metadata` has carried supplier provenance. Both are gated at the
      // RENDER layer here (`!isAdvertiser &&`) — and a render gate does
      // nothing about what crossed the wire, sat in the query cache, and
      // is one network tab away. gdpr-actions.ts already excludes
      // ad_accounts.notes from the customer's own export by name.
      const embed =
        ", advertiser:advertisers(id, tenant_client_code, profile:user_profiles(full_name, email, is_active))";
      // postgrest-js infers the row type from the select STRING, and a
      // string it cannot see at compile time makes it give up and infer
      // an error type — so the result is cast once, here, rather than
      // fought with at every field. The shape is AdAccount plus the one
      // embed above.
      const run = async (cols: string) => {
        const res = await supabase
          .from("ad_accounts")
          .select(cols + embed)
          .eq("id", accountId)
          .single();
        return {
          data: res.data as unknown as AccountDetailsRow | null,
          error: res.error,
        };
      };

      // An admin still needs the whole row — they are the ones the notes
      // are written by and for.
      if (!isAdvertiser) {
        const { data, error } = await run("*");
        if (error) throw error;
        return data;
      }

      const { data, error } = await run(AD_ACCOUNT_CUSTOMER_COLUMNS);
      if (error) {
        // The live schema is hand-authored and diverges from the types, so
        // a named column can simply not be there — and PostgREST's "column
        // ad_accounts.x does not exist" would land on the customer's own
        // screen. Fall back to the CORE list, never to `*`: a narrower
        // sheet is a fair trade, the leak is not.
        const retry = await run(AD_ACCOUNT_CORE_COLUMNS);
        if (retry.error) throw retry.error;
        return retry.data;
      }
      return data;
    },
  });

  const { updateAccount, isPending } = useUpdateAccount();

  const updateAccountStatus = (value: string) => {
    if (!accountId) return;
    updateAccount(
      { id: accountId, payload: { status: value } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: ["account-details", accountId],
          });
          toast.success("Account status updated successfully");
        },
      },
    );
  };

  return (
    <div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="sm:max-w-xl w-full overflow-auto">
          <SheetHeader className="sticky top-0 z-10 bg-background pb-2">
            <div className="flex items-center justify-between">
              <SheetTitle>Account Details</SheetTitle>
              {/* A 10x10 target, not a bare 20-24px glyph. These sheets are
                  passed w-full, so at 375px they cover the overlay
                  completely and tapping outside no longer closes anything
                  — this X is the only way out, and on the customer-facing
                  ones it was the smallest control on the screen. The size
                  matches .uds-x, which the user sheet already uses. */}
              <SheetClose
                aria-label="Close"
                className="-mr-1 inline-grid h-10 w-10 shrink-0 place-items-center rounded-md opacity-70 transition hover:bg-muted hover:opacity-100"
              >
                <XIcon size={20} />
              </SheetClose>
            </div>
          </SheetHeader>

          {/* Loading state */}
          {isLoading && (
            <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
          )}

          {/* Error state */}
          {isError && (
            <div className="mt-4 flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{error.message}</span>
            </div>
          )}
          {data && (
            <div className="space-y-3 px-2 sm:space-y-4">
              {/* This div was ALWAYS rendered -- an empty line of dead
                  band between the header and the first card, on a sheet
                  that is one column wide. It only ever holds a spinner. */}
              {isPending && (
                <div className="text-end">
                  <Loader2 className="animate-spin inline" />
                </div>
              )}

              {/* ── THE ACCOUNT ITSELF, NOT A LIST OF LABELS ──────────
                  This sheet opened with "Name:" over a string. The
                  account is the thing the customer came to look at, so
                  it gets a face: the network it runs on, its own name,
                  whether it is alive, and the two numbers that decide
                  what they can do next. */}
              <div
                className="relative overflow-hidden rounded-[20px] p-5 text-white shadow-[0_18px_40px_-18px_rgba(76,60,190,.65)] ring-1 ring-white/10"
                style={{
                  background:
                    "radial-gradient(120% 140% at 0% 0%, #6E8BFF 0%, #5B6CF8 38%, #7A4FE8 72%, #8B5CF6 100%)",
                }}
              >
                {/* Depth, not decoration: a light source top-left, a
                    cool fall-off bottom-right, and one diagonal sheen. */}
                <span aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-white/20 blur-3xl" />
                <span aria-hidden className="pointer-events-none absolute -left-20 -bottom-16 h-40 w-40 rounded-full bg-indigo-900/30 blur-3xl" />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-60"
                  style={{
                    background:
                      "linear-gradient(120deg,rgba(255,255,255,.18) 0%,rgba(255,255,255,0) 42%)",
                  }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
                  style={{
                    background:
                      "linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent)",
                  }}
                />

                <div className="relative flex items-start gap-3.5">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/[0.18] shadow-inner shadow-white/20 ring-1 ring-white/30 backdrop-blur-sm">
                    <PlatformGlyph slug={data.platform} />
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="truncate text-[1.15rem] font-semibold leading-tight tracking-[-0.015em] drop-shadow-sm">
                      {data.name}
                    </p>
                    {/* THE NETWORK, NEVER THE TYPE. `platform` holds the
                        ad-account type slug (eu-meta-psm,
                        hk-meta-premium), and printing it put
                        "Meta-EU-PSM" on the CUSTOMER's own screen --
                        which names the supplier family the account came
                        from. A pill with the group is all they get. */}
                    <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/[0.16] px-2.5 py-1 text-[0.7rem] font-semibold tracking-wide ring-1 ring-white/25 backdrop-blur-sm">
                      <span className="grid h-3.5 w-3.5 place-items-center [&>svg]:h-3.5 [&>svg]:w-3.5">
                        <PlatformGlyph slug={data.platform} />
                      </span>
                      {isAdvertiser
                        ? networkLabel(data.platform)
                        : (PLATFORMS.find((p) => p.value === data.platform)
                            ?.label ??
                          data.platform ??
                          "Ad account")}
                    </span>
                  </div>
                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.18] px-2.5 py-1 text-[0.66rem] font-bold uppercase tracking-[0.08em] ring-1 ring-white/30 backdrop-blur-sm">
                    <span
                      className={
                        "h-1.5 w-1.5 rounded-full " +
                        (String(data.status ?? "").toLowerCase() === "active"
                          ? "bg-emerald-300 shadow-[0_0_8px_2px_rgba(110,231,183,.7)]"
                          : "bg-white/70")
                      }
                    />
                    {String(data.status ?? "—")}
                  </span>
                </div>

                <div className="relative mt-4 grid grid-cols-2 gap-2">
                  <span className="rounded-xl bg-white/[0.13] px-3 py-2 ring-1 ring-white/20 backdrop-blur-sm">
                    <span className="block text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-white/70">
                      Currency
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
                      <WalletIcon className="h-3.5 w-3.5 opacity-80" />
                      {data.currency
                        ? `${CURRENCY_SYMBOLS[data.currency] ?? ""} ${data.currency}`
                        : "—"}
                    </span>
                  </span>
                  <span className="rounded-xl bg-white/[0.13] px-3 py-2 ring-1 ring-white/20 backdrop-blur-sm">
                    <span className="block text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-white/70">
                      Top-up fee
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
                      <Percent className="h-3.5 w-3.5 opacity-80" />
                      {data.fee == null || Number(data.fee) === 0
                        ? "Set by your plan"
                        : `${Number(data.fee)}%`}
                    </span>
                  </span>
                </div>
              </div>

              {/* ── WHAT IS LEFT TO SAY ──────────────────────────
                  The name, the network, the status, the currency and
                  the fee are all in the panel above now. Repeating them
                  as "Name:" over a string was most of why this screen
                  read like a database dump. What remains is three facts
                  that earn a row each. */}
              <Card className="p-4 sm:gap-6 gap-3">
                <h3 className="font-semibold">Account details</h3>
                <dl className="divide-y text-sm">
                  <div className="flex items-center gap-3 py-2.5 first:pt-0">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <CalendarDays className="h-4 w-4" />
                    </span>
                    <dt className="text-muted-foreground">Opened</dt>
                    <dd className="ml-auto text-right font-medium tabular-nums">
                      {/* NEVER dayjs(undefined) -- that is today, printed
                          as a fact. A date we do not have is a dash. */}
                      {data.start_date || data.created_at
                        ? dayjs(data.start_date || data.created_at).format(
                            DATE_TIME_FORMAT,
                          )
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex items-center gap-3 py-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Globe className="h-4 w-4" />
                    </span>
                    <dt className="text-muted-foreground">Website</dt>
                    <dd className="ml-auto min-w-0 text-right font-medium">
                      {data.website_url ? (
                        <a
                          href={data.website_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-primary hover:underline"
                        >
                          {data.website_url}
                        </a>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div className="flex items-center gap-3 py-2.5 last:pb-0">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Clock className="h-4 w-4" />
                    </span>
                    <dt className="text-muted-foreground">Timezone</dt>
                    <dd className="ml-auto text-right font-medium">
                      {data.timezone || "—"}
                    </dd>
                  </div>
                </dl>

                {/* ADMIN FREE TEXT, AND IT IS NOT THE CUSTOMER'S.
                    This sheet is mounted inside the advertiser app and
                    opened from any account card, and these two blocks had
                    no role check while three others in this same file do.
                    ad_accounts.notes is excluded from the customer's own
                    GDPR export by name — "admin free text about the
                    customer's account" — because it is where an operator
                    writes things like a supplier account number and the
                    rate we pay for it. */}
                {!isAdvertiser && data.notes && (
                  <div className="mt-2 text-sm">
                    <span className="font-medium text-muted-foreground block">
                      Notes:
                    </span>
                    <p className="whitespace-pre-wrap text-muted-foreground/90">
                      {data.notes}
                    </p>
                  </div>
                )}

                {/* Metadata Fields Section — admin-only for the same
                    reason: every key is rendered, whatever was put in it. */}
                {!isAdvertiser &&
                  (data.metadata as Record<string, string | string[]>) &&
                  Object.keys(data.metadata || {}).length > 0 &&
                  (() => {
                    const metadata = data.metadata as Record<
                      string,
                      string | string[]
                    >;
                    return (
                      <>
                        <Separator className="my-2" />
                        <div className="space-y-2">
                          <h4 className="font-medium text-sm">
                            Platform Details
                          </h4>
                          <div>
                            <span className="font-medium text-muted-foreground block">
                              Platform:
                            </span>
                            {PLATFORMS.find((p) => p.value === data.platform)
                              ?.label || "—"}
                          </div>
                          <div className="grid sm:grid-cols-2 gap-4 text-sm">
                            {data.platform === "google" &&
                              metadata.google_email && (
                                <div className="col-span-2">
                                  <span className="font-medium text-muted-foreground block">
                                    Google Email:
                                  </span>
                                  {metadata.google_email}
                                </div>
                              )}

                            {data.platform === "tiktok" && (
                              <>
                                <div>
                                  <span className="font-medium text-muted-foreground block">
                                    Business Center ID:
                                  </span>
                                  {metadata.tiktok_business_center_id || "—"}
                                </div>
                                <div>
                                  <span className="font-medium text-muted-foreground block">
                                    TikTok Email:
                                  </span>
                                  {metadata.tiktok_email || "—"}
                                </div>
                                <div className="col-span-2">
                                  <span className="font-medium text-muted-foreground block">
                                    Countries:
                                  </span>
                                  {Array.isArray(metadata.tiktok_countries)
                                    ? metadata.tiktok_countries.join(", ")
                                    : metadata.tiktok_countries || "—"}
                                </div>
                              </>
                            )}

                            {data.platform?.includes("meta") && (
                              <>
                                <div>
                                  <span className="font-medium text-muted-foreground block">
                                    FB Business Manager ID:
                                  </span>
                                  {metadata.facebook_business_manager_id || "—"}
                                </div>
                                <div className="col-span-2">
                                  <span className="font-medium text-muted-foreground block">
                                    FB Profile Link:
                                  </span>
                                  {metadata.personal_facebook_profile_link ? (
                                    <a
                                      href={
                                        metadata.personal_facebook_profile_link as string
                                      }
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary hover:underline truncate block"
                                    >
                                      {metadata.personal_facebook_profile_link}
                                    </a>
                                  ) : (
                                    "—"
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                {!isAdvertiser && (
                  <>
                    <Separator />
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-muted-foreground">
                          Status:
                        </span>{" "}
                        <Select
                          value={data.status}
                          onValueChange={updateAccountStatus}
                        >
                          <SelectTrigger className="capitalize" size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          {/* ── THE APP'S OWN LIST, NOT A LOCAL COPY ────
                              lib/ad-account-status.ts is the single source
                              of truth and says the three an admin may
                              CHOOSE are active / disabled / banned.
                              `paused` is written by the supplier sync, not
                              picked. So this offered a status nobody sets
                              and omitted the one everything else uses:
                              /accounts filters by Disabled, J8 step 1 says
                              to set Disabled, and the pool-release guard
                              names it.
                              Worse, on a `disabled` (or pending, or
                              suspended) account there was NO matching
                              item, so the control rendered EMPTY — and the
                              only "off" option offered was Banned, which
                              tells the customer "closed by the platform".
                              The current value is kept as an extra option
                              so a status we did not set still shows. */}
                          <SelectContent>
                            {AD_ACCOUNT_STATUS_CHOICES.map((c) => (
                              <SelectItem key={c.value} value={c.value}>
                                {c.label}
                              </SelectItem>
                            ))}
                            {(() => {
                              const cur = String(
                                (data as { status?: string | null } | null)
                                  ?.status ?? "",
                              ).toLowerCase();
                              const known = AD_ACCOUNT_STATUS_CHOICES.some(
                                (c) => c.value === cur,
                              );
                              return cur && !known ? (
                                <SelectItem value={cur} className="capitalize">
                                  {cur} (set elsewhere)
                                </SelectItem>
                              ) : null;
                            })()}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </>
                )}
              </Card>

              {/* --- Advertiser Information --- */}
              {data.advertiser && (
                <Card className="p-4">
                  <h3 className="font-semibold">Advertiser Information</h3>
                  <div className="grid sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="font-medium text-muted-foreground">
                        Client Code:
                      </span>{" "}
                      {data.advertiser.tenant_client_code || "—"}
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">
                        Full Name:
                      </span>{" "}
                      {data.advertiser.profile?.full_name || "—"}
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">
                        Email:
                      </span>{" "}
                      {data.advertiser.profile?.email || "—"}
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">
                        Active:
                      </span>{" "}
                      {data.advertiser.profile?.is_active ? "Yes" : "No"}
                    </div>
                  </div>
                </Card>
              )}

              <div className="flex justify-end gap-2">
                {!isAdvertiser && onSetMinTopup && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setOpen();
                      // Admin-only branch, so `data` came from the "*"
                      // read and really is the whole row. The type is
                      // Partial because the CUSTOMER read is not.
                      onSetMinTopup(data as AdAccount);
                    }}
                  >
                    <SlidersHorizontal /> Set topup limit
                  </Button>
                )}
                {/* NOT ON A SWITCHED-OFF ACCOUNT. The card in the
                    advertiser app correctly hides Top up when the status
                    is locked — but the card body is still clickable and
                    opens this sheet, which gated Withdraw on "is this an
                    advertiser" and nothing else. A real pending
                    withdrawal was created on a disabled account and an
                    admin could approve it. See lib/pure-account-status. */}
                {isAdvertiser && (
                  <Button
                    variant="outline"
                    /* ── THE ONLY DOOR THE MONEY HAS ──────────────────
                       isAccountLocked() locks everything that is not
                       active/approved/live, including `disabled` — and
                       `disabled` is exactly the state an account is put
                       into BEFORE it is emptied and released back to
                       the pool. The server was changed to allow it
                       (withdrawal-actions.ts: only banned and closed
                       refuse, because "you empty it FIRST and release
                       it after") and this button was not, so the one
                       control that moves that money stayed greyed out
                       and the balance was stranded. Same rule on both
                       sides now. */
                    disabled={withdrawalRefused(
                      (data as { status?: string | null } | null)?.status,
                    )}
                    title={
                      withdrawalRefused(
                        (data as { status?: string | null } | null)?.status,
                      )
                        ? accountLockedReason(
                            (data as { status?: string | null } | null)?.status,
                          ) ?? "This account is switched off."
                        : "Move funds back to your wallet"
                    }
                    onClick={() => setWithdrawOpen(true)}
                    /* The one control on this sheet that moves money, and
                       it was a small outline button floating at the right
                       edge under a list of labels. Full width, its own
                       icon, and it lifts on hover. */
                    className="w-full justify-center gap-2 rounded-xl border-primary/25 bg-primary/[0.04] py-5 font-semibold text-primary transition-all hover:-translate-y-px hover:bg-primary/10 hover:shadow-md disabled:translate-y-0 disabled:shadow-none"
                  >
                    <ArrowDownLeft className="h-4 w-4" />
                    Withdraw to wallet
                  </Button>
                )}
              </div>

              {/* Same cast, same reason: TopupHistory reads id and
                  currency, both present in every variant of the read. */}
              <TopupHistory account={data as AdAccount} />
            </div>
          )}
        </SheetContent>
      </Sheet>

      {data && (
        <WithdrawDialog
          open={withdrawOpen}
          onOpenChange={setWithdrawOpen}
          adAccountId={data.id}
          adAccountName={data.name}
          defaultCurrency={
            (data.currency as "USD" | "EUR") === "EUR" ? "EUR" : "USD"
          }
        />
      )}
    </div>
  );
}

function TopupHistory({ account }: { account: AdAccount }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["top-ups", account.id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("top_ups")
        // NOT select("*"). Five columns render and the whole row crossed
        // the wire — including top_ups.source, which the GDPR export
        // excludes by name because it "can carry a supplier identifier",
        // and top_ups.notes. The same leak one file over was closed with
        // this exact shape and the note "not rendering is not the same as
        // not sending".
        .select(
          // topup_usd IS THE DISCRIMINATOR, so it has to be asked for.
          // Without it landedOnAccount sees undefined, reads every row as
          // an admin row and prints dollars over a euro account -- which
          // is exactly what this sheet did after the currency fix landed,
          // because the fix was in the cell and the column was not in the
          // select.
          "id, created_at, amount_received, currency, topup_amount, topup_usd, fee, fee_amount, status",
        )
        .eq("account_id", account.id)
        // A deleted top-up is not history. This sheet is shown to the
        // ADVERTISER as well as the admin, so a struck-out row read as a
        // funding they never received.
        //
        // ...and if that column is not on this database yet, show the
        // history WITHOUT the filter rather than showing nothing. A
        // filter that makes a list more correct must not be able to take
        // the list away.
        .not("is_deleted", "is", true)
        // NEWEST FIRST. There was no order at all, so a money history
        // came back in whatever order Postgres happened to return —
        // which changes between reads. A dated column that is not in
        // date order reads as a mistake, and the top of the list is the
        // part anybody actually looks at.
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      if (error) {
        const retry = await supabase
          .from("top_ups")
          .select(
            "id, created_at, amount_received, currency, topup_amount, topup_usd, fee, fee_amount, status",
          )
          .eq("account_id", account.id)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false });
        if (retry.error) throw retry.error;
        return retry.data;
      }
      return data;
    },
  });

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className=" font-semibold">Top-up History</h3>
      </div>

      {/* ── THE TOTALS, BEFORE THE ROWS ──────────────────────────
          Four fundings in a table that scrolls sideways on a phone tell
          you nothing at a glance. These three say it in one line each,
          and they are computed from the same rows below -- never from a
          second read that could disagree with them. */}
      {!isLoading && !isError && !!data?.length && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          {(() => {
            const done = data.filter((t) => t.status === "completed");
            const paid = done.reduce(
              (n, t) => n + (Number(t.amount_received) || 0),
              0,
            );
            const landed = done.reduce((n, t) => {
              const l = landedOnAccount(t);
              return n + (l.amount ?? 0);
            }, 0);
            const cur = account.currency ?? "EUR";
            const tile = (label: string, value: string) => (
              <div
                key={label}
                className="rounded-xl border bg-gradient-to-b from-muted/40 to-transparent p-3"
              >
                <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 font-semibold tabular-nums leading-tight">
                  {value}
                </p>
              </div>
            );
            return (
              <>
                {tile("Funded", formatCurrency(paid, cur))}
                {tile("On the account", formatCurrency(landed, cur))}
                {tile("Fees paid", formatCurrency(Math.round((paid - landed) * 100) / 100, cur))}
              </>
            );
          })()}
        </div>
      )}

      {/* ── ON A PHONE, CARDS ─────────────────────────────────────
          The table below is five columns wide and the sheet is 375px,
          so it scrolled sideways: the status of a funding sat off the
          right edge of the screen. Same rows, stacked. */}
      <div className="space-y-2 sm:hidden">
        {isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        ) : isError ? (
          <p className="py-4 text-center text-sm text-destructive">
            Couldn&apos;t load the top-up history — this is NOT an empty
            history. Reload to retry.
          </p>
        ) : !data?.length ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No top-ups yet.
          </p>
        ) : (
          data.map((topup) => {
            const landed = landedOnAccount(topup);
            const ok = topup.status === "completed";
            return (
              <div
                key={topup.id}
                className="rounded-xl border bg-card p-3 transition-shadow hover:shadow-sm"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {dayjs(topup.created_at).format(DATE_FORMAT)}
                  </span>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide " +
                      (ok
                        ? "bg-emerald-500/10 text-emerald-700"
                        : topup.status === "rejected"
                          ? "bg-rose-500/10 text-rose-700"
                          : "bg-amber-500/10 text-amber-700")
                    }
                  >
                    {topup.status}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(
                      Number(topup.amount_received),
                      topup.currency ?? "EUR",
                    )}
                  </span>
                  <span aria-hidden className="text-muted-foreground">
                    &rarr;
                  </span>
                  <span className="font-semibold tabular-nums text-primary">
                    {landed.amount === null
                      ? "—"
                      : formatCurrency(landed.amount, landed.currency)}
                  </span>
                  <span className="ml-auto rounded-md bg-muted px-1.5 py-0.5 text-[0.68rem] font-medium text-muted-foreground">
                    {topup.fee}% fee
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="hidden rounded-md border sm:block">
        <Table>
          <TableHeader className="bg-background">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Amount Paid</TableHead>
              {/* Not "(USD)". A customer-filed funding lands in the
                  ACCOUNT's currency, and this account may well be in
                  euros — which the panel two blocks up says out loud. */}
              <TableHead>Landed on the account</TableHead>
              <TableHead>Fee</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Three different facts, three different sentences. "No Topups
                yet" was shown while loading AND after a failed read, so an
                account that had received tens of thousands could state that
                it had received nothing. */}
            {isLoading ? (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={5}
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell className="text-center text-destructive" colSpan={5}>
                  Couldn&apos;t load the top-up history — this is NOT an empty
                  history. Reload to retry.
                </TableCell>
              </TableRow>
            ) : (
              !data?.length && (
                <TableRow>
                  <TableCell
                    className="text-center text-muted-foreground"
                    colSpan={5}
                  >
                    No Topups yet
                  </TableCell>
                </TableRow>
              )
            )}
            {data?.map((topup) => (
              <TableRow key={topup.id}>
                <TableCell>
                  {dayjs(topup.created_at).format(DATE_FORMAT)}
                </TableCell>
                {/* Through a formatter. These printed the raw column, so
                    a value still stored as `real` rendered as
                    1139.5300292968750 on the customer's own funding
                    history, and 10,000 as "10000". */}
                <TableCell>
                  {formatCurrency(
                    Number(topup.amount_received),
                    topup.currency ?? "EUR",
                  )}
                </TableCell>
                {/* ── topup_amount IS NOT ALWAYS DOLLARS ──────────────
                    The comment that used to sit here said "topup_amount
                    is a USD figure by construction", and that is true of
                    the ADMIN paths only: calculateTopupAmount converts to
                    USD first and stores dollars. The CUSTOMER's own RPC
                    takes the fee in the PAYMENT currency and stores the
                    net there, putting the dollar figure in `topup_usd`.

                    So on a EUR account funded by the customer this cell
                    printed "$97.00" next to "Amount Paid €100.00", on a
                    sheet that states "Currency: EUR" a few rows above.
                    Three statements about one payment, two of them
                    wrong, on the customer's own screen.

                    `topup_usd` present <=> customer row. That is the
                    discriminator lib/pure-topup-landed.ts exists for,
                    and it is not a guess. */}
                <TableCell>
                  {(() => {
                    const landed = landedOnAccount(topup);
                    return landed.amount === null
                      ? "—"
                      : formatCurrency(landed.amount, landed.currency);
                  })()}
                </TableCell>
                <TableCell>{topup.fee}%</TableCell>
                <TableCell className="capitalize">
                  <Badge variant={"outline"}>
                    {" "}
                    {topup.status === "completed" && (
                      <CheckCircle2 color="green" />
                    )}
                    {topup.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
