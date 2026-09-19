"use client";

import { formatCurrency } from "@/lib/utils-pure";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { AlertCircle, CheckCircle2, Loader2, XIcon, SlidersHorizontal } from "lucide-react";

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
  isAccountLocked,
  accountLockedReason,
} from "@/lib/pure-account-status";
import {
  AD_ACCOUNT_CUSTOMER_COLUMNS,
  AD_ACCOUNT_CORE_COLUMNS,
} from "@/lib/ad-account-columns";

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
          <SheetHeader className="sticky top-0 bg-background">
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
            <div className=" sm:space-y-6 space-y-3 px-2">
              <div className="text-end">
                {isPending && <Loader2 className="animate-spin inline" />}
              </div>
              {/* --- Account Overview --- */}
              <Card className="p-4 sm:gap-6 gap-3">
                <h3 className=" font-semibold">Account Overview</h3>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-muted-foreground block">
                      Name:
                    </span>
                    {data.name}
                  </div>

                  <div>
                    <span className="font-medium text-muted-foreground block">
                      Created At:
                    </span>
                    {dayjs(data.start_date).format(DATE_TIME_FORMAT)}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground block">
                      Fee:
                    </span>
                    {data.fee == null || Number(data.fee) === 0 ? "Set by your plan" : `${Number(data.fee)}%`}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground block">
                      Currency:
                    </span>
                    {data.currency
                      ? `${CURRENCY_SYMBOLS[data.currency] ?? data.currency} ${data.currency}`
                      : "—"}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground block">
                      Website URL:
                    </span>
                    {data.website_url ? (
                      <a
                        href={data.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline truncate block"
                      >
                        {data.website_url}
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div>
                    <span className="font-medium text-muted-foreground block">
                      Timezone:
                    </span>
                    {data.timezone || "—"}
                  </div>
                </div>

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
                    disabled={isAccountLocked(
                      (data as { status?: string | null } | null)?.status,
                    )}
                    title={
                      accountLockedReason(
                        (data as { status?: string | null } | null)?.status,
                      ) ?? "Move funds back to your wallet"
                    }
                    onClick={() => setWithdrawOpen(true)}
                  >
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
          "id, created_at, amount_received, currency, topup_amount, fee, fee_amount, status",
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
            "id, created_at, amount_received, currency, topup_amount, fee, fee_amount, status",
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

      <div className="rounded-md border">
        <Table>
          <TableHeader className="bg-background">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Amount Paid</TableHead>
              <TableHead>Topup Amount (USD)</TableHead>
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
                {/* topup_amount is a USD figure by construction —
                    calculateTopupAmount divides the received amount by the
                    rate and subtracts the fee (lib/utils-pure.ts). Labelling
                    it with the PAYMENT currency's symbol turned $1,139.53
                    into "€1,139.53", a ~16% misstatement on a money screen. */}
                <TableCell>
                  {formatCurrency(Number(topup.topup_amount), "USD")}
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
