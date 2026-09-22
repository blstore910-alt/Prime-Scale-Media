"use client";

import PrivacyControls from "@/components/profile/privacy-controls";

import { copyText } from "@/lib/copy-text";
import { dmSans, jakarta } from "@/lib/fonts";
import { signOutCompletely } from "@/lib/auth/sign-out";
import { useAppContext } from "@/context/app-provider";
import PlatformMark from "@/components/psm/platform-mark";
import { createClient } from "@/lib/supabase/client";
import { pageAllRows } from "@/lib/page-all-rows";
import { customerPlatformName } from "@/lib/pure-platform-badge";
import { openWhatsapp, whatsappUrl } from "@/lib/whatsapp";
import WhatsappIcon from "@/components/psm/whatsapp-icon";
import AffiliateApplicationCard from "@/components/advertiser/affiliate-application-card";
import RangePicker, {
  rangeCaption,
  rangeDates,
  type AffRange,
} from "@/components/advertiser/range-picker";
import useAffiliateStats from "@/hooks/use-affiliate-stats";
import useUsdToEur from "@/hooks/use-usd-to-eur";
import {
  unpaidSubscriptionInvoices,
  unpaidTotalsByCurrency,
  unpaidTotalsText,
  walletCurrencyOf,
} from "@/lib/pure-invoice-due";
import { getRate, neededFromAmount, otherWalletCovers } from "@/lib/pure-exchange";
import TaxRatesDialog from "./tax-rates-dialog";
import useNotifications from "@/components/notifications/use-notifications";
import { getNotificationCopy } from "@/components/notifications/notification-utils";
import { isCustomerVisibleType } from "@/lib/notification-catalog";
import { updateOwnProfileAndCompany } from "@/actions/company-actions";
import { getURL } from "@/lib/utils";
import {
  AD_ACCOUNT_CUSTOMER_COLUMNS,
  AD_ACCOUNT_CORE_COLUMNS,
} from "@/lib/ad-account-columns";
import { rateForDirection } from "@/lib/pure-exchange";
import {
  isCompanyComplete,
  missingCompanyFields,
} from "@/lib/pure-company-complete";
import { AdAccount } from "@/lib/types/account";
import { Wallet } from "@/lib/types/wallet";
import { InvoiceWithRelations } from "@/lib/types/invoice-extended";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useRouter } from "next/navigation";
import { userFacingErrorMessage } from "@/lib/pure-error";
import { useEffect, useRef, useState } from "react";
import BalanceHero from "./balance-hero";
import { toast } from "sonner";
import { ADV_CSS } from "./adv-shell-css";
import { AdvIcons, Ic } from "./adv-icons";
import WalletTopupDialog from "@/components/wallet/wallet-topup-dialog";
import WalletExchangeDialog from "@/components/wallet/wallet-exchange-dialog";
import CreateTopupDialog from "@/components/topups/create-topup-dialog";
import RequestAdAccountDialog from "@/components/account/request-ad-account-dialog";
import useAdAccountRequests from "@/components/ad-account-requests/use-ad-account-requests";
import useNotificationPreferences from "@/hooks/use-notification-preferences";
import type { NotificationType } from "@/lib/types/notification";
import { AccountDetailsSheet } from "@/components/account/account-details-sheet";
import OnboardingChecklist from "./onboarding-checklist";
import AffiliateCommissionsCard from "./affiliate-commissions-card";
import useIsAffiliate from "@/components/commissions/use-is-affiliate";
import InvoiceDocButtons from "@/components/invoices/invoice-doc-buttons";
import { formatPaymentReference } from "@/lib/payment-reference";
import { invoiceTypeLabel } from "@/lib/invoice-type";
import { invoiceStatusView } from "@/lib/invoice-status";
import { effectiveMinTopup } from "@/lib/min-topup";
import { useAdvertiserCommunities } from "@/hooks/use-advertiser-communities";
import PsmAvatar from "@/components/ui/psm-avatar";
import FinanceReport from "@/components/finance/finance-report";
import { isAccountLocked } from "@/lib/pure-account-status";
import { currencySymbol } from "@/lib/pure-invoice-currency";
import { catalogForRole } from "@/lib/notification-catalog";
import { landedOnAccount } from "@/lib/pure-topup-landed";

dayjs.extend(relativeTime);

type View =
  | "dash"
  | "wallet"
  | "accounts"
  | "requests"
  | "billing"
  | "report"
  | "referrals"
  | "notif"
  | "settings"
  | "help";
const TITLES: Record<View, string> = {
  dash: "Dashboard",
  wallet: "Wallet",
  accounts: "Ad accounts",
  requests: "Requests",
  billing: "Billing",
  report: "Financial report",
  referrals: "Affiliate program",
  notif: "Notifications",
  settings: "Settings",
  help: "Get help",
};

// A BALANCE IS NOT A ROUNDED FIGURE either. These print the wallet
// tiles and the header, and Math.round showed 1,234.49 as "1,234" and
// 1,234.50 as "1,235" — while the top-up dialog's "Wallet afterwards"
// and the ad-account form's "Current balance" both print two decimals.
// Two screens, up to fifty cents apart, about the same money.
const eur = (n: number | string | null | undefined) =>
  "€" +
  (Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const usd = (n: number | string | null | undefined) =>
  "$" +
  (Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
// Two letters for a referral's avatar. Never empty: a customer with no
// name yet still gets a mark.
const refInitials = (name: string | null | undefined) =>
  String(name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase() || "?";
const money2 = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n ?? 0));
// ── A WHOLE PRICE DOES NOT NEED ".00" ──────────────────────────────
//
// For a RECORD -- an invoice line, a wallet movement, a confirmation --
// two decimals always, because those are exact amounts and a missing
// cent is a wrong figure.
//
// For the big price on the plan card it is noise: "EUR 200.00 / month"
// reads like a total, "EUR 200 / month" reads like a price. The
// decimals stay the moment there is anything in them, so EUR 99.50 is
// still EUR 99.50 -- rounding that to EUR 100 is the exact fault
// planMoney was fixed for.
const moneyNeat = (n: number | string | null | undefined) => {
  const s = money2(n);
  return s.endsWith(".00") ? s.slice(0, -3) : s;
};
// A figure whose currency is not fixed by the screen it is on — an ad
// account has its own, and printing every one of them in dollars is
// how "Funded to date $97.00" ended up on a euro account.
const money2sym = (
  n: number | string | null | undefined,
  currency: string | null | undefined,
) =>
  (String(currency ?? "EUR").toUpperCase() === "USD" ? "$" : "€") + money2(n);

// Every "contact us" action is WhatsApp now -- see lib/whatsapp.ts.

// ── A CUSTOMER READS THE NETWORK, NEVER THE TYPE ───────────────────
//
// `platform` on an ad account is the TYPE slug (`eu-meta-psm`), and this
// looked it up in PLATFORMS -- so every account tile said "Meta-EU-PSM"
// under the customer's own account name: our region, our routing, our
// price tier. The owner found it there more than once. Before that it
// fell back to the raw slug and printed "meta-ads" on Requests.
//
// Now the network name only ("Meta", "TikTok", "Google"), and nothing at
// all for a platform we cannot name -- never the slug.
const platformLabel = (p: string | null) => customerPlatformName(p) ?? "";


// Every status an ad account can hold, and NOT an "anything else is fine"
// fallback. That fallback is how `disabled` — the status an admin actually
// picks to switch an account off, and the one the pool-release guard tells
// them to use — came out GREEN and reading "disabled", with a live Top up
// button beside it. A status we do not recognise is not a working account;
// it is a status nobody has taught this screen, and the customer should
// not be invited to put money on it.

const statusBadge = (st: string | null) => {
  const v = (st ?? "").trim().toLowerCase();
  if (v === "active") return { cls: "ok", label: "Active" };
  if (v === "paused") return { cls: "pend", label: "Paused" };
  if (v === "pending") return { cls: "pend", label: "Setting up" };
  if (v === "banned") return { cls: "due", label: "Banned" };
  if (v === "disabled") return { cls: "due", label: "Switched off" };
  if (v === "suspended") return { cls: "due", label: "Suspended" };
  if (v === "inactive") return { cls: "muted", label: "Inactive" };
  // ── AN EMPTY STATUS IS NOT "ACTIVE" ─────────────────────────────────
  //
  // isAccountLocked("") returns TRUE, so the same card said "Active" in
  // green and "This account isn't taking top-ups right now" underneath —
  // and the admin table calls it "Unknown". Three answers for one row,
  // and createAdAccountAsAdmin never sets a status, so this is the state
  // of every account it creates.
  //
  // The lock is the one that decides what the customer can DO, so the
  // label follows it rather than contradicting it.
  if (!v) return { cls: "pend", label: "Being set up" };
  return { cls: "pend", label: v.charAt(0).toUpperCase() + v.slice(1) };
};

/**
 * A subscription status in the words a customer uses.
 *
 * Three screens printed `status[0].toUpperCase() + status.slice(1)` on a
 * value the query deliberately allows to be `past_due` — so a customer
 * behind on a payment read "Past_due", underscore and all, on their own
 * dashboard, in the topbar pill and on the billing card.
 */
function subStatusLabel(status: string | null | undefined): string {
  const s = String(status ?? "").trim();
  if (!s) return "—";
  if (s === "past_due") return "Payment due";
  return s[0].toUpperCase() + s.slice(1).replace(/_/g, " ");
}

export default function AdvertiserApp() {
  const { profile } = useAppContext();
  const queryClient = useQueryClient();
  // A referral picked on the Referrals screen: the commission list below
  // narrows to them.
  const [refFocus, setRefFocus] = useState<string | null>(null);
  // The period for the Referrals stats, rows and commission list.
  const [affRange, setAffRange] = useState<AffRange>({ key: "all" });
  const meRouter = useRouter();
  const [view, setView] = useState<View>("dash");
  // Where the bell was pressed from, so pressing it again returns there.
  const viewBeforeNotifs = useRef<View>("dash");
  const [navOpen, setNavOpen] = useState(false);

  const [topupOpen, setTopupOpen] = useState(false);
  // WHICH wallet the customer pressed Top up on. Both cards called the
  // same opener with no currency and the dialog hard-defaulted to EUR, so
  // pressing Top up inside the card labelled "USD wallet" opened a EUR
  // top-up — and somebody who did not re-read the third line wired
  // dollars and filed the claim in euros.
  // Five is what fits before the card becomes a list you scroll past
  // rather than a summary you read. The rest are one tap away.
  const [showAllInvoices, setShowAllInvoices] = useState(false);
  const [applying, setApplying] = useState(false);
  const [affiliateApplied, setAffiliateApplied] = useState(false);
  const [topupCurrency, setTopupCurrency] = useState<"EUR" | "USD">("EUR");
  const openTopup = (cur: "EUR" | "USD") => {
    setTopupCurrency(cur);
    setTopupOpen(true);
  };
  // ── AND THE SAME FOR EXCHANGE ───────────────────────────────────────
  //
  // Top up was fixed for this and Exchange was not, nine lines apart in
  // the same file. All three Exchange buttons called the opener with no
  // currency, and the dialog hard-defaults to converting FROM USD —
  // overriding only when exactly one balance is non-zero. So a customer
  // holding both, pressing Exchange inside the card headed "EUR wallet",
  // got a USD -> EUR conversion whose every figure was internally
  // consistent and in the wrong direction. Reversing it costs the 0.6%
  // again plus the spread.
  const [exchangeFrom, setExchangeFrom] = useState<"EUR" | "USD">("USD");
  // ── AND WHAT IT WAS OPENED FOR ──────────────────────────────────────
  //
  // "Exchange to pay EUR 5.00" opened a dialog that knew nothing about
  // five euros: an empty amount box, and the customer left to do the
  // conversion and the 0.6% fee in their head. A cent short and the
  // payment they came to make is refused anyway.
  const [exchangeNeed, setExchangeNeed] = useState<{
    amount: number;
    currency: "EUR" | "USD";
    label: string;
  } | null>(null);
  const openExchange = (
    cur: "EUR" | "USD",
    need?: { amount: number; currency: "EUR" | "USD"; label: string } | null,
  ) => {
    setExchangeFrom(cur);
    setExchangeNeed(need ?? null);
    setExchangeOpen(true);
  };
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [acctTopup, setAcctTopup] = useState<AdAccount | null>(null);
  const [acctTopupOpen, setAcctTopupOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const advertiserId = profile?.advertiser?.[0]?.id ?? null;
  const tenantId = profile?.tenant_id ?? null;

  // isError, not only isLoading. An extra ad-account request charges EUR
  // 50 from the wallet on submit and ad_account_request_create_paid has
  // no duplicate guard — so a customer who filed one, saw "Nothing here
  // yet" because the read failed, and filed again is charged twice. The
  // hook has exported isError all along.
  const {
    requests: myRequests,
    isLoading: isRequestsLoading,
    isError: isRequestsError,
  } = useAdAccountRequests({
      advertiserId: advertiserId ?? undefined,
      tenantId: tenantId ?? undefined,
      perPage: 50,
      enabled: !!advertiserId,
    });
  const name = (profile?.full_name as string) ?? "there";
  const firstName = name.split(" ")[0];
  // Approved affiliate or not. An `active` referral_links row is the only
  // thing that makes an advertiser one.
  // isLoading too. The hook sets retry: 2 on purpose -- "three tries
  // before anybody is told they are not an affiliate" -- so the window
  // where isAffiliate is false and isError is false is SECONDS, not
  // milliseconds. During it, an approved affiliate was shown the
  // "Get paid for the people you bring in / Join the affiliate program"
  // hero instead of their own referral book, and a "Become an affiliate"
  // card in Settings that the flag is read two lines above to prevent.
  const {
    isAffiliate,
    isError: affiliateError,
    isLoading: affiliateLoading,
    application: affiliateApplication,
    refusalReason: affiliateRefusal,
    appliedAt: affiliateAppliedAt,
  } = useIsAffiliate();
  const affiliateUnknown = affiliateError || affiliateLoading;
  // Applied is what the DATABASE says (plak 42), or this press -- the
  // local flag alone was forgotten on reload and offered "Join" again.
  const applicationOpen = affiliateApplied || affiliateApplication === "applied";
  const applicationRefused = !applicationOpen && affiliateApplication === "refused";
  const applyAffiliate = async () => {
    setApplying(true);
    try {
      const { applyForAffiliateProgram } = await import(
        "@/actions/affiliate-application-actions"
      );
      const res = await applyForAffiliateProgram();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setAffiliateApplied(true);
      queryClient.invalidateQueries({ queryKey: ["is-affiliate"] });
      toast.success(
        res.data.alreadySent
          ? "You've already applied — we're still looking at it."
          : "Application sent. We'll set your rate and come back to you.",
      );
    } catch {
      toast.error("We couldn't send your application just now. Try again shortly.");
    } finally {
      setApplying(false);
    }
  };

  const {
    data: wallet,
    isError: walletError,
    isPending: walletLoading,
  } = useQuery<Wallet | null>({
    queryKey: ["wallet", advertiserId],
    enabled: !!advertiserId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .eq("advertiser_id", advertiserId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Wallet | null;
    },
  });

  const { mutate: createWallet } = useMutation<Wallet, Error, void>({
    mutationKey: ["create-wallet", advertiserId],
    mutationFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("wallet_create_for_advertiser");
      if (error) throw error;
      return data as Wallet;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["wallet", advertiserId], data);
      queryClient.invalidateQueries({ queryKey: ["wallet", advertiserId] });
    },
  });
  // Escape closes the navigation drawer, like every other overlay in the
  // shell. It was the one that ignored it, and it covers most of the screen.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  useEffect(() => {
    if (advertiserId && tenantId && wallet === null) createWallet();
  }, [advertiserId, tenantId, wallet, createWallet]);

  // isError matters here as much as the data. Without it a failed read is
  // indistinguishable from an empty one, and the screen tells a customer
  // with ten live ad accounts that they have none and should request their
  // first — which is both alarming and wrong.
  const { data: accounts, isLoading: accountsLoading, isError: accountsError } =
    useQuery<AdAccount[]>({
    queryKey: ["adv-accounts", advertiserId],
    enabled: !!advertiserId,
    queryFn: async () => {
      const supabase = createClient();
      // NOT "*". This is the customer's own browser, and the row carries
      // `notes` — where an operator writes, in account-details-sheet's
      // own words, "things like a supplier account number and the rate we
      // pay for it" — plus `metadata`, which has carried supplier
      // provenance. Neither is rendered anywhere on this side; both were
      // in the JSON. gdpr-actions.ts already excludes ad_accounts.notes
      // from the customer's own data export by name.
      const { data, error } = await supabase
        .from("ad_accounts")
        .select(AD_ACCOUNT_CUSTOMER_COLUMNS)
        .eq("advertiser_id", advertiserId);
      if (error) {
        // A named column the live schema does not have yet throws rather
        // than degrading, and "column ad_accounts.x does not exist" would
        // land on the customer's dashboard. Retry with the core list —
        // never with "*", which would trade a thinner screen for the leak
        // this change exists to close.
        const retry = await supabase
          .from("ad_accounts")
          .select(AD_ACCOUNT_CORE_COLUMNS)
          .eq("advertiser_id", advertiserId);
        if (retry.error) throw retry.error;
        return (retry.data ?? []) as unknown as AdAccount[];
      }
      return (data ?? []) as unknown as AdAccount[];
    },
  });

  const {
    data: subscription,
    isError: subError,
    isSuccess: subLoaded,
  } = useQuery<{
    amount: number | null;
    currency: string | null;
    status: string | null;
    next_payment_date: string | null;
  } | null>({
    queryKey: ["adv-subscription", advertiserId, tenantId],
    enabled: !!advertiserId && !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("subscriptions")
        // status IN the billable set, newest first — the same rows the
        // billing run and the top-up RPC read. With no filter the newest
        // row won whatever its status, so an inactive draft created beside
        // a live plan made the screen say "not active" while the server
        // still saw a running subscription: the top-up dialog then dropped
        // its minimum to 0, took a EUR 50 transfer, and the RPC refused it
        // with "Minimum top-up is 300 EUR" after the money had been sent.
        .select("amount, currency, status, next_payment_date")
        .eq("advertiser_id", advertiserId)
        .eq("tenant_id", tenantId)
        // The BILLABLE set, not every row. Without this the newest row won
        // whatever its status, so an inactive draft sitting beside a live
        // plan made this screen read "not active" while the server still
        // saw a running subscription.
        .in("status", ["active", "past_due"])
        .order("start_date", { ascending: false })
        .limit(1);
      if (error) throw error;
      // Nothing billable is a real answer — it means no plan is running,
      // which is what every server rule means by the same words.
      return data?.[0] ?? null;
    },
  });

  // WHICH PLAN. The billing screens said "Monthly plan" and the customer's
  // plan has a name — Prime, Starter, whatever they were sold. On the box
  // that takes money out of their wallet, naming it is the difference
  // between "some monthly charge" and "the thing I signed up for".
  // WHAT THE PLAN GIVES EVERY MONTH, from the plan's own row.
  //
  // Not the included accounts and not a fee percentage. The accounts are a
  // ONE-TIME allocation at signup — printing them on a renewal promises
  // two more this month — and the top-up fee is per AD ACCOUNT, where the
  // account's own rate overrides the plan's, so a flat figure here can be
  // untrue for the very account they are about to fund.
  const { data: plan } = useQuery<{
    name: string | null;
    features: string[];
  } | null>({
    queryKey: ["adv-plan", advertiserId],
    enabled: !!advertiserId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const supabase = createClient();
      // ASK FOR THE NEW COLUMN, SURVIVE WITHOUT IT.
      //
      // Code reaches production in minutes; a migration is pasted by hand
      // and lands whenever somebody gets to it. So the two are never in
      // step, and a select naming a column that does not exist yet does
      // not degrade — it throws, and this screen showed a customer
      // "column plans_1.features does not exist" across their own
      // dashboard.
      //
      // One retry without the column. The plan still has a name, which is
      // the part that matters; the perks fall back to the generic line.
      let data: unknown = null;
      let error: { message?: string } | null = null;
      {
        const full = await supabase
          .from("advertiser_plans")
          .select("plan:plans(name, features)")
          .eq("advertiser_id", advertiserId)
          .maybeSingle();
        if (full.error) {
          const lean = await supabase
            .from("advertiser_plans")
            .select("plan:plans(name)")
            .eq("advertiser_id", advertiserId)
            .maybeSingle();
          data = lean.data;
          error = lean.error;
        } else {
          data = full.data;
          error = full.error;
        }
      }
      if (error) throw error;
      if (!data) return null;
      const row = data as {
        plan?:
          | { name?: string; features?: string[] | null }
          | Array<{ name?: string; features?: string[] | null }>
          | null;
      };
      const embedded = Array.isArray(row.plan) ? row.plan[0] : row.plan;
      return {
        name: (embedded?.name ?? "").trim() || null,
        features: (embedded?.features ?? []).filter(
          (f): f is string => typeof f === "string" && f.trim().length > 0,
        ),
      };
    },
  });
  const planName = plan?.name ?? null;

  // Same reason as the accounts query above: without isError a failed read
  // renders as "No wallet activity yet" to someone whose money moved this
  // morning. It also feeds pendingTopups, so a failure silently makes a
  // pending transfer disappear from the dashboard.
  const {
    data: activity,
    isError: activityError,
    isLoading: activityLoading,
  } = useQuery<
    {
      id: string;
      created_at: string;
      currency: string | null;
      amount: number | string | null;
      status: string | null;
      reference_no: string | null;
      description: string | null;
    }[]
  >({
    queryKey: ["adv-wallet-activity", wallet?.id],
    enabled: !!wallet?.id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_topups")
        // NOT a bare .select(). postgrest-js defaults the columns
        // argument to "*", so this shipped the whole row while the type
        // annotation above lists seven fields — including notes and
        // rejection_reason, which are the admin's private remarks about
        // this payment, delivered to the person they are about. A grep
        // for select("*") does not match select().
        .select(
          "id, created_at, currency, amount, status, reference_no, description",
        )
        .eq("wallet_id", wallet!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      // ── AND `description` MAY NOT BE THERE ────────────────────────
      //
      // Narrowing the columns closed a leak and opened this: the list
      // names `description`, which is in no migration and not in
      // supabase/migrations/README's column list for this table. A bare
      // .select() expands to "*" and tolerates any column set; an
      // explicit list does not. If that column is absent on live,
      // PostgREST throws 42703 and EVERY advertiser's wallet activity is
      // dead — the history, and with it the only place a pending bank
      // transfer is shown.
      //
      // The rule in CLAUDE.md is: ask for it, and on error ask again
      // without it. The feature stays dark until the migration lands
      // instead of the screen breaking. `description` is decorative here
      // — the row falls back to "Wallet top-up" when it is empty.
      if (error) {
        const { data: retry, error: retryErr } = await supabase
          .from("wallet_topups")
          .select("id, created_at, currency, amount, status, reference_no")
          .eq("wallet_id", wallet!.id)
          .order("created_at", { ascending: false })
          .limit(30);
        if (retryErr) throw retryErr;
        return (retry ?? []).map((r) => ({ ...r, description: null }));
      }
      return data ?? [];
    },
  });

  // Exchanges belong in the wallet's history. A customer can move EUR into
  // USD from the dashboard, and until now the record of having done it was
  // shown NOWHERE — the only component that rendered wallet_exchanges was on
  // no route. Money left one balance and arrived in another with nothing to
  // point at afterwards.
  // ── THE BIGGEST DEBIT THERE IS, AND IT HAD NO LINE ─────────────────
  //
  // Wallet activity was built from wallet_topups, wallet_exchanges and
  // paid invoices. Funding an ad account is none of those -- it is a
  // row in top_ups -- so a customer who deposited EUR 10,000 and put
  // EUR 5,000 onto an account saw ONE line, "+EUR 10,000 Credited",
  // above a balance of 5,000. The statement did not net to the balance
  // and the largest thing they do with the product was missing from it.
  // The empty state even promised "anything paid from your wallet shows
  // up here".
  //
  // Money coming BACK off an account is the same gap pointing the other
  // way, so both are here.
  //
  // Amounts: amount_usd is what LEFT the wallet in dollars, and
  // topup_amount is what landed after the fee. The wallet is debited
  // the full amount, so that is the figure on a wallet statement.
  const { data: accountFundings, isError: fundingsError } = useQuery<
    {
      id: string;
      created_at: string;
      number: number | null;
      currency: string | null;
      amount_received: number | string | null;
      amount_usd: number | string | null;
      topup_amount: number | string | null;
      fee_amount: number | string | null;
      account_name: string | null;
      status: string | null;
    }[]
  >({
    queryKey: ["adv-account-fundings", advertiserId],
    enabled: !!advertiserId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("top_ups_view")
        .select(
          "id, created_at, number, currency, amount_received, amount_usd, topup_amount, fee_amount, account_name, status",
        )
        .eq("advertiser_id", advertiserId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as never;
    },
  });

  // ── WHAT THIS ACCOUNT HAS EVER HELD ───────────────────────────────
  //
  // An ad account can be emptied, switched off and handed back to the
  // pool for somebody else. The row STAYS with the customer it belonged
  // to, with all of its top-ups — which is right, and the owner asked
  // for it out loud: you should be able to look at a customer and see
  // that this was a big account, not a dead card with a fee on it.
  //
  // Lifetime, not current: a released account holds nothing now, and
  // "nothing" is the least interesting true thing about it. USD,
  // because topup_amount is USD by construction for every payment
  // currency.
  const { data: accountTotals, isError: accountTotalsError } = useQuery<
    Record<string, { amount: number; currency: string }>
  >({
    queryKey: ["adv-account-totals", advertiserId],
    enabled: !!advertiserId,
    queryFn: async () => {
      const supabase = createClient();
      // ── .limit(1000) IS THE CEILING, NOT A RAISE OF IT ──────────────
      //
      // PostgREST caps a response at 1,000 rows; asking for 1,000 asks
      // for exactly the cap. Past that, "Funded to date" -- the
      // customer's own lifetime figure on their own dashboard -- was
      // silently short, with nothing saying so. Paged, like every other
      // total in the app.
      //
      // And .not("is_deleted") like every other spend reader: a struck-
      // out top-up is excluded from fundedUsd and from the financial
      // report, and was counted here.
      const paged = await pageAllRows<{
        account_id: string | null;
        topup_amount: number | string | null;
        topup_usd?: number | string | null;
        currency?: string | null;
      }>((from, to) =>
        supabase
          .from("top_ups_view")
          .select("account_id, topup_amount, topup_usd, currency, status")
          .eq("advertiser_id", advertiserId!)
          .eq("status", "completed")
          .not("is_deleted", "is", true)
          .order("id", { ascending: true })
          .range(from, to),
      );
      if (paged.error) throw new Error(paged.error);
      const data = paged.rows;
      // ── IN THE ACCOUNT'S OWN MONEY ─────────────────────────────
      //
      // This summed topup_amount and the card printed it with usd(), so
      // a EUR account that had just been funded with EUR 97 read
      // "Funded to date $97.00" — the right number wearing the wrong
      // currency, on the customer's own card. topup_amount is the net
      // in the PAYMENT currency on any row the customer filed, and the
      // payment currency is the account's; only the admin create paths
      // store dollars, and they are told apart by topup_usd. See
      // lib/pure-topup-landed.
      const byAccount: Record<
        string,
        { amount: number; currency: string }
      > = {};
      for (const row of (data ?? []) as unknown as {
        account_id: string | null;
        topup_amount: number | string | null;
        topup_usd?: number | string | null;
        currency?: string | null;
      }[]) {
        const key = String(row.account_id ?? "");
        if (!key) continue;
        const { amount, currency } = landedOnAccount(row);
        if (amount === null) continue;
        const soFar = byAccount[key];
        byAccount[key] = {
          amount: Math.round(((soFar?.amount ?? 0) + amount) * 100) / 100,
          currency: soFar?.currency ?? currency,
        };
      }
      return byAccount;
    },
  });

  const { data: accountReturns, isError: returnsError } = useQuery<
    {
      id: string;
      created_at: string;
      amount: number | string | null;
      currency: string | null;
      status: string | null;
    }[]
  >({
    queryKey: ["adv-account-returns", advertiserId],
    enabled: !!advertiserId,
    queryFn: async () => {
      const supabase = createClient();
      // ── PENDING TOO, JUST NOT AS A CREDIT ────────────────────────
      //
      // "Approved only" was right about the balance and wrong about the
      // customer: a request they had just filed disappeared completely.
      // Nowhere on their own screens said it existed -- not this table,
      // not the account sheet, which shows funding history only -- so
      // the natural next move is to file it again, and the RPC has no
      // duplicate guard. The withdraw dialog even invalidates this
      // query to make the new row show up, against a filter that
      // excluded it.
      //
      // Pending rows come back and are rendered as "Requested", with no
      // amount in the credited column, so the balance still reads true.
      const { data, error } = await supabase
        .from("ad_account_withdrawals")
        .select("id, created_at, amount, currency, status")
        .eq("advertiser_id", advertiserId!)
        .in("status", ["approved", "pending"])
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as never;
    },
  });

  const { data: exchanges, isError: exchangesError } = useQuery<
    {
      id: string;
      created_at: string;
      from_currency: string;
      to_currency: string;
      from_amount: number | string | null;
      to_amount: number | string | null;
      exchange_rate: number | string | null;
      fee_amount: number | string | null;
    }[]
  >({
    queryKey: ["adv-wallet-exchanges", wallet?.id],
    enabled: !!wallet?.id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_exchanges")
        .select(
          // fee_amount was NOT here, so the row showed EUR 50.00 going
          // out and USD 56.98 arriving with the 0.34 that explains the
          // gap mentioned nowhere. The ADMIN table has always selected
          // and shown it; the customer got the version of their own
          // record that does not add up.
          "id, created_at, from_currency, to_currency, from_amount, to_amount, exchange_rate, fee_amount",
        )
        .eq("wallet_id", wallet!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invoices, isError: invError, isLoading: invLoading } = useQuery<
    (InvoiceWithRelations & { due_date?: string | null })[]
  >({
    queryKey: ["adv-invoices", advertiserId, tenantId],
    enabled: !!advertiserId && !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("invoices")
        // currency, because that is the column invoice_pay_from_wallet
        // charges from — `upper(coalesce(v_inv.currency,'EUR'))`. The
        // confirmation modal was naming the wallet from items[0].currency
        // instead, so an invoice whose items array is empty or omits the
        // key said "€120 from your EUR wallet" while the RPC took $120 off
        // the USD one. There is no undo.
        .select(
          "id, number, total, status, paid_at, created_at, due_date, items, type, currency",
        )
        .eq("tenant_id", tenantId)
        .eq("advertiser_id", advertiserId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as unknown as (InvoiceWithRelations & {
        due_date?: string | null;
      })[];
    },
  });

  // Advertiser-as-affiliate: their referral book (empty for a plain
  // advertiser). Shown under the "Affiliate program" view.
  const aff = useAffiliateStats({ enabled: !!advertiserId });
  // Error OR not yet answered. aff-app.tsx calls the same thing
  // statsUnavailable; this file was testing only isError, so every
  // figure on the Affiliate-program tab printed 0 for the seconds
  // before the answer arrived -- and for ever on a profile with no
  // advertiser row, where the query is disabled and react-query v5
  // reports isPending true and isSuccess false permanently.
  const affUnavailable = aff.isError || aff.isLoading;
  // This month, for the cabinet's pill and tile. A second read, like the
  // affiliate portal's -- and guarded on its own, never borrowing the
  // all-time read's state.
  const affMonth = useAffiliateStats({
    from: dayjs().startOf("month").format("YYYY-MM-DD"),
    enabled: !!advertiserId && isAffiliate,
  });
  const affMonthUnavailable = affMonth.isError || affMonth.isLoading;
  // The period picked on the Referrals tab. All time is the same read as
  // `aff` above (same key), so it costs nothing extra.
  const affPeriod = rangeDates(affRange);
  const affRanged = useAffiliateStats({
    from: affPeriod.from,
    to: affPeriod.to,
    enabled: !!advertiserId && isAffiliate,
  });
  const affRangedUnavailable = affRanged.isError || affRanged.isLoading;
  // Waiting = signed up through the link, not approved yet (plak 42).
  // Active = approved and has funded at least once.
  const affWaiting = aff.rows.filter(
    (r) => String(r.link_status ?? "active") === "pending",
  ).length;
  const affActive = aff.rows.filter(
    (r) =>
      String(r.link_status ?? "active") !== "pending" &&
      Number(r.topup_count) > 0,
  ).length;
  const {
    notifications: rawNotifs,
    markAsRead,
    markAllAsRead,
    // "You're all caught up" over a read that FAILED is the worst kind of
    // reassurance: these carry "your top-up was rejected" and request
    // approvals. The hook exports isError for exactly this, and neither
    // app was asking for it.
    isError: notifsError,
    // ── COUNTED SERVER-SIDE, NOT OFF A CAPPED LIST ──────────────────
    //
    // The badge was notifs.filter(!is_read).length over a list capped
    // at 50 rows. The hook computes this count with a head:true query
    // SPECIFICALLY so it stays honest past that cap -- and exports
    // countError so a failed count can show as a dot rather than
    // disappearing, which is the difference between "nothing new" and
    // "we could not ask".
    unreadCount,
    countError: notifsCountError,
  } = useNotifications();
  // ── A SECOND LINE OF DEFENCE, WHERE IT IS DRAWN ───────────────────
  //
  // getNotificationCopy prints payload.summary verbatim for
  // supplier_pool_changed, and its own comment gives the format as
  // "... · seamx-9001: active → suspended" -- the supplier's name and
  // their account ids. It is rendered by both customer shells, and the
  // push route switches on `type` alone. Until now the ONLY thing
  // keeping that off a customer's screen was the two insert sites
  // picking their recipients correctly; one mis-addressed row put it
  // here and, because the GDPR export copies notifications.payload out
  // whole, into their download as well.
  const notifs = (rawNotifs ?? []).filter((n) =>
    isCustomerVisibleType((n as { type?: string | null })?.type),
  );


  const {
    data: company,
    isLoading: companyLoading,
    isError: companyError,
  } = useQuery<
    Record<string, unknown> | null
  >({
    queryKey: ["adv-company", advertiserId],
    enabled: !!advertiserId,
    queryFn: async () => {
      const supabase = createClient();
      // registration_no and website_url are in COMPANY_ALLOWED and are
      // posted back by saveCompany, so leaving them OUT of this select
      // meant they came back as "" and every save wiped them. The
      // registration number is printed on the invoice PDF and it is the
      // field /complete-profile's own gate tests — so wiping it makes
      // that page reappear for ever.
      const COLS =
        "name, vat_no, country, is_not_vat, official_email, phone, address, state, zipcode, registration_no, website_url, billings(address, state, country, zipcode)";
      // ── ASK FOR updated_at, AND HOLD IF IT IS NOT THERE YET ────────
      //
      // `companies.updated_at` is added by 20260901460000, and migrations
      // on this project are pasted by hand whenever somebody gets to it.
      // A select naming a column that does not exist does not degrade —
      // it throws 42703 and PostgREST's message lands on the screen that
      // asked for it. So the concurrency guard stays dark until the
      // migration lands, instead of taking the company card with it.
      const withVersion = await supabase
        .from("companies")
        .select(`updated_at, ${COLS}`)
        .eq("advertiser_id", advertiserId)
        .maybeSingle();
      if (!withVersion.error) {
        return (withVersion.data ?? null) as Record<string, unknown> | null;
      }
      const { data, error } = await supabase
        .from("companies")
        .select(COLS)
        .eq("advertiser_id", advertiserId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Record<string, unknown> | null;
    },
  });
  // The WHOLE company, not three fields of it. This card showed name, VAT
  // and country while the record carries ten — and those ten are what an
  // invoice is built from and what the app checks before it lets anything be
  // billed (app/(app)/layout.tsx tests name, official_email, phone, address,
  // country, state, zipcode). So a customer could look at their own company
  // details, see three lines, and have no way to correct the address their
  // invoices were going to.
  const [comp, setComp] = useState({
    name: "",
    official_email: "",
    phone: "",
    website_url: "",
    vat_no: "",
    registration_no: "",
    address: "",
    zipcode: "",
    state: "",
    country: "",
  });
  const [savingComp, setSavingComp] = useState(false);

  // ── THE PROFILE THE AVATAR MENU PROMISES ──────────────────────────
  //
  // Walked on production: the menu behind the avatar has an item called
  // "Profile", and it lands on this Settings screen, which holds the
  // COMPANY. There was no personal profile anywhere in the customer
  // shell — so somebody who signed up with a typo in their own name
  // could never correct it, and the only route to a new password was
  // "forgot password" on the sign-in screen, for a password they have
  // not forgotten. updateOwnProfileAndCompany has taken a `profile`
  // half since it was written; nothing on this screen ever sent it.
  const [me, setMe] = useState({ full_name: "" });
  const [savingMe, setSavingMe] = useState(false);
  useEffect(() => {
    setMe({ full_name: profile?.full_name ?? "" });
  }, [profile?.full_name]);
  const saveMe = async () => {
    setSavingMe(true);
    try {
      const res = await updateOwnProfileAndCompany({
        profile: { full_name: me.full_name.trim() },
      });
      if (!res.ok) throw new Error(res.error);
      toast.success("Name saved");
      // The header, the welcome line and the avatar initials all read
      // the profile from the shell's own context, so a save that does
      // not refresh leaves the old name on screen next to the new one
      // in the box.
      meRouter.refresh();
    } catch (e) {
      toast.error("Could not save your name", {
        description: userFacingErrorMessage(
          e,
          "Nothing was changed. Try again, or tell us if it keeps happening.",
        ),
      });
    } finally {
      setSavingMe(false);
    }
  };

  useEffect(() => {
    if (company)
      setComp({
        name: (company.name as string) ?? "",
        official_email: (company.official_email as string) ?? "",
        phone: (company.phone as string) ?? "",
        website_url: (company.website_url as string) ?? "",
        vat_no: (company.vat_no as string) ?? "",
        registration_no: (company.registration_no as string) ?? "",
        address: (company.address as string) ?? "",
        zipcode: (company.zipcode as string) ?? "",
        state: (company.state as string) ?? "",
        country: (company.country as string) ?? "",
      });
  }, [company]);
  const saveCompany = async () => {
    setSavingComp(true);
    try {
      // The version this form was built from. Without it an admin's
      // correction on the same row is silently reverted by this Save.
      const res = await updateOwnProfileAndCompany({
        company: comp,
        ifUpdatedAt: (company?.updated_at as string | undefined) ?? null,
      });
      if (!res.ok) throw new Error(res.error);
      await queryClient.invalidateQueries({
        queryKey: ["adv-company"],
        exact: false,
      });
      // ── "SAVED" IS NOT THE SAME AS "DONE" ─────────────────────────
      //
      // This form writes `companies` and never `billings` -- only
      // /complete-profile writes both -- and isCompanyComplete needs
      // four fields that live on billings. So a customer could fill in
      // everything on this card, be told "Company saved", and watch
      // nothing unlock: Top up and Exchange still greyed, Request one
      // still disabled, the red chip still there. They had done what
      // they were told and been told they had done it.
      //
      // The invalidate is awaited so the check below reads what was
      // actually written rather than the cache it replaced.
      const after = queryClient.getQueryData<Record<string, unknown> | null>([
        "adv-company",
        advertiserId,
      ]);
      const stillMissing = missingCompanyFields(after ?? comp);
      if (stillMissing.length > 0) {
        toast.warning("Saved — but not complete yet", {
          description:
            "Still needed: " +
            stillMissing.join(", ") +
            ". The billing address is on the full form.",
          duration: 12_000,
          action: {
            label: "Finish it",
            onClick: () => {
              window.location.href = "/complete-profile";
            },
          },
        });
      } else {
        toast.success("Company saved");
      }
    } catch (e) {
      toast.error("Couldn't save company", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSavingComp(false);
    }
  };
  const referralCode = profile?.advertiser?.[0]?.tenant_client_code;
  // Being an affiliate is something an admin APPROVES — there is an
  // `active` referral_links row or there is not. This link used to be derived
  // from the client code alone, so every advertiser had a working referral
  // link the day they signed up and nobody had agreed to it. It is not
  // cosmetic either: app/auth/confirm attributes a signup by looking that
  // code up, so an unapproved link still produced a tracked referral and,
  // downstream, a commission.
  const referralLink =
    isAffiliate && profile?.tenant?.slug && referralCode
      ? (() => {
          const u = new URL(`${getURL().replace(/\/$/, "")}/auth/sign-up`);
          u.searchParams.set("t", profile.tenant.slug as string);
          u.searchParams.set("ref", referralCode);
          return u.toString();
        })()
      : "";
  const copyReferral = async () => {
    if (!referralLink) return;
    try {
      if (!(await copyText(referralLink))) throw new Error("copy refused");
      toast.success("Referral link copied.");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  const eurBal = Number(wallet?.eur_balance ?? 0);
  const usdBal = Number(wallet?.usd_balance ?? 0);
  // ── THE RATE, ON THIS SCREEN ──────────────────────────────────────
  //
  // It used to live only inside the exchange dialog, so the billing card
  // could not answer "would the other wallet actually cover this?" and
  // asked `other > 0` instead — offering an exchange to somebody holding
  // a cent, and removing the top-up route while it did.
  //
  // use-usd-to-eur, NOT the settings hook the dialog uses. That one is
  // `select("*, profile:user_profiles(*)")` — an admin query, joining
  // other people's profiles, fired from a customer's dashboard. This one
  // asks for the single `eur` column and returns NULL rather than 1 when
  // it cannot be read, which is what keeps an unread rate from behaving
  // like parity.
  const { rate: advEurRate } = useUsdToEur();
  const eurRateRaw = Number(advEurRate ?? 0);
  // When the wallet read fails, `wallet` is undefined and both balances fall
  // to 0 — which renders as a confident "€0.00". Show "—" instead: an unknown
  // balance and an empty one are very different things to tell a customer.
  // THREE STATES, NOT TWO. While the read is in flight eurBal is 0, so
  // every wallet figure on this app printed a confident €0.00 and then
  // corrected itself a moment later — the customer's own balance, wrong,
  // on first paint and on every return to the tab. A dash says "not yet"
  // and does not have to take anything back.
  // Everything the dashboard's first screenful derives from. isPending /
  // isLoading is true only while there is no data at all, so this is a
  // FIRST-LOAD gate and not a refetch gate: a background refresh never
  // takes the page away again.
  //
  // AND IT HAS TO BE ABLE TO END. walletLoading is `isPending`, which
  // stays TRUE for ever on a query that is disabled — and all three are
  // `enabled: !!advertiserId`. Somebody without an advertiser row would
  // otherwise sit on a skeleton that never resolves, which is worse than
  // any flash. So: no advertiser, nothing to wait for.
  const booting =
    !!advertiserId && (walletLoading || accountsLoading || companyLoading);

  // ── NO WALLET ROW IS NOT A BALANCE OF ZERO ────────────────────────
  //
  // `wallet === null` resolves SUCCESSFULLY through .maybeSingle(), so
  // walletError is false and walletLoading is false and these fell
  // through to eur(0). The card then printed "EUR 0.00" and "Available
  // to spend" beside its own line reading "No wallet on this account
  // yet" -- three statements, on one card, that cannot all be true.
  const eurText = walletError
    ? "—"
    : walletLoading
      ? "…"
      : !wallet
        ? "—"
        : eur(eurBal);
  // The hero sits above both wallets and belongs to neither, so its Top
  // up and Exchange need a currency of their own. Whichever one they
  // actually hold; EUR when they hold both or nothing, because that is
  // what every RPC on the server falls back to.
  const heroCurrency: "EUR" | "USD" =
    eurBal <= 0 && usdBal > 0 ? "USD" : "EUR";
  const usdText = walletError
    ? "—"
    : walletLoading
      ? "…"
      : !wallet
        ? "—"
        : usd(usdBal);
  const activeAccts = (accounts ?? []).filter((a) => a.status === "active");
  // Company details are what an invoice is built from, so nothing that costs
  // money or creates work can start without them. Browsing can: the app no
  // longer redirects a new customer straight into the form (see
  // app/(app)/layout.tsx) — it lets them look around and asks here, at the
  // point where the details are actually needed, which is also the only
  // place it can explain why.
  // The SAME test /complete-profile applies, deliberately. Two definitions
  // of "complete" would let someone pass this gate and still be sent back to
  // the form — or worse, top up while no invoice can be raised for them,
  // which is the entire reason the gate exists.
  //
  // is_not_vat counts: a VAT-exempt business ticks "My company isn't VAT
  // registered" and has no number to give. Requiring one locked them out of
  // topping up and requesting an account permanently, with no way to satisfy
  // the condition.
  // ONE predicate, shared with the onboarding checklist. The two used to
  // be written out separately and differed by exactly the four billing
  // fields, so the checklist ticked the step green while this gate — the
  // one that actually greys out Top up, Exchange and Request an account —
  // stayed shut. See lib/pure-company-complete.ts.
  const companyComplete = isCompanyComplete(company);
  const companyMissing = missingCompanyFields(company);
  // ONE history, in time order. A top-up and an exchange are both "something
  // that happened to my wallet", and two separate tables would make a
  // customer check the date on each to work out what happened first.
  // ── AND WHAT LEFT IT ────────────────────────────────────────────────
  //
  // This listed top-ups and exchanges, which is everything that puts
  // money IN and nothing that takes it out. So a customer transfers EUR
  // 5, sees "Credited EUR 5.00", and then a balance of EUR 0.00 with no
  // line anywhere saying the monthly plan took it. The only honest
  // reading of that screen is that the money vanished.
  //
  // A paid invoice IS a wallet movement — invoice_pay_from_wallet debits
  // the balance — so it belongs in the same list, in time order, as a
  // negative. The invoices are already loaded for the billing screen.
  // ── THE REQUEST FEE, WHICH LEFT NO TRACE ─────────────────────────
  //
  // ad_account_request_create_paid debits the wallet directly and
  // writes no invoice, no wallet_topups row, no top_ups row and no
  // precharge. The statement below is built from five sources and the
  // fee is none of them, so a customer with EUR 500 who requests an
  // account sees EUR 450 and no line explaining it anywhere -- and
  // their exported CSV, the one a bookkeeper reads, is EUR 50 out. The
  // refund does the same in reverse: a rejected request silently ADDS
  // 50 from nowhere.
  //
  // charged_amount / charged_at are added by migration 20260920250000
  // and must be written by those two live functions. Until they are,
  // this read comes back refused, the retry drops the columns, and the
  // line simply does not appear -- the screen does not break.
  const { data: requestCharges, isError: requestChargesError } = useQuery<
    {
      id: string;
      charged_amount: number | null;
      charged_currency: string | null;
      charged_at: string | null;
      refunded_amount: number | null;
      refunded_at: string | null;
      platform: string | null;
    }[]
  >({
    queryKey: ["adv-request-charges", advertiserId],
    enabled: !!advertiserId,
    retry: false,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("ad_account_requests")
        .select(
          "id, platform, charged_amount, charged_currency, charged_at, refunded_amount, refunded_at",
        )
        .eq("advertiser_id", advertiserId!)
        .not("charged_at", "is", null)
        .order("charged_at", { ascending: false })
        .limit(50);
      // ── ASK, THEN ASK WITHOUT ─────────────────────────────────
      //
      // `if (error) return []` swallowed everything, so this source
      // could vanish from the statement with no banner -- and the
      // statement's failure banner lists five flags and could not
      // include a sixth that never existed. A missing column is the
      // one error that should be silent here; the rest belong on
      // screen. 42703 is "column does not exist".
      if (!error) return (data ?? []) as never;
      if ((error as { code?: string } | null)?.code === "42703") {
        return [] as never;
      }
      throw error;
    },
  });

  type WalletEvent =
    | { kind: "topup"; id: string; at: string; row: NonNullable<typeof activity>[number] }
    | { kind: "exchange"; id: string; at: string; row: NonNullable<typeof exchanges>[number] }
    | { kind: "invoice"; id: string; at: string; row: NonNullable<typeof invoices>[number] }
    | {
        kind: "funding";
        id: string;
        at: string;
        row: NonNullable<typeof accountFundings>[number];
      }
    | {
        kind: "return";
        id: string;
        at: string;
        row: NonNullable<typeof accountReturns>[number];
      }
    | {
        kind: "reqfee";
        id: string;
        at: string;
        row: NonNullable<typeof requestCharges>[number];
        refund?: boolean;
      };
  // ── THIS LIST IS FIVE CAPPED READS STITCHED TOGETHER ──────────────
  //
  // Each source is fetched with .limit(30) independently, then merged
  // and sorted. So a customer with 100 fundings and 5 top-ups sees
  // fundings going back only 30 while top-ups go back to the
  // beginning -- and the result looks like one continuous history with
  // nothing missing. The invoices table below this one does say "your
  // 30 most recent"; this one said nothing at all.
  //
  // Saying it is the fix that is honest at any cap. A source that came
  // back exactly full is a source that has more.
  const activityTruncated =
    (activity?.length ?? 0) >= 30 ||
    (exchanges?.length ?? 0) >= 30 ||
    (invoices?.length ?? 0) >= 30 ||
    (accountFundings?.length ?? 0) >= 30 ||
    (accountReturns?.length ?? 0) >= 30;

  const walletEvents: WalletEvent[] = [
    // The charge, and the refund as its own line where there was one:
    // a customer whose request was rejected sees the money go and come
    // back, which is what happened.
    ...(requestCharges ?? []).flatMap((r) => {
      const out: WalletEvent[] = [];
      if (r.charged_at && Number(r.charged_amount) > 0) {
        out.push({ kind: "reqfee", id: `c-${r.id}`, at: r.charged_at, row: r });
      }
      if (r.refunded_at && Number(r.refunded_amount) > 0) {
        out.push({
          kind: "reqfee",
          id: `r-${r.id}`,
          at: r.refunded_at,
          row: r,
          refund: true,
        });
      }
      return out;
    }),
    ...(activity ?? []).map(
      (t) => ({ kind: "topup", id: t.id, at: t.created_at, row: t }) as WalletEvent,
    ),
    ...(exchanges ?? []).map(
      (x) => ({ kind: "exchange", id: x.id, at: x.created_at, row: x }) as WalletEvent,
    ),
    // Paid only, and no RECEIPTS. An unpaid invoice has not touched the
    // balance, and a receipt invoice is raised FOR a movement that is
    // already on this list — showing it again books the same money
    // twice.
    //
    // `wallet_topup` was excluded for exactly that reason;
    // `ad_account_topup` was not, and a live database trigger raises one
    // every time an ad-account funding is verified. Seen on production:
    // funding an account with EUR 100 at 3% produced
    //   "Funded AA-PSM0005-EU-01   −€100.00"   (the movement)
    //   "Ad-account top-up          −€97.00"   (its receipt)
    // so a statement whose balance had gone down by EUR 100 read as
    // EUR 197 leaving. The balance was right; the page explaining it
    // was not, which is the worse half.
    ...(invoices ?? [])
      .filter(
        (i) =>
          String(i.status) === "paid" &&
          !["wallet_topup", "topup", "ad_account_topup", "account_topup"].includes(
            String(i.type ?? "").toLowerCase(),
          ),
      )
      .map(
        (i) =>
          ({
            kind: "invoice",
            id: i.id,
            at: String(i.paid_at ?? i.created_at ?? ""),
            row: i,
          }) as WalletEvent,
      ),
    // ── THE DEBIT IS IMMEDIATE, WHATEVER THE STATUS SAYS ────────────
    //
    // This filtered to `completed` under a comment claiming a pending
    // funding "has not moved a cent". It has: the RPC takes the money
    // out of the wallet at CREATION — use-create-account-topup says
    // "The debit IS immediate" and the form says it "cannot be undone
    // at all by the customer" — and the row then sits in the admin
    // verify queue as `pending`, for hours or days.
    //
    // So the exact complaint this statement was extended to answer came
    // straight back: balance drops by EUR 5,000, no line anywhere. A
    // REJECTED one is worse — the money left and does not come back —
    // and it was filtered out permanently.
    //
    // Everything that left is listed; the status is on the row so the
    // customer can see where it is.
    ...(accountFundings ?? [])
      .filter((t) => {
        const st = String(t.status ?? "").toLowerCase();
        return st !== "cancelled";
      })
      .map(
        (t) =>
          ({ kind: "funding", id: t.id, at: t.created_at, row: t }) as WalletEvent,
      ),
    ...(accountReturns ?? []).map(
      (w) =>
        ({ kind: "return", id: w.id, at: w.created_at, row: w }) as WalletEvent,
    ),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  // Has a transfer EVER landed? The onboarding tick used to read the
  // balance, and the first top-up leaves again the moment the plan is
  // charged — so the list untick­ed itself and told a paying customer to
  // fund a wallet they had funded. head:true, so it fetches a number and
  // no rows.
  const { data: toppedUpCount, isError: toppedUpError } = useQuery<number>({
    queryKey: ["adv-ever-topped-up", wallet?.id],
    enabled: !!wallet?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const supabase = createClient();
      const { count, error } = await supabase
        .from("wallet_topups")
        .select("id", { count: "exact", head: true })
        .eq("wallet_id", wallet!.id)
        .eq("status", "completed");
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Everything not yet credited, however far back it goes. Separate from
  // the statement above so a long history can never hide a live transfer.
  const {
    data: pendingRows,
    isError: pendingError,
    // Its OWN settled flag. pendingUnknown below consulted
    // activityLoading -- a DIFFERENT request -- so while this one was in
    // flight or retrying, pendingUnknown was false over an empty list
    // and the wallet card printed "Available to spend" beside a balance
    // of zero, with no pending panel, to a customer who had wired
    // EUR 10,000 that morning. They wire it again; there is no duplicate
    // guard on wallet_topup_advertiser_create. That is verbatim the
    // failure the paragraph below says this code exists to prevent,
    // arriving through the sibling query.
    isSuccess: pendingLoaded,
  } = useQuery<
    {
      id: string;
      created_at: string;
      currency: string | null;
      amount: number | null;
      status: string | null;
      reference_no: string | null;
    }[]
  >({
    queryKey: ["adv-pending-topups", wallet?.id],
    enabled: !!wallet?.id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_topups")
        .select("id, created_at, currency, amount, status, reference_no")
        .eq("wallet_id", wallet!.id)
        .not("status", "in", "(completed,failed,rejected)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // A FAILED ACTIVITY READ IS NOT "NOTHING IS PENDING". The comment on
  // the query above says this in its own words — "a failure silently
  // makes a pending transfer disappear from the dashboard" — and then
  // both derived values below read `activity ?? []` with no error check,
  // which is exactly that. A customer who wired EUR 10,000 this morning
  // is shown "Available to spend" and no pending panel, so they wire it
  // again.
  // isError AND isLoading. While the read is in flight `pendingTopups` is
  // [] too, so the wallet card said "Available to spend" over money that
  // was on its way — the same half-fix the accounts prop avoided by
  // taking both.
  // ...and a DISABLED query is a third unknown. This one is
  // `enabled: !!wallet?.id`, so while the wallet read is in flight
  // react-query v5 reports isPending true, isFetching false, therefore
  // isLoading FALSE and isError false. pendingUnknown was then false
  // over an empty list. The dash view is covered by the booting gate;
  // the wallet view is not, and ?view=wallet lands straight on it.
  // `!wallet?.id` stays -- with no wallet there is genuinely nothing to
  // report -- but !pendingLoaded must not outlive a query that can never
  // run, which is what `enabled: !!wallet?.id` makes it.
  const pendingUnknown =
    activityError ||
    activityLoading ||
    !wallet?.id ||
    pendingError ||
    (!!wallet?.id && !pendingLoaded);
  // Unknown BECAUSE IT IS STILL COMING, as opposed to unknown because a
  // read failed. Same value on screen, opposite sentence: one is "one
  // moment", the other is "something went wrong". Only the disabled
  // query and the in-flight one are the first kind.
  // ── AND "NO WALLET YET" IS NEITHER A FAILURE NOR A WAIT ───────────
  //
  // Dropping !wallet?.id from here while leaving it in pendingUnknown
  // swapped a permanent spinner for a permanent "We couldn't check for
  // pending transfers" -- on both cards, to the newest customers, who
  // are the ones most likely to have just wired money and be looking
  // for it. A false failure is not an improvement on a false wait.
  const pendingChecking =
    !activityError &&
    !pendingError &&
    (activityLoading || !wallet?.id || !pendingLoaded);
  // ── AND IT MUST NOT COME OUT OF A TRUNCATED LIST ────────────────────
  //
  // `activity` is fetched with .limit(30) because it renders a recent
  // statement. Pending transfers were being derived from that same list,
  // so past thirty wallet rows a transfer that is genuinely on its way
  // silently dropped off the dashboard — which is the exact failure the
  // paragraph above says it is guarding against, arrived by a different
  // road. The customer wires it again.
  //
  // Pending is its own read, unbounded on purpose: there are never many,
  // and a floor presented as a total is worse than a slow query.
  const pendingTopups = pendingRows ?? [];
  // What is on its way but not yet credited, per currency. The wallet cards
  // used to print the balance twice — "€0" and then "€0 available" — which
  // told a customer nothing the first line had not. Money sitting in a
  // transfer we have not verified yet is the thing they actually want to see
  // on that second line, because it explains a balance that looks too low.
  const pendingByCurrency = (pendingRows ?? []).reduce(
    (acc, t) => {
      const cur = String(t.currency ?? "").toUpperCase();
      if (cur === "EUR" || cur === "USD") {
        acc[cur] += Number(t.amount ?? 0) || 0;
      }
      return acc;
    },
    { EUR: 0, USD: 0 } as { EUR: number; USD: number },
  );

  // The subscription invoice the "Pay … from wallet" button should settle:
  // the OLDEST unpaid invoice of type 'subscription'. Picking the newest
  // unpaid invoice of ANY type could charge a smaller adjustment invoice
  // while the real subscription stays unpaid, under a label that showed the
  // subscription amount.
  // One reading of the plan's currency, used everywhere its amount appears.
  // Three separate sites each hard-coded a euro sign, which is how a USD plan
  // came to be labelled in euros directly above a button that charges
  // dollars. Subscriptions default to EUR — the billing RPCs coalesce to it —
  // so that is the fallback, but a USD plan says so.
  const planCur = (subscription?.currency ?? "EUR").toUpperCase();
  // A PRICE IS NOT A ROUNDED FIGURE.
  //
  // eur() and usd() are Math.round, which is right for a big balance on
  // a hero tile and wrong for a price somebody is about to pay: a EUR
  // 99.50 subscription read "EUR 100" here and on the plan card, while
  // /subscriptions, the invoice, planMoney2 on the very next line and
  // the actual wallet debit all said 99.50. The price was overstated by
  // fifty cents on the screen the customer decides from.
  //
  // Kept as a name rather than deleted, because the two call sites read
  // better with it — but it is the two-decimal one now.
  const planMoney = (v: number | string | null | undefined) =>
    (planCur === "USD" ? "$" : "€") + money2(v);
  /** The headline price. Whole amounts lose the ".00"; 99.50 keeps it. */
  const planMoneyNeat = (v: number | string | null | undefined) =>
    (planCur === "USD" ? "$" : "€") + moneyNeat(v);
  const planMoney2 = (v: number | string | null | undefined) =>
    (planCur === "USD" ? "$" : "€") + money2(v);

  // Every unpaid subscription invoice, NEWEST first.
  //
  // This used to take the OLDEST and call it "this month". After a plan
  // change that is the superseded one: lowering €200 to €5 issued a new €5
  // invoice and left the €200 unpaid, so the card asked for €200 on a €5
  // plan and the button next to it offered to pay it. Newest-first shows
  // the current period, and the count below says plainly when more than one
  // is open — being asked for two is a fact the customer needs, not
  // something to hide behind a single number.
  // ── FROM ITS OWN READ, NOT FROM THE FIRST THIRTY ROWS ───────────────
  //
  // `invoices` is .limit(30) across ALL types. A customer who asks for
  // six ad accounts in a month raises six ad_account_fee invoices, plus
  // top-up receipts and one-offs — so an unpaid subscription invoice
  // from five weeks ago falls off the end of that window. The billing
  // card then reads "Nothing owed right now", the plan pill reads
  // Active, and there is no Pay button; seven days after the due date
  // the cron takes it anyway.
  //
  // `planPaid` was given its own dedicated query for exactly this
  // hazard. dueSubInvoice was not.
  // Every unpaid subscription invoice, however old, and nothing else.
  // Small by construction: one customer holds at most a handful.
  const {
    data: dueInvoices,
    isError: dueInvError,
    isSuccess: dueInvLoaded,
  } = useQuery<
    (InvoiceWithRelations & { due_date?: string | null })[]
  >({
    queryKey: ["adv-due-sub-invoices", tenantId, advertiserId],
    enabled: !!tenantId && !!advertiserId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, number, total, status, paid_at, created_at, due_date, items, type, currency",
        )
        .eq("tenant_id", tenantId)
        .eq("advertiser_id", advertiserId)
        // ── ADJUSTMENTS ARE COLLECTED TOO ────────────────────────────
        //
        // This asked only for type='subscription'. The nightly collect
        // loop filters on subscription_id being present and does NOT
        // filter by type, so a `subscription_adjustment` -- the EUR 50
        // raised when a plan goes up mid-month -- is auto-debited on its
        // due date while this card reads "This month is paid" and
        // "Nothing owed right now". The row is in the invoice table
        // below, so the headline contradicted the list underneath it.
        .in("type", ["subscription", "subscription_adjustment"])
        .not("status", "in", "(paid,void)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as (InvoiceWithRelations & {
        due_date?: string | null;
      })[];
    },
  });

  // One answer to "which wallet pays this", from lib/pure-invoice-due,
  // where it is tested. It used to be a local const arrow function
  // declared twenty lines BELOW the reduce that calls it — a temporal
  // dead zone that threw "Cannot access 'invCurrency' before
  // initialization" and replaced the whole customer app with Next's
  // "Application error". It hid because .reduce on an EMPTY array never
  // calls its callback, so it only fired for a customer who actually had
  // an unpaid invoice.
  const invCurrency = walletCurrencyOf;


  // ── AND THE FILTER HAS TO AGREE WITH THE QUERY ───────────────────
  //
  // The query above was widened to include subscription_adjustment,
  // because the nightly collect loop filters on subscription_id and NOT
  // on type, so an adjustment is auto-debited. This line then narrowed
  // it straight back to type === "subscription", which made the whole
  // widening a no-op: dueSubInvoice could never be an adjustment, the
  // "Plan change" label was dead code, and the card still read "This
  // month is paid" over a EUR 50 adjustment due in seven days.
  // All three come from lib/pure-invoice-due now, where the non-empty
  // path is covered by tests: which invoices are open (oldest first,
  // adjustments included because the collect loop takes those too), the
  // total per currency, and the sentence for it.
  const unpaidSubInvoices = unpaidSubscriptionInvoices(dueInvoices ?? []);
  const dueSubInvoice = unpaidSubInvoices[0];
  const unpaidSubCount = unpaidSubInvoices.length;
  const unpaidSubByCurrency = unpaidTotalsByCurrency(unpaidSubInvoices);
  const unpaidSubText = unpaidTotalsText(unpaidSubByCurrency);
  const dueSubSymbol = invCurrency(dueSubInvoice) === "USD" ? "$" : "€";

  // Hand the customer their own invoice. Same route the admin list uses;
  // it constrains the query to the caller's own advertiser ids, so someone
  // else's id is a 404 rather than a document.
  // What the customer actually owes right now, and by when. Falls back to
  // the plan's own figures only when there is no unpaid invoice to read —
  // and says so rather than borrowing next_payment_date.
  const dueBillDate =
    dueSubInvoice?.due_date ?? (dueSubInvoice ? null : subscription?.next_payment_date ?? null);
  // BOTH LEGS, OR NEITHER.
  //
  // This panel printed the EUR half of four figures and put a euro sign
  // on it, while affiliate_referral_stats returns four buckets and the
  // hook totals all four. One referral on a 3% link whose advertiser
  // topped up $30,000 read "Commission EUR 0 - Spend driven EUR 0" on a
  // row that also said "Top-ups 1". The same person in the dedicated
  // affiliate app saw the real number, because that screen prints both.
  //
  // Never a currency symbol on a figure that has a sibling in another
  // currency: when both are non-zero they are shown together, and a
  // currency with nothing in it is left out rather than printed as zero.
  // The same, for a tile or a row where there is room for two lines: euros
  // first, dollars under them a size smaller -- never added, and never
  // squeezed into one line that wraps on a phone.
  const legs = (e: number | string | null | undefined, u: number | string | null | undefined) => {
    const eNum = Number(e) || 0;
    const uNum = Number(u) || 0;
    if (eNum && uNum) {
      return (
        <>
          {eur(eNum)}
          <span className="v2">{usd(uNum)}</span>
        </>
      );
    }
    if (uNum) return usd(uNum);
    return eur(eNum);
  };
  const twoLeg = (e: number, u: number): string => {
    const eNum = Number(e) || 0;
    const uNum = Number(u) || 0;
    if (eNum && uNum) return `${eur(eNum)} · ${usd(uNum)}`;
    if (uNum) return usd(uNum);
    return eur(eNum);
  };

  // Seven days. Far enough ahead to do something about it, near enough
  // that it is news.
  const dueWithinAWeek = (() => {
    const d = dueSubInvoice?.due_date ?? subscription?.next_payment_date;
    if (!d) return false;
    const days = dayjs(d).diff(dayjs(), "day");
    return days <= 7;
  })();
  // ── WHAT WE ACTUALLY CHARGED LAST TIME ──────────────────────────────
  //
  // subscriptions.amount is the LIST price. The billing run applies a
  // subscription_discount perk to the invoice and never writes it back,
  // so a customer on a perk sees their list price on every screen that
  // describes what they pay, and a different figure leaves their wallet.
  // The last paid subscription invoice is what they were actually
  // charged, and it is already loaded for the billing table.
  //
  // ── AND NOT FROM THE 30-ROW WINDOW ──────────────────────────────────
  //
  // `invoices` is .limit(30) across EVERY invoice type. planPaid and
  // dueSubInvoice were each given their own unbounded query for exactly
  // this hazard; this, the third consumer, was left on the list. A
  // customer who tops up weekly raises a receipt invoice each time, so
  // thirty rows is about five months -- after which their last paid
  // subscription invoice drops off the page, lastChargedAmount goes
  // undefined, and all three sites that render it fall back to
  // subscriptions.amount. Which is the LIST price, and the comment above
  // says why that is the wrong number: a customer on a subscription
  // discount then reads "EUR 200.00 / month" on their plan card while
  // EUR 5.00 leaves their wallet.
  const {
    data: lastChargedRow,
    isError: lastChargedError,
    isSuccess: lastChargedSettled,
  } = useQuery<{
    total: number | null;
    currency: string | null;
  } | null>({
    queryKey: ["adv-last-charged-sub", advertiserId, tenantId],
    enabled: !!advertiserId && !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("invoices")
        // ── AND ITS CURRENCY ──────────────────────────────────────
        //
        // This selected `total` alone and the figure was printed with
        // `planCur`, which is subscriptions.currency. After a plan
        // moves to another currency the number comes from one row and
        // the symbol from another: "$200.00 / month" for a EUR 200
        // invoice on a USD plan, where neither leg is the price.
        .select("total, currency")
        .eq("tenant_id", tenantId)
        .eq("advertiser_id", advertiserId)
        .eq("type", "subscription")
        .eq("status", "paid")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as {
        total: number | null;
        currency: string | null;
      } | null;
    },
  });
  // ── AND A FAILED READ IS NOT "NEVER CHARGED" ──────────────────────
  //
  // On an error this fell through to subscriptions.amount, the LIST
  // price -- which is the exact number the comment above says is wrong
  // for a customer on a subscription discount: "EUR 200.00 / month" on
  // the plan card while EUR 5.00 leaves the wallet. Undefined here means
  // the three render sites show the plan's own amount only when there
  // genuinely is no paid invoice; when the read FAILED they say so.
  const lastChargedAmount = lastChargedError
    ? undefined
    : (lastChargedRow?.total ??
      (invoices ?? []).find(
        (i) => i.type === "subscription" && i.status === "paid",
      )?.total);
  // isError OR not-yet-answered. `lastChargedError` alone left the LIST
  // price on screen for the whole first paint — and the subscription
  // row lands first almost every time, so a customer on a discount read
  // "EUR 200.00 / month" before it corrected itself to EUR 5.00.
  const chargedUnknown = lastChargedError || !lastChargedSettled;
  // The symbol belongs to the row the figure came from. planCur is
  // subscriptions.currency, and after a plan moves to another currency
  // that is a different row entirely.
  const chargedCur = (lastChargedRow?.currency ?? planCur).toUpperCase();
  const chargedMoney = (v: number | string | null | undefined) =>
    (chargedCur === "USD" ? "$" : "€") + money2(v);
  /** Same, for the headline. */
  const chargedMoneyNeat = (v: number | string | null | undefined) =>
    (chargedCur === "USD" ? "$" : "€") + moneyNeat(v);
  const dueBillAmount = dueSubInvoice
    ? `${dueSubSymbol}${money2(dueSubInvoice.total)}`
    : planMoney2(subscription?.amount);

  // CAN THEY ACTUALLY PAY IT?
  //
  // Both Pay buttons were enabled whatever the balance. An advertiser with
  // nothing in their EUR wallet pressed Pay on a €200 invoice and the
  // confirmation rendered "€0.00 → €-200.00" as a FACT, under a button
  // reading "Yes, pay €200.00". Confirming reaches the RPC's "Insufficient
  // wallet balance", so they learn by getting an error — on the most-used
  // money button in the app.
  //
  // A greyed-out button would stop the error and teach them nothing, so
  // the one that cannot pay offers the thing that fixes it instead.
  // ── THE OTHER WALLET ──────────────────────────────────────────────
  //
  // A customer holding $10,000 and nothing in EUR, looking at a EUR 200
  // invoice, was told "Top up to pay EUR 200.00" and sent to the wallet
  // to wire money they already have. Nothing anywhere mentioned that
  // Exchange would settle it in ten seconds. The grace then runs out,
  // the auto-debit fails, and they are marked past_due holding ten
  // thousand dollars.
  //
  // No rate is held on this screen, so this only asks whether the OTHER
  // wallet has anything in it at all: enough to be worth offering, and
  // the exchange dialog does the arithmetic honestly with a real rate.
  // ── AND `> 0` IS NOT "COVERS IT" ──────────────────────────────────
  //
  // This asked only whether the other wallet held ANYTHING. A customer
  // owing EUR 200 with one cent in USD was shown "Exchange to pay
  // EUR 200.00" — and because the button is one control, offering the
  // exchange TOOK AWAY the top-up route that was the real answer. They
  // press it, convert a cent, and land back on an invoice they still
  // cannot pay.
  //
  // It now asks the real question, at the real rate, after the real fee.
  // `null` from otherWalletCovers means the rate has not been read; that
  // is not "no", so the caller keeps both routes visible rather than
  // printing a confident refusal over a read that never completed.
  const canExchangeToPay = (
    inv:
      | { total?: number | string | null; currency?: string | null; items?: unknown }
      | null
      | undefined,
  ): boolean => {
    if (!inv || canPayInvoice(inv)) return false;
    const want = invCurrency(inv);
    const other = want === "USD" ? eurBal : usdBal;
    if (!(Number(other) > 0)) return false;
    const rate = getRate(eurRateRaw, want === "USD" ? "EUR" : "USD", want);
    const covers = otherWalletCovers(Number(inv.total) || 0, Number(other), rate);
    // Unknown rate: the dialog does the arithmetic honestly with a live
    // one, so let them through — and the secondary link below keeps the
    // top-up route on the screen either way.
    return covers !== false;
  };

  /** What the other wallet must give up for this invoice. Null if we cannot say. */
  const exchangeNeedFor = (
    inv: { total?: number | string | null; currency?: string | null } | null | undefined,
  ) => {
    if (!inv) return null;
    const want = invCurrency(inv);
    const total = Number(inv.total) || 0;
    if (total <= 0) return null;
    return {
      amount: total,
      currency: want,
      label: "to pay this invoice",
      from: (want === "USD" ? "EUR" : "USD") as "EUR" | "USD",
      fromAmount: neededFromAmount(total, getRate(eurRateRaw, want === "USD" ? "EUR" : "USD", want)),
    };
  };

  const canPayInvoice = (
    inv:
      | { total?: number | string | null; currency?: string | null; items?: unknown }
      | null
      | undefined,
  ): boolean => {
    if (!inv) return false;
    // ── A BALANCE WE HAVE NOT READ IS NOT A BALANCE OF ZERO ───────────
    //
    // usdBal and eurBal are 0 both while the wallet query is in flight
    // and when it has failed — the same file is careful about this 160
    // lines up, where the figures render as "…" and "—". Here it meant
    // the primary button first read "Top up to pay EUR 5.00", and
    // pressing it in that window navigated to the wallet instead of
    // paying. On a FAILED read it never flips: a customer holding EUR
    // 10,000 is permanently told to top up in order to pay EUR 5, and
    // the invoice goes past due and gets dunned.
    //
    // Unknown keeps the Pay label and lets the RPC answer. Being wrong
    // that way costs one refusal message; the other way costs a customer
    // who cannot pay a bill they can afford.
    if (walletLoading || walletError) return true;
    const bal = invCurrency(inv) === "USD" ? usdBal : eurBal;
    // A cent of tolerance: these columns are single-precision on live, so
    // an exact-balance payment must not be refused by a rounding artefact.
    // ── THE SERVER'S RULE, NOT A LOOSER ONE ───────────────────────
    //
    // invoice_pay_from_wallet refuses on `v_bal < v_amt`, with no
    // epsilon. This added half a cent, so a balance of 99.995 against a
    // 100.00 invoice rendered "Pay EUR 100.00 from wallet" and the RPC
    // answered "Insufficient wallet balance" -- a red toast on a button
    // the app had just told them to press. Same comparison both sides.
    return bal >= Number(inv.total ?? 0);
  };


  // What actually gates a new ad account is the PLAN, not the wallet.
  // A plan comes with included accounts, so an advertiser whose plan is
  // running asks for one and it is covered; once the included ones are used
  // up they can still ask and pay for the extra. What they cannot do is
  // start before the plan itself is paid for — nothing is included yet, and
  // there is no subscription to bill the extra against.
  // ── "Active" means PAID FOR ──────────────────────────────────────────
  // create_subscription_from_invite inserts the subscription with
  // status='active' at SIGNUP, before a cent has moved and before any
  // invoice exists. So "status === active && no unpaid invoice" was true
  // from the moment someone accepted an invitation — which is why the plan
  // tile said Active next to a Pay now button on a brand-new account, and,
  // worse, why effectiveMinTopup saw planActive=true and imposed the 300
  // floor on the very first top-up. That floor is exactly what the rule
  // exists to prevent: the first payment is how the plan gets paid at all.
  //
  // Evidence of payment is a PAID subscription invoice. No invoice yet is
  // not "active", it is "nothing has happened yet".
  // The advertiser's community decides their floor once the plan is running
  // — NSA is 250 where everyone else is 300. It was simply not loaded on
  // this screen, so the helper could never apply the NSA rule and every NSA
  // customer was held to 300.
  const communities = useAdvertiserCommunities([advertiserId]);
  const community = advertiserId ? communities[advertiserId] : undefined;

  // NOT from the invoice list. That list is `.limit(30)` and holds every
  // invoice type, so on an account with a year of history and a few ad
  // accounts the last paid subscription invoice falls off the page — and
  // then planPaid reads false, effectiveMinTopup returns 0, the dialog
  // accepts €5, shows the IBAN, takes the payment slip, and the RPC (which
  // scans ALL invoices) refuses with "Minimum top-up is 300 EUR" after the
  // transfer has been made. That is the exact trap this morning's
  // migration exists to close, re-armed by a pagination limit.
  const {
    data: planPaidRow,
    isError: planPaidError,
    isSuccess: planPaidLoaded,
  } = useQuery({
    queryKey: ["adv-plan-paid", advertiserId, tenantId],
    enabled: !!advertiserId && !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("invoices")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("advertiser_id", advertiserId)
        .eq("type", "subscription")
        .eq("status", "paid")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
  const planPaid = !!planPaidRow;
  // ── THE FIRST DAY IS NOT "PAID", IT IS "NOT YET RAISED" ──────────
  //
  // Nothing raises a subscription invoice until the nightly billing
  // run at 03:00, so a customer who signed up at 10am has a plan
  // marked `active`, no invoice at all, and up to seventeen hours
  // before one exists. Every branch on the Billing card keys off
  // dueSubInvoice being falsy -- which is equally true of "paid" and
  // of "never raised" -- so their very first day read "This month is
  // paid", "Nothing owed right now" and a green Paid badge, about a
  // month they had not paid for.
  //
  // Three states, not two: nothing raised yet, something due, or
  // settled.
  const advReadsWillRun = !!advertiserId && !!tenantId;
  // ── A PLAN THAT IS NOT RUNNING IS NOT THE CUSTOMER'S PLAN ────────────
  //
  // planName comes from advertiser_plans -- the plan we ASSIGNED, e.g. on
  // the invite -- not from a subscription. PSM0007 was assigned Prime and
  // never subscribed, so the dashboard tile read "Prime · No subscription"
  // and Billing headlined PRIME over a "No plan" pill. The owner: "er is
  // geen plan maar er staat overal prime". With no subscription there is
  // no plan to name; the invoice lines keep using planName.
  const noPlan = subLoaded && !subscription;
  const shownPlanName = subscription ? planName : null;
  const awaitingFirstInvoice =
    !!subscription &&
    !planPaid &&
    !dueSubInvoice &&
    // ── AND NOT WHILE THEY ARE STILL ARRIVING ─────────────────────
    //
    // This consulted isError on three queries and the isLoading of
    // none, and "not an error yet" is also true of "has not answered
    // yet". These are four independent round trips fired in parallel;
    // adv-subscription is one row of four columns and lands first
    // almost every time, so for the width of the two invoice reads
    // EVERY conjunct held.
    //
    // What an existing customer with a EUR 200 invoice due in three
    // days therefore saw when they opened Billing: "We raise your
    // first invoice overnight. Nothing has been charged yet, and
    // nothing is owed until it appears", with a grey "Not yet raised"
    // badge -- and then it flipped to the truth. On the one screen
    // that answers "do I owe you money".
    //
    // It also wins over invLoading in the sentence chain below, and
    // invLoading belongs to a THIRD query anyway (the invoice LIST),
    // not to either of the two that decide this.
    //
    // isSuccess, not !isError: it is true only once the data is
    // actually here, which is the state this claim needs.
    planPaidLoaded &&
    dueInvLoaded &&
    advReadsWillRun &&
    !planPaidError &&
    !subError &&
    !invError &&
    !dueInvError;
  // ── THE SAME PREDICATE THE SERVER USES, TO THE CLAUSE ──────────────
  //
  // `dueSubInvoice` deliberately includes subscription_adjustment,
  // because the auto-debit collects those and the Billing card must not
  // say "this month is paid" over a EUR 50 adjustment. That is the right
  // answer to "do you owe us money" and the WRONG one to "is the plan
  // active", which is what the minimum-top-up floor turns on --
  // 20260917230000 counts only `type = 'subscription'`:
  //
  //   active subscription
  //   AND a PAID type='subscription' invoice exists
  //   AND no unpaid, non-void type='subscription' invoice
  //
  // With one unpaid adjustment the client said false and the server said
  // true, so effectiveMinTopup returned 0, the dialog showed no floor,
  // handed over the IBAN and the reference, took the slip -- and the RPC
  // refused with "Minimum top-up is 300 EUR" AFTER the bank transfer had
  // been made. That is the exact incident that migration exists to
  // prevent, arriving through a second invoice type.
  const unpaidPlanInvoice = (dueInvoices ?? []).some(
    (i) => i.type === "subscription" && i.status !== "paid" && i.status !== "void",
  );
  const planActive =
    !!subscription &&
    subscription.status === "active" &&
    !unpaidPlanInvoice &&
    planPaid;
  // How many accounts the plan includes is NOT on `subscriptions` — asking
  // for it there took the whole subscription query down with
  // "column subscriptions.included_ad_accounts does not exist", which also
  // blanked the plan tile and the fee notice that read from it. It lives on
  // `plans`, and this screen does not load plans, so the count is simply not
  // claimed here rather than guessed at.
  // Already having an account means this gate was passed once before.
  // WE DO NOT KNOW IS NOT THE SAME AS NO.
  //
  // Three reads decide whether this customer may top up or ask for an
  // account: their company, their subscription, and whether a
  // subscription invoice has been paid. Each of them failing produced a
  // confident FALSE — so a customer whose details are complete was told
  // to "Add your company details", with Top up and Exchange greyed out
  // and no way to satisfy a condition they had already met.
  //
  // Worse on the money side: planActive false makes effectiveMinTopup
  // return 0, so the dialog accepted a 5 EUR transfer and showed the
  // IBAN — while the server reads the same three facts from the database,
  // still sees the plan running, and throws "Minimum top-up is 300 EUR"
  // on submit. After the bank transfer has been made.
  //
  // So an unreadable answer is carried as unknown, and the guards below
  // treat unknown as "let them through and let the server decide" —
  // because the server is the real boundary and it is never wrong about
  // its own state.
  // ── ONE FLAG FOR FOUR UNRELATED READS WAS TOO BLUNT ─────────────────
  //
  // `companyError || planPaidError || subError || invError` gated TWO
  // different rules, in opposite directions, off whichever of the four
  // happened to fail. So a failed INVOICES read — a query that names
  // `due_date`, which the migrations README still lists this table
  // without — did both of these at once:
  //
  //   * unlocked Top up, Exchange and Request one for an advertiser with
  //     NO companies row at all. Neither wallet_topup_advertiser_create
  //     nor ad_account_request_create_paid has a company gate, so a real
  //     bank transfer arrives and EUR 50 is debited for somebody no
  //     invoice can ever be raised for.
  //   * forced planActive true, which puts the EUR 300 floor back on a
  //     first top-up that the server would have accepted at EUR 5 — and
  //     the customer only learns that after they have wired the money.
  //
  // Split, so each rule is unknown only when the read BEHIND THAT RULE
  // failed. The company question is answered by the company read.
  const companyUnknown = companyError;
  // ── AND THE READ THAT ACTUALLY SUPPLIES THE ANSWER ───────────────
  //
  // This listed invError, which belongs to the `adv-invoices` LIST
  // query. Everything the Billing card decides from is dueSubInvoice,
  // which comes from `adv-due-sub-invoices` -- and that query's error
  // was never destructured at all. So when the one read that knows
  // whether anything is owed failed, the card printed a green tick and
  // "This month is paid", with no Pay button, over an invoice that was
  // very much due. Seven days later the cron collects it, or dunning
  // marks them past_due, and the only warning was a toast that had
  // already gone.
  const planUnknown = planPaidError || subError || invError || dueInvError;
  // ── DO WE KNOW WHETHER ANYTHING IS DUE? ─────────────────────────────
  //
  // Three branches guarded on `invLoading`, which is the isLoading of
  // adv-invoices -- the 30-row LIST -- and not of adv-due-sub-invoices,
  // which is the read that actually decides it. The list is the bigger
  // request (30 rows with an `items` jsonb each), so it routinely lands
  // LAST: for the whole time the due-invoice read is in flight, or
  // retrying (make-query-client sets retry: 1, during which isError is
  // still false and data still undefined), `dueSubInvoice` is undefined
  // and every branch fell through to the settled one.
  //
  // awaitingFirstInvoice does not cover it: it requires !planPaid, so it
  // only ever speaks for a NEW customer. For an existing one planPaid is
  // true and the chain goes straight to "This month is paid".
  //
  // A customer with EUR 1,240.50 in the wallet and a EUR 200 invoice due
  // in three days therefore read a green tick, "This month is paid", a
  // green Paid badge and "Nothing owed right now" -- with no Pay button,
  // because that too is inside the dueSubInvoice branch. Seven days
  // later the auto-debit takes it and dunning can mark them past_due.
  //
  // ── AND A QUERY THAT WILL NEVER RUN IS SETTLED, NOT LOADING ───────
  //
  // react-query v5 reports isPending true and isSuccess FALSE for ever
  // on a DISABLED query. All of these are `enabled: !!advertiserId`,
  // and `booting` is explicitly false when there is no advertiser row,
  // so nothing held the page back -- a profile with no advertiser
  // (the repo's own check file says two exist today) sat on
  // "checking…", "Loading…" and "Looking up your plan…" permanently.
  // Before these guards those screens were wrong-but-settled; a
  // spinner that never ends is worse.
  const dueUnknown =
    advReadsWillRun &&
    (invError ||
      dueInvError ||
      invLoading ||
      !dueInvLoaded ||
      // planPaidError was not in here, and "This month is paid" with a
      // green tick is drawn from that read. So a failed lookup told a
      // customer who has never paid anything that they had — which is
      // exactly the day-one case the note further up was written to
      // stop, reached through the error path instead.
      planPaidError ||
      // …and the subscription read, which the dashboard Plan tile turns
      // into the words "No subscription".
      subError);
  // WHY the Request button is dead, in the customer's words. It always
  // blamed the plan — "Your plan has to be active first" — and
  // canRequestAccount fails on EITHER leg, so somebody whose plan is paid
  // and shows Active on the same page read an explanation they could see
  // was untrue. The usual real cause is the billing address, which lives
  // on a different form.
  const requestBlockedReason = (): string | null => {
    if (canRequestAccount) return null;
    if (!companyComplete && !companyUnknown) {
      return companyMissing.length && companyMissing.length <= 2
        ? `Still needed first: ${companyMissing.join(" and ")}`
        : "Add your company details first — including the billing address";
    }
    // ── SAY WHICH OF THE TWO IT IS ────────────────────────────────
    //
    // planActive needs a PAID invoice, and on day one there is no
    // invoice at all -- so this blamed the plan for not being active
    // while the Billing pill and the dashboard tile, which read
    // subscriptions.status, both printed "Active". Three screens, and
    // the customer could see two of them contradicting the third.
    if (noPlan) {
      return "Ad accounts come with a plan — ask us to start one for you first";
    }
    if (awaitingFirstInvoice) {
      return "Your first invoice hasn't been raised yet — we raise it overnight, and ad accounts open up once it is paid";
    }
    if (!planActive && !planUnknown) {
      return dueSubInvoice
        ? "Pay your subscription invoice first — that is what your included ad accounts come from"
        : "Your plan has to be active first — that is what your included ad accounts come from";
    }
    return "We couldn't check your plan just now — reload and try again";
  };

  // ── NO PLAN, NO REQUEST ─────────────────────────────────────────────
  //
  // This let anyone who already HAD an account request another, plan or
  // no plan ("having an account means this gate was passed once"). But an
  // account an admin created by hand passed no gate at all -- PSM0007 has
  // one and no subscription -- and a plan that lapsed is not a plan. The
  // owner: "zonder plan moet eigenlijk niemand een ad account aan kunnen
  // vragen". A plan read that failed is not a yes either:
  // requestBlockedReason says we could not check, and the button waits.
  const canRequestAccount = (companyComplete || companyUnknown) && planActive;

  // ── Deep links ──────────────────────────────────────────────────────
  // The views were pure state, so nothing outside this component could
  // point at one: every push notification, every email and every "go to
  // billing" link had to land on the dashboard and leave the customer to
  // find the screen themselves. A reload also threw away whichever view
  // they were on.
  //
  // window.location rather than useSearchParams: this is a client-only
  // concern and useSearchParams drags a Suspense requirement into a page
  // that does not otherwise need one.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const wanted = new URLSearchParams(window.location.search).get("view");
    // Object.hasOwn, NOT `in`. The `in` operator walks the prototype
    // chain, so "__proto__" in TITLES is true — setView("__proto__")
    // then makes TITLES[view] evaluate to Object.prototype, which React
    // refuses to render ("Objects are not valid as a React child"), so
    // ?view=__proto__ crashes the customer's own dashboard.
    // ?view=toString matches no view div and leaves them on a blank page.
    if (wanted && Object.hasOwn(TITLES, wanted)) setView(wanted as View);
    // Mount only. Later changes come from go(), which writes the URL itself.
  }, []);

  const go = (v: View) => {
    setView(v);
    setNavOpen(false);
    // Every view is rendered at once and switched with CSS, so opening
    // Referrals re-read nothing: a commission booked since the app loaded
    // stayed invisible until a reload. Opening it asks again.
    if (v === "referrals") {
      void aff.refetch();
      queryClient.invalidateQueries({ queryKey: ["affiliate-commissions"] });
    }
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
      // replaceState, not push: the in-app views are not browser history
      // steps — Back should leave the app, not walk through the tabs the
      // customer happened to open. This only makes a reload land where they
      // were, and makes the current view linkable.
      const url = new URL(window.location.href);
      if (v === "dash") url.searchParams.delete("view");
      else url.searchParams.set("view", v);
      window.history.replaceState(null, "", url.toString());
    }
  };
  // The bell is a peek, not a destination: press it, glance, press it again
  // and you are back where you were. Going "back" to the dashboard instead
  // would lose whichever screen you were actually working on.
  const toggleNotifs = () => {
    if (view === "notif") {
      go(viewBeforeNotifs.current);
      return;
    }
    viewBeforeNotifs.current = view;
    go("notif");
  };
  const openAcctTopup = (a: AdAccount) => {
    setAcctTopup(a);
    setAcctTopupOpen(true);
  };
  const openDetails = (id: string) => {
    setDetailsId(id);
    setDetailsOpen(true);
  };
  const router = useRouter();
  const logout = async () => {
    // Clears the session AND the httpOnly profile_id cookie — see
    // lib/auth/sign-out.ts for why the second half matters.
    await signOutCompletely();
    router.push("/auth/login");
  };

  // Close the account menu on outside-click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Escape also closes the sign-out confirmation.
  useEffect(() => {
    if (!signOutOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSignOutOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [signOutOpen]);

  const [payingId, setPayingId] = useState<string | null>(null);
  // Returns whether the money actually moved, so the confirmation can stay
  // on screen when it did not — closing the modal on a failure reads as
  // "done" and the customer goes looking for a payment that never happened.
  const payInvoice = async (id: string): Promise<boolean> => {
    if (payingId) return false;
    setPayingId(id);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("invoice_pay_from_wallet", {
        p_invoice_id: id,
      });
      if (error) throw error;
      // ── "PAID" ONLY IF SOMETHING MOVED ─────────────────────────────
      //
      // The RPC is idempotent: it takes `for update`, and if the
      // invoice is already paid it returns the row having moved
      // nothing. This discarded `data` and said "Invoice paid from
      // your wallet" either way -- so pressing Pay on an invoice the
      // nightly run had already collected an hour earlier told the
      // customer their wallet had just been debited again.
      const row = (Array.isArray(data) ? data[0] : data) as
        | { status?: string | null; paid_at?: string | null }
        | null
        | undefined;
      const alreadyPaid =
        !!row?.paid_at &&
        Date.now() - new Date(row.paid_at).getTime() > 60_000;
      if (alreadyPaid) {
        toast.info("That invoice was already settled", {
          description:
            "Nothing was taken from your wallet just now — it had already been paid.",
        });
      } else {
        toast.success("Invoice paid from your wallet.");
      }
      queryClient.invalidateQueries({ queryKey: ["adv-invoices"], exact: false });
      // The due-invoice read is its own query now, so it needs its own
      // line here — paying an invoice that does not disappear from the
      // billing card is the whole reason this list is invalidated.
      queryClient.invalidateQueries({
        queryKey: ["adv-due-sub-invoices"],
        exact: false,
      });
      // ── AND THE PLAN-PAID CACHE ────────────────────────────────────
      //
      // `adv-plan-paid` is read nowhere else and was invalidated nowhere
      // at all. This app is one component holding `view` in state, so
      // the observer never remounts, and a 30-second staleTime with
      // refetch-on-focus off means the stale `false` survives until a
      // full page reload.
      //
      // That one missing key re-armed the minimum-top-up trap the moment
      // somebody paid their first invoice: planActive stayed false, so
      // the top-up dialog showed NO minimum, printed the IBAN and took
      // the transfer — and the server, re-deriving the same three facts
      // from the database, refused with "Minimum top-up is 300 EUR"
      // after the money had left their bank. That is the incident
      // 20260917230000 exists for, arriving through a cache instead of
      // through SQL.
      queryClient.invalidateQueries({
        queryKey: ["adv-plan-paid"],
        exact: false,
      });
      queryClient.invalidateQueries({ queryKey: ["wallet"], exact: false });
      // ── AND EVERYTHING THE PAYMENT JUST CHANGED ────────────────────
      //
      // `_on_subscription_invoice_paid` sets the subscription back to
      // `active` and moves next_payment_date on. Neither
      // ["adv-subscription"] nor ["adv-last-charged-sub"] was
      // invalidated here — and a grep of the whole repo says NOTHING
      // invalidates either key, anywhere.
      //
      // This app is one component with CSS-toggled views, so nothing
      // remounts; staleTime is 30s and refetchOnWindowFocus is off. So
      // after a customer cleared a past-due invoice their own billing
      // card kept the pill "Payment due" and the old renewal date for
      // the rest of the session, and a discounted customer paying their
      // first invoice kept reading the LIST price per month. Only a
      // full page reload put it right.
      queryClient.invalidateQueries({
        queryKey: ["adv-subscription"],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: ["adv-last-charged-sub"],
        exact: false,
      });
      // The statement and its CSV. Four other money paths invalidate
      // this and each carries a comment saying the report has no other
      // refetch trigger; the largest recurring debit in the app did
      // not, so the file a bookkeeper is handed was short by exactly
      // the invoice amount.
      queryClient.invalidateQueries({
        queryKey: ["finance-report"],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: ["adv-wallet-activity"],
        exact: false,
      });
      return true;
    } catch (e) {
      toast.error("Couldn't pay from wallet", {
        description: e instanceof Error ? e.message : undefined,
      });
      return false;
    } finally {
      setPayingId(null);
    }
  };

  // ── Are you sure? ────────────────────────────────────────────────────
  // Everything on these screens that moves money asks first, in a modal you
  // cannot scroll past or click around. Pay now used to take the money on
  // the first press, with no way back — one mis-tap on a phone and the month
  // was paid. The state is generic so the next money button gets the same
  // treatment for free instead of another bespoke boolean.
  const [taxOpen, setTaxOpen] = useState(false);
  const [ask, setAsk] = useState<{
    title: string;
    lead: string;
    facts: [string, string][];
    cta: string;
    /** The glyph on the confirm button. A tick means "done"; a button
        that takes money out of a wallet should say so, like the one that
        opened it. */
    icon?: string;
    busyLabel: string;
    run: () => Promise<boolean>;
    /**
     * The plan card, when this confirmation IS a plan payment.
     *
     * Somebody is about to pay 200 euros a month. The box that asks them
     * listed "Monthly plan" in grey next to an amount — the same
     * confirmation shape as a 5-euro correction. It should be obvious, at
     * a glance, WHAT they are buying, and this is the pricing card they
     * chose it from.
     *
     * What it does NOT do is replace the facts underneath, or the line
     * about there being no undo. A confirmation that sells and hides that
     * the money is gone is worse than a plain one.
     */
    hero?: {
      name: string;
      amount: string;
      per: string;
      perks: string[];
    };
  } | null>(null);
  const [asking, setAsking] = useState(false);

  const askToPay = (inv: {
    id: string;
    total: number | string | null;
    type?: string | null;
    due_date?: string | null;
    items?: unknown;
    currency?: string | null;
  }) => {
    // ── THE MODAL, WHICH WAS THE ONE THAT WAS MISSED ────────────────
    //
    // The card and the amount column were changed to read the invoice's
    // own column alone; this -- the confirmation that opens when the
    // customer presses Pay, and the thing that actually calls
    // invoice_pay_from_wallet -- still read items[0]. So the button
    // said EUR 2,000.00 and the dialog it opened said "Straight from
    // your USD wallet", "Yes, pay $2,000.00", with a USD before/after
    // row, while EUR 2,000 left the EUR wallet. There is no undo.
    //
    // One helper, so the three surfaces cannot drift again.
    const cur = invCurrency(inv);
    const sym = cur === "USD" ? "$" : "€";
    const isPlan = inv.type === "subscription" && !!planName;

    // "PER MONTH" IS A CLAIM ABOUT WHAT RECURS, and the card was making it
    // about the invoice total. A customer on a €200 plan with a discount
    // is invoiced €5, so the hero read "€5.00 per month" — a stated
    // recurring price that is false, on the screen where they decide to
    // pay. A prorated invoice after a plan change reads the same way, and
    // a yearly term would have printed twelve months as a monthly price.
    //
    // So the period is only claimed when the amount actually IS the
    // recurring one. Otherwise the card says what is true of this
    // payment: it is due now.
    const subAmount = Number(subscription?.amount ?? NaN);
    const invAmount = Number(inv.total ?? 0);
    const isRecurringAmount =
      Number.isFinite(subAmount) && Math.abs(subAmount - invAmount) < 0.005;
    const term =
      String(
        (subscription as { billing_period?: string | null } | null)
          ?.billing_period ?? "month",
      ) === "year"
        ? "per year"
        : "per month";

    setAsk({
      hero: isPlan
        ? {
            name: planName!,
            amount: `${sym}${money2(inv.total)}`,
            per: isRecurringAmount ? term : "due now",
            // Straight from the plan row. When an admin has not filled
            // them in yet, one line that is true of every plan rather
            // than an empty card or an invented promise.
            // The fallback promises NOTHING about the platform. "Your ad
            // accounts stay live" was in here and it is not ours to
            // promise — whether Meta keeps an account alive is Meta's
            // decision, and a renewal card is the worst place to imply
            // otherwise. What is left is true of every plan we sell.
            perks:
              plan?.features.length
                ? plan.features
                : // NOT "Cancel monthly". There is no cancellation
                  // control anywhere in the customer app — every
                  // subscription status change, `cancelled` included, is
                  // behind requireAdminCtx. Printing it as a perk inside
                  // the pay-now confirmation promises something the
                  // customer cannot do and has to email us for.
                  ["Support 7 days a week", "No long-term contract"],
          }
        : undefined,
      title: isPlan ? "Renew your plan?" : "Pay this from your wallet?",
      icon: "i-wallet",
      // Shorter, same meaning. Three lines of warning above the facts
      // pushed the button below the fold on a phone.
      lead: `Straight from your ${cur} wallet. No undo — message us if it is wrong.`,
      facts: [
        // WITH THE PLAN CARD ABOVE, these two rows are that card said a
        // second time — it already names the plan and prints the amount
        // per month, and the button underneath says "Yes, pay €5.00".
        // Three statements of one number is what pushed the footer off
        // the bottom of a short phone. So they appear only when there is
        // no card above to say it.
        ...(isPlan
          ? ([] as [string, string][])
          : ([
              ["What for", invoiceTypeLabel(inv.type)],
              ["Amount", `${sym}${money2(inv.total)}`],
            ] as [string, string][])),
        // BEFORE AND AFTER. "Out of your EUR wallet" did not say what was
        // in it or what would be left — so somebody pressing this could
        // not tell whether it empties them, and the one thing a person
        // wants to know before money leaves is what remains.
        [
          `Your ${cur} wallet`,
          (() => {
            // ── AND NOT A BALANCE WE HAVE NOT READ ──────────────────
            //
            // usdBal/eurBal are Number(wallet?.x ?? 0), which is 0 while
            // the wallet query is in flight AND when it has failed. This
            // dialog used to be unreachable in that state — canPayInvoice
            // sent an unknown balance to the wallet screen instead — and
            // then that was fixed so the Pay label stops flipping to
            // "Top up to pay", which made the dialog reachable and left
            // this line behind. A customer holding EUR 10,000 was told
            // "€0.00 → €-99.00" in the one dialog whose whole purpose is
            // that its figures are real. The balance tiles 1,300 lines up
            // already print "—" for this; so does this now.
            if (walletLoading || walletError) {
              return "We couldn't read your balance just now";
            }
            const before = cur === "USD" ? usdBal : eurBal;
            const after = before - Number(inv.total ?? 0);
            const fmt = (n: number) => `${sym}${money2(n)}`;
            return `${fmt(before)} → ${fmt(after)}`;
          })(),
        ],
        [
          "Due",
          inv.due_date
            ? dayjs(inv.due_date).format("D MMM YYYY")
            : "No date set",
        ],
      ],
      cta: `Yes, pay ${sym}${money2(inv.total)}`,
      busyLabel: "Paying…",
      run: () => payInvoice(inv.id),
    });
  };

  // Escape closes the money confirmation — but never while the write is in
  // flight, when the dialog disappearing would look like a cancellation.
  useEffect(() => {
    if (!ask) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !asking) setAsk(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ask, asking]);

  const NAV: { v: View; icon: string; label: string; aff?: boolean }[] = [
    { v: "dash", icon: "i-home", label: "Dashboard" },
    { v: "wallet", icon: "i-wallet", label: "Wallet" },
    { v: "accounts", icon: "i-ad", label: "Ad accounts" },
    { v: "requests", icon: "i-rocket", label: "Requests" },
    { v: "billing", icon: "i-receipt", label: "Billing" },
    { v: "report", icon: "i-chart", label: "Financial report" },
  ];
  const NAV2: { v: View; icon: string; label: string }[] = [
    { v: "notif", icon: "i-bell", label: "Notifications" },
    { v: "settings", icon: "i-settings", label: "Settings" },
    { v: "help", icon: "i-help", label: "Get help" },
  ];
  const BOTTOM: { v: View; icon: string; label: string }[] = [
    { v: "wallet", icon: "i-wallet", label: "Wallet" },
    { v: "accounts", icon: "i-ad", label: "Accounts" },
    { v: "dash", icon: "i-home", label: "Home" },
    { v: "billing", icon: "i-receipt", label: "Billing" },
    { v: "settings", icon: "i-settings", label: "Settings" },
  ];

  const AccountCard = ({ a }: { a: AdAccount }) => {
    const b = statusBadge(a.status);
    // Locked for money, not just for looks: a switched-off account must
    // not offer a Top up button, and until now `disabled` was not in this
    // list at all.
    // One list, in lib/pure-account-status, used by the card, the
    // sheet and the server action. An unknown status counts as locked.
    const locked = isAccountLocked(
      (a.status ?? "").trim().toLowerCase(),
    );
    return (
      <div
        className={`acard${a.status === "banned" ? " banned" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => openDetails(a.id)}
        onKeyDown={(e) => {
          // ── ONLY WHEN THE CARD ITSELF HAS FOCUS ─────────────────
          //
          // A keydown on the inner "Top up" / "Details" button bubbles
          // up to here. Without this test, preventDefault() swallowed
          // that button's own activation and opened the details sheet
          // instead -- so Top up became unreachable by keyboard on
          // every unlocked account, on the card that had just been
          // made keyboard-reachable. The inner buttons stop click
          // propagation, not keydown.
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openDetails(a.id);
          }
        }}
      >
        <div className="top">
          {/* The platform's own mark. Every tile carried the same grey
              monitor, so a list of accounts gave the eye nothing to sort
              by and the only thing naming the platform was a small grey
              line of text. */}
          <span className="pfi">
            <PlatformMark slug={a.platform} className="pmark" />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="nm">{a.name || "Ad account"}</div>
            {platformLabel(a.platform) ? (
              <div className="sub">{platformLabel(a.platform)}</div>
            ) : null}
          </div>
          <span style={{ marginLeft: "auto" }}>
            <span className={`badge ${b.cls}`}>{b.label}</span>
          </span>
        </div>
        <div className="kv">
          {/* NOT THE FEE CHARGED. ad_accounts.fee is one of five
              inputs: resolveEffectiveFeePct treats 0 as NOT SET
              and falls through to the plan rate, then subtracts
              two points for a premium type, then applies any
              waiver or discount perk. So this printed "Fee 0%"
              beside a Top up button that charges 5%. The
              funding dialog asks the server for the real
              number; a card cannot, so it must not state one. */}
          <span>Fee</span>
          <b>{a.fee == null || Number(a.fee) === 0 ? "Set by your plan" : `${Number(a.fee)}%`}</b>
        </div>
        <div className="kv">
          <span>Currency</span>
          {/* NOT `?? "EUR"`. An account with no currency cannot be
              funded at all -- the funding dialog refuses it -- so
              printing EUR here told the customer the opposite of what
              the next screen would say. */}
          <b>{a.currency ? a.currency : "Not set yet"}</b>
        </div>
        {/* Only once there IS a figure. A brand-new account showing
            "Funded $0.00" reads as a fault; saying nothing reads as
            new, which is what it is.

            But a FAILED read is not a new account either, and the row
            simply vanishing said exactly that. On an error the line
            stays and shows a dash. */}
        {accountTotalsError ? (
          <div className="kv">
            <span>Funded to date</span>
            <b>—</b>
          </div>
        ) : (accountTotals?.[a.id]?.amount ?? 0) > 0 ? (
          <div className="kv">
            <span>Funded to date</span>
            <b>
              {money2sym(
                accountTotals![a.id].amount,
                accountTotals![a.id].currency,
              )}
            </b>
          </div>
        ) : null}
        {locked ? (
          <div className="acts">
            {/* A sentence per state, and nothing falls through to
                "setting up" — an account somebody switched off should not
                tell the customer it is nearly ready. */}
            <div className={`lockmsg${a.status === "banned" ? " banned" : ""}`}>
              <Ic
                name={
                  a.status === "banned" || a.status === "disabled"
                    ? "i-shield"
                    : "i-clock"
                }
              />
              {a.status === "banned"
                ? "Closed by the platform — top-ups and withdrawals are off."
                : a.status === "disabled"
                  ? "Switched off — top-ups are off. Message us if that's unexpected."
                  : a.status === "suspended"
                    ? "Suspended — top-ups are off while we look into it."
                    : a.status === "paused"
                      ? "Paused — actions are off for now."
                      : a.status === "pending"
                        ? "Setting up — this account will be ready shortly."
                        : "This account isn't taking top-ups right now."}
            </div>
            {/* ── AND A WAY TO THE MONEY ON IT ────────────────────────
                The locked branch rendered the sentence and NO Details
                button. `locked` is anything that is not active/approved/
                live -- so paused, disabled, suspended, pending and a
                blank status all qualify -- while the withdrawal action
                refuses only `banned` and `closed`. Every one of those
                accounts CAN be emptied back to the wallet, and Details
                is the only door to the control that does it.

                So a customer with $4,000 on a paused account read
                "Paused -- actions are off for now." and nothing else.
                The card div is clickable, but it carries no role, no
                tabIndex and no key handler, so a keyboard or
                screen-reader user could not reach it at all. */}
            <button
              className="btn ghost sm"
              onClick={(e) => {
                e.stopPropagation();
                openDetails(a.id);
              }}
            >
              Details
            </button>
          </div>
        ) : (
          <div className="acts">
            <button
              className="btn sm"
              onClick={(e) => {
                e.stopPropagation();
                openAcctTopup(a);
              }}
            >
              <Ic name="i-plus" /> Top up
            </button>
            <button
              className="btn ghost sm"
              onClick={(e) => {
                e.stopPropagation();
                openDetails(a.id);
              }}
            >
              Details
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`advapp app ${jakarta.variable} ${dmSans.variable}`}>
      <style>{ADV_CSS}</style>
      <AdvIcons />

      <div
        className={`scrim${navOpen ? " on" : ""}`}
        onClick={() => setNavOpen(false)}
      />

      <aside className={`sidebar${navOpen ? " open" : ""}`}>
        <button
          type="button"
          className="logo"
          onClick={() => go("dash")}
          aria-label="Go to the dashboard"
        >
          <span className="mark">
            <Ic name="i-rocket" />
          </span>
          <span className="name">
            Prime Scale Media<small>Advertiser</small>
          </span>
        </button>
        {NAV.map((item) => (
          <button
            key={item.v}
            className={`navlink${view === item.v ? " on" : ""}`}
            onClick={() => go(item.v)}
          >
            <Ic name={item.icon} /> {item.label}
          </button>
        ))}
        <div className="navsec">Account</div>
        {NAV2.map((item) => (
          <button
            key={item.v}
            className={`navlink${view === item.v ? " on" : ""}`}
            onClick={() => go(item.v)}
          >
            <Ic name={item.icon} /> {item.label}
          </button>
        ))}
        <div className="navsec">Earn</div>
        <button
          className={`navlink${view === "referrals" ? " on" : ""}`}
          onClick={() => go("referrals")}
        >
          <Ic name="i-gift" /> Affiliate program
        </button>
        <div className="side-foot">
          <span className="avatar">
            <PsmAvatar
              seed={profile?.id ?? name}
              name={name}
              email={profile?.email}
              role="advertiser"
              size={34}
            />
          </span>
          <div className="who">
            {name}
            <small>{profile?.tenant?.name ?? "Advertiser"}</small>
          </div>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          {/* Same treatment the super-admin bar already had: the left cluster
              is a .toolbar too, so the bar reads as two matched groups rather
              than a loose button beside a loose tile beside a pill. */}
          <div className="toolbar tb-left">
            <button
              className="tool ic-btn ham"
              aria-label="Menu"
              onClick={() => setNavOpen(true)}
            >
              <Ic name="i-menu" />
            </button>
            {/* A logo in the top bar is the way back to the start on
                every site there has ever been, and this one did nothing.
                It is a button now, not a decoration. */}
            <button
              type="button"
              className="tb-brand"
              onClick={() => go("dash")}
              aria-label="Go to the dashboard"
              title="Dashboard"
            >
              <span className="mark">
                <Ic name="i-rocket" />
              </span>
            </button>
          </div>
          <span className="tb-title">{TITLES[view]}</span>
          <div className="tb-spacer" />
          <div className="toolbar">
            <button
              className="tool wal"
              onClick={() => go("wallet")}
              title="Open wallet"
            >
              <Ic name="i-wallet" />
              {/* BOTH, OR THE ONE THEY ACTUALLY HOLD.
                  This printed the EUR balance under a label reading
                  "Wallet", so an advertiser who only ever funds USD read
                  "Wallet EUR 0" on every screen in the app — including
                  while standing on the wallet page where the USD card
                  said $12,400. Every other balance surface here shows
                  both and never picks one. */}
              <span className="e">
                <small>Wallet</small>
                <b>
                  {usdBal > 0 && eurBal > 0
                    ? `${eurText} · ${usdText}`
                    : usdBal > 0
                      ? usdText
                      : eurText}
                </b>
              </span>
            </button>
            {subscription?.status && (
              <button
                className="tool st"
                onClick={() => go("billing")}
                title="Subscription"
              >
                <Ic name="i-shield" />{" "}
                {subStatusLabel(subscription.status)}
              </button>
            )}
            <button
              className="tool ic-btn"
              onClick={toggleNotifs}
              aria-label="Notifications"
              aria-pressed={view === "notif"}
            >
              <Ic name="i-bell" />
              {/* A dot when we could not count, a number when we could.
                  Counting off the list undercounts past its 50-row cap,
                  and a failed count used to remove the badge entirely --
                  which reads as "nothing new". */}
              {notifsCountError ? (
                <span
                  className="badge-n unknown"
                  title="We couldn't check for new notifications — this is not a zero."
                  aria-label="Unread count unavailable"
                />
              ) : unreadCount > 0 ? (
                <span className="badge-n">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </button>
            <div className="usermenu" ref={menuRef}>
              <button
                className="tool ava-btn"
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title="Account"
              >
                <span className="avatar">
            <PsmAvatar
              seed={profile?.id ?? name}
              name={name}
              email={profile?.email}
              role="advertiser"
              size={34}
            />
          </span>
                <Ic name="i-chev" />
              </button>
              {menuOpen && (
                <div className="umenu" role="menu">
                  <div className="umenu-hd">
                    {/* The avatar comes with you into the menu. Without it
                        the panel opens from a tile and then shows nothing
                        that connects it to the tile it came from. */}
                    <span className="umenu-av">
                      {/* THE SAME PICTURE AS EVERYWHERE ELSE.
                          This tile still drew initials while the
                          sidebar and the toolbar a few pixels away
                          drew the generated avatar — so one person
                          had three different faces on one screen,
                          which is the exact thing a deterministic
                          avatar exists to prevent. */}
                      <PsmAvatar
                        seed={profile?.id ?? name}
                        name={name}
                        email={profile?.email}
                        role="advertiser"
                        size={34}
                      />
                    </span>
                    <span className="umenu-who">
                      <span className="nm">{name}</span>
                      <span className="sub">
                        {(profile?.tenant?.name as string) ?? "Advertiser"}
                      </span>
                    </span>
                  </div>
                  <button
                    className="umenu-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      go("settings");
                    }}
                  >
                    <Ic name="i-user" /> Profile
                  </button>
                  <button
                    className="umenu-item danger"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setSignOutOpen(true);
                    }}
                  >
                    <LogoutGlyph /> Sign out
                  </button>
                </div>
              )}
            </div>
            {/* Redundant on a phone: the avatar menu right next to it already
                carries Sign out, and two ways to do the same thing in a
                five-control bar is what made it feel cluttered. Kept on
                desktop, where there is room. */}
            <button
              className="tool ic-btn so-btn"
              onClick={() => setSignOutOpen(true)}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogoutGlyph />
            </button>
          </div>
        </div>

        <div className="content">
          {/* DASHBOARD */}
          <div className={`view${view === "dash" ? " on" : ""}`}>
            {/* ── ONE SKELETON, NOT A CASCADE ──────────────────────────
                The dashboard used to paint itself immediately with every
                query still in flight: an empty hero, then the wallet
                figures, then the stat tiles, then the onboarding card
                appearing and pushing everything down, then swapping to a
                different card when the last read landed. Four reflows in
                about a second, which reads as the page fighting itself.
                And `.view.on` carries a fade animation, so each of those
                steps animated in.

                The fix is not a spinner — a spinner is a blank screen with
                a reason. It is to hold the SHAPE of the finished page,
                once, until the three reads the whole view derives from
                have settled, and then draw the real thing. Nothing moves
                afterwards because nothing arrives afterwards.

                isPending/isLoading only, never isError: a failed read must
                fall through to the real view, which says so per card. A
                skeleton that waits for an answer that is never coming is
                the worst of both. */}
            {booting ? (
              <DashSkeleton />
            ) : (
            <>
            <OnboardingChecklist
              /* WAIT FOR THE ANSWERS, not just for localStorage. The ticks
                 come from three separate queries — company, wallet,
                 accounts — that land at different moments, so the card drew
                 itself with nothing ticked and then ticked them one by one,
                 and when the last one landed it swapped to a different card
                 entirely. That is the flicker: a checklist appearing to
                 undo itself while you read it. */
              hasToppedUp={(toppedUpCount ?? 0) > 0}
              loading={companyLoading || walletLoading || accountsLoading}
              /* AND WAIT FOR A FAILED READ TOO. `loading` goes false when a
                 query FAILS, and then company is null and both balances are
                 0 — indistinguishable from a brand-new account. So a
                 customer holding EUR 10,000 with six live accounts was
                 shown "Get started — 4 steps left" at 0%, told to fund
                 their wallet, on the same dashboard whose other cards
                 already said the reads had failed. */
              /* ...and toppedUpCount's own failure. hasToppedUp collapses
                 to 0 on a failed read, and the first top-up leaves the
                 wallet the moment the plan is charged -- so a customer who
                 has transferred EUR 40,000 gets "Top up your wallet",
                 which is the exact thing that query was added to prevent. */
              unavailable={
                walletError || accountsError || companyError || toppedUpError
              }
              advertiserId={advertiserId}
              company={company ?? null}
              eurBalance={eurBal}
              usdBalance={usdBal}
              accountsCount={(accounts ?? []).length}
              onNavigate={(v) => {
                // The company step points at /complete-profile, which is a
                // ROUTE rather than one of this app's views — it is the only
                // form that writes both companies and billings, and the
                // billing row is half of what the gate checks.
                if (v === "complete-profile") {
                  router.push("/complete-profile");
                  return;
                }
                go(v as View);
              }}
            />
            {!companyComplete && !companyUnknown && (
              /* The app no longer blocks the door with this form, so it has
                 to say plainly why the buttons are quiet — otherwise "you can
                 look but nothing works" is just a broken app. */
              <div className="duerow msg">
                <span className="ai">
                  <Ic name="i-building" />
                </span>
                {/* .msg: this row carries a sentence, not a figure, and at
                    375px the nowrap the row is otherwise built on cut it
                    to "Add your company details to t…" beside a button
                    reading "Add". */}
                {/* SAY WHICH PART IS MISSING. "Add your company details"
                    to somebody who has just filled in and saved the company
                    card reads as though nothing was saved — and the thing
                    they are actually missing is usually the billing
                    address, which lives on a different form. One clause
                    turns a dead end into an instruction. */}
                <span className="dtx">
                  {companyMissing.length && companyMissing.length <= 2
                    ? `Still needed before you can top up or request an account: ${companyMissing.join(" and ")}`
                    : "Add your company details to top up or request an account"}
                </span>
                {/* /complete-profile, not Settings. Settings holds three
                    fields; the full form is the only place that collects the
                    phone, official email, street address and billing address
                    an invoice needs — and since the layout stopped redirecting
                    there, this is the only way anyone reaches it. */}
                <button
                  className="dlink"
                  onClick={() => router.push("/complete-profile")}
                >
                  Add <Ic name="i-arrow" />
                </button>
              </div>
            )}
            <BalanceHero
              firstName={firstName}
              eurText={eurText}
              usdText={usdText}
              // openTopup/openExchange, not the raw setters: the two
              // dialogs now remember which currency they were last
              // opened for. Press Top up inside the USD card, close it,
              // then press Top up on the hero and the raw setter reopens
              // it as a USD top-up. Exchange is worse — it would convert
              // in the wrong direction, at 0.6% plus spread.
              onTopup={() => openTopup(heroCurrency)}
              onExchange={() => openExchange(heroCurrency)}
              onOpenWallet={() => go("wallet")}
              onOpenAccounts={() => go("accounts")}
              disabled={!wallet || (!companyComplete && !companyUnknown)}
              disabledReason={
                !wallet
                  ? walletError
                    ? "We couldn't read your wallet just now — reload and try again."
                    : "Your wallet is still being set up. Reload in a moment."
                  : !companyComplete && !companyUnknown
                    ? companyMissing.length && companyMissing.length <= 2
                      ? `Still needed first: ${companyMissing.join(" and ")}`
                      : "Add your company details first — including the billing address"
                    : null
              }
              loading={walletLoading}
            />
            {/* Number(), not truthiness. subscriptions.amount is moving from
                a float to numeric, and PostgREST serialises numeric as a
                STRING — so `0` stops being falsy and becomes "0.00", which
                is not. A free plan would then start showing "Monthly fee €0"
                with a Pay button beside it on the customer's own dashboard.
                Same at the two sites below. */}
            {/* ── ONLY WHEN IT ASKS SOMETHING OF THEM ──────────────────
                This rendered for every paying customer, every day of the
                month, whether or not anything was owed. A notice that
                wants nothing is noise — and the tile directly below
                already says "Prime · Active · renews 18 Oct", which is
                the same fact without a rail, an icon and a button around
                it.
                So: something outstanding, or the payment is inside the
                last week. Otherwise the dashboard is quiet, which is what
                a dashboard should be when nothing is wrong. */}
            {subscription &&
              Number(subscription.amount ?? 0) > 0 &&
              subscription.next_payment_date &&
              (dueSubInvoice || dueWithinAWeek) && (
              /* One quiet row, not a filled banner with a solid blue button
                 in it. Nothing here is wrong yet — the fee is simply due —
                 and a notice that shouts competes with the balances directly
                 above it, which is what people actually came to see. */
              /* ── AND IT MUST NOT LOOK LIKE A WARNING EITHER ───────
                 Amber rail, amber clock: that is the styling for "this
                 needs you". With nothing outstanding the row is simply
                 telling them what is coming, and dressing that as an
                 alert is the visual half of the same fib the words were
                 telling. A plain comment, not a JSX one: this sits
                 INSIDE the && parens, where a second child is a syntax
                 error. */
              <div className={`duerow${dueSubInvoice ? "" : " calm"}`}>
                <span className="ai">
                  <Ic name="i-clock" />
                </span>
                {/* The € was hard-coded, directly above a button that debits
                    the plan's own currency — so a USD plan read "Monthly fee
                    €500" and then took $500. Subscriptions default to EUR
                    (the billing RPCs coalesce to it), so that is the
                    fallback, but a USD plan says so. */}
                {/* A date, not "in a month". It is shorter, so the row holds
                    one line at phone width, and it is the more useful of the
                    two for something you have to pay. */}
                {/* THE INVOICE FIGURE, NOT THE PLAN'S. The perks engine
                    invoices a discounted amount while subscriptions.amount
                    stays at list price, so a discounted customer read
                    "Monthly fee €200 · due 5 Oct" here with "€5
                    outstanding" in the tile a few centimetres above, and
                    the button between them charges €5. The billing card
                    and the tile were both fixed for exactly this; this row
                    was missed. One number, from the thing being paid. */}
                {/* "Outstanding", not "Due now". "Due now EUR 5.00 · due
                    25 Sep" says two things that contradict each other: it
                    is not due now, it is open until the 25th. And
                    "outstanding" is the word the tile directly above uses
                    for the same figure, so the two agree instead of
                    describing one amount two ways. */}
                {/* ── AND A PAY BUTTON MEANS SOMETHING IS OWED ──────────
                    This row rendered whenever a paid plan existed, so with
                    nothing outstanding it read "Monthly fee €5.00 · due
                    18 Oct" with Pay beside it — while the Billing screen
                    one tap away said "Nothing owed right now. This month
                    is paid." The customer is offered a button to pay a
                    bill they have already settled, and the two screens
                    contradict each other about their own money.

                    Nothing owed is worth SAYING — what is coming and when
                    is the useful half — so the row stays and loses the
                    button. "Next payment" is a statement; "Monthly fee …
                    due" next to Pay is a demand. */}
                <span className="dtx">
                  {dueSubInvoice
                    ? unpaidSubCount > 1
                      ? `Outstanding (${unpaidSubCount} invoices)`
                      : "Outstanding"
                    : "Next payment"}{" "}
                  <b>
                    {/* The TOTAL when more than one is open. This showed
                        the newest invoice's figure as the whole amount
                        owed, so two open months read as one. */}
                    {dueSubInvoice
                      ? unpaidSubCount > 1
                        ? unpaidSubText
                        : dueBillAmount
                      : chargedUnknown
                        ? "—"
                        : lastChargedAmount != null
                          ? chargedMoney(lastChargedAmount)
                          : planMoney(subscription.amount)}
                  </b>
                  {/* ── ONLY WHEN THE DATE MATTERS ────────────────────
                      This row is a single line by design, so "Next
                      payment €5.00 · on 18 Oct" was being cut to "on 18
                      …" — a date truncated mid-number, which is worse
                      than no date at all. And a renewal a month out is
                      not what a one-line notice is for. So: the date
                      appears inside the last week, or whenever something
                      is actually outstanding, and stays off the rest of
                      the time. */}
                  {dueBillDate && (dueSubInvoice || dueWithinAWeek)
                    ? ` · ${dueSubInvoice ? "due" : "on"} ${dayjs(dueBillDate).format("D MMM")}`
                    : ""}
                </span>
                {/* "Pay", not "Pay now". The row must hold one line at phone
                    width and the sentence beside it is the part carrying the
                    information; next to an amber button on a fee notice,
                    "Pay" is not ambiguous. */}
                <button
                  className="dlink"
                  onClick={() => go("billing")}
                  title={
                    dueSubInvoice
                      ? "Pay this invoice from your wallet"
                      : "See your plan and invoices"
                  }
                >
                  {dueSubInvoice ? "Pay" : "View"} <Ic name="i-arrow" />
                </button>
              </div>
            )}
            <div className="stats stats-2">
              {/* "Active ad accounts" wrapped to two lines while "Plan" sat on
                  one, so the two values no longer shared a baseline — the
                  count sat visibly lower than the word beside it. Both tiles
                  now have a one-line label, a value and a sub-line, which is
                  what actually keeps them aligned. */}
              <div className="stat" onClick={() => go("accounts")}>
                <div className="k">
                  <span className="ci b">
                    <Ic name="i-ad" />
                  </span>{" "}
                  Ad accounts
                </div>
                {/* "0 / None yet" is what a failed read looks like, and
                    the card sixty lines down already says out loud "We
                    couldn't load your ad accounts just now — this is not an
                    empty list." Both were on the dashboard at once, and
                    this one is the larger, higher-contrast of the two. */}
                <div className="v">
                  {accountsError ? "—" : (accounts ?? []).length}
                </div>
                <div className="sub">
                  {accountsError
                    ? "Couldn't load"
                    : accountsLoading
                      ? "Checking…"
                      : (accounts ?? []).length === 0
                        ? "None yet"
                        : `${activeAccts.length} active`}
                </div>
              </div>
              <div className="stat" onClick={() => go("billing")}>
                <div className="k">
                  <span className="ci g">
                    <Ic name="i-shield" />
                  </span>{" "}
                  Plan
                </div>
                {/* "Active" on its own contradicted the "Pay now" sitting
                    right beside it, and for a customer who has paid nothing
                    yet it claims more than is true. The status column says
                    active from the moment the subscription is created; what
                    someone wants to know is whether they owe anything. So
                    an unpaid subscription invoice is what this reports. */}
                <div
                  className="v"
                  style={{
                    // "No Plan" read like a product called Plan.
                    textTransform: noPlan ? "none" : "capitalize",
                    color: dueSubInvoice ? "var(--warn)" : undefined,
                  }}
                >
                  {/* THE NAME, when we have one. "Active" is a state,
                      and a state is what the sub-line is for; the thing
                      the customer recognises as the product they bought
                      is its name. Unpaid still wins over both — that is
                      the one case where the state IS the headline. */}
                  {/* ...and the same third state here, where there was
                      none at all: `dueSubInvoice` falsy printed the plan
                      name and a calm colour over an unpaid invoice that
                      had simply not arrived yet. */}
                  {dueUnknown
                    ? "…"
                    : dueSubInvoice
                      ? "Unpaid"
                      : noPlan
                        ? "No plan"
                        : (shownPlanName ?? subscription?.status ?? "—")}
                </div>
                <div className="sub">
                  {/* THE INVOICE'S FIGURE, NOT THE PLAN'S. These are not
                      the same number: the perks engine invoices a
                      DISCOUNTED amount while subscriptions.amount stays at
                      list price, so a customer holding a subscription
                      discount read "€200 outstanding" on their dashboard
                      while the invoice — and the Pay button in the card
                      below — was €5. Same after a plan change or an
                      adjustment, and the currency could differ too. The
                      billing card was fixed for exactly this; the tile was
                      missed. */}
                  {dueUnknown
                    ? "checking…"
                    : dueSubInvoice
                      ? `${dueBillAmount} outstanding`
                      : subscription?.next_payment_date
                        ? `${
                            shownPlanName && subscription?.status
                              ? subStatusLabel(subscription.status) + " · "
                              : ""
                          }renews ${dayjs(subscription.next_payment_date).format("D MMM")}`
                        : noPlan
                          ? "Not started yet"
                          : "No subscription"}
                </div>
              </div>
            </div>
            <div className="card">
              <div className="phead" style={{ alignItems: "center" }}>
                <h2>
                  <Ic name="i-ad" /> Your ad accounts
                </h2>
                <button className="btn ghost sm" onClick={() => go("accounts")}>
                  View all <Ic name="i-arrow" />
                </button>
              </div>
              <div style={{ marginTop: 14 }}>
                {(accounts ?? []).length ? (
                  <div className="grid3">
                    {(accounts ?? []).slice(0, 3).map((a) => (
                      <AccountCard key={a.id} a={a} />
                    ))}
                  </div>
                ) : accountsError ? (
                  <p className="cap" style={{ margin: 0 }}>
                    We couldn&apos;t load your ad accounts just now — this is
                    not an empty list. Reload to try again.
                  </p>
                ) : (
                  <p className="cap" style={{ margin: 0 }}>
                    {/* This invited an action the app refuses. It never
                        consulted canRequestAccount, so a customer who
                        cannot request one -- no company, or an invoice
                        not yet raised -- was told to ask whenever they
                        were ready, and found the button dead one tab
                        away. The Accounts tab's own empty state already
                        gets this right; the dashboard did not. */}
                    {requestBlockedReason()
                      ? `No ad accounts yet. ${requestBlockedReason()}.`
                      : "No ad accounts yet. Ask for your first one whenever you're ready."}
                  </p>
                )}
              </div>
            </div>
            {/* "Your wallets" used to repeat both balances and both actions
                here, a screen below the two stat tiles that already showed
                them. The hero at the top of this view is that section now. */}
            </>
            )}
          </div>

          {/* AFFILIATE PROGRAM (advertiser-as-affiliate) */}
          <div className={`view${view === "referrals" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Affiliate program</h1>
                <p>Earn from the people you bring in.</p>
              </div>
            </div>
            {/* ── NOT JOINED YET: AN INVITATION ───────────────────────
                This screen opened with "Your referral link isn't set up
                yet — ask an admin to enable the affiliate program for
                your account", over Referred 0, Active 0, Commission
                €0.00, Spend driven €0.00. To somebody who has never
                joined, that is a broken version of a thing they do not
                have, and it points them at a control that does not
                exist: no screen in the app has an enable switch.

                So the whole screen is the offer until they are in. The
                figures come back the moment there is something to put in
                them. */}
            {affiliateLoading && !affiliateError ? (
              // Still asking where they stand. A quiet placeholder -- not the
              // affiliate screen, which flashed for a second before "Application
              // received" replaced it (the owner saw it on PH).
              <div className="card xload" aria-busy="true" aria-label="Loading">
                <span className="sk w40" />
                <span className="sk w90" />
                <span className="sk w70" />
                <span className="sk btn" />
              </div>
            ) : !isAffiliate && !affiliateUnknown && (applicationOpen || applicationRefused) ? (
              // Applied, or refused: an answer, not the offer again with
              // its button greyed out (the owner: "erg lelijk").
              <AffiliateApplicationCard
                state={applicationOpen ? "applied" : "refused"}
                appliedAt={affiliateAppliedAt}
                reason={affiliateRefusal}
                applying={applying}
                onApplyAgain={applyAffiliate}
              />
            ) : !isAffiliate && !affiliateUnknown ? (
              <div className="joinhero">
                {/* The inner panel that turns the spinning conic gradient
                    behind it into a 2px chasing border instead of a wash. */}
                <div className="jh-mask" aria-hidden="true" />
                {/* Money, tumbling. Decoration only — aria-hidden, and it
                    stops dead under prefers-reduced-motion. */}
                <div className="moneyfx" aria-hidden="true">
                  <span>€</span>
                  <span>$</span>
                  <span>€</span>
                  <span>$</span>
                  <span>€</span>
                  <span>$</span>
                  <span>€</span>
                </div>
                <span className="jh-ic">
                  <Ic name="i-gift" />
                </span>
                <h2>Get paid for the people you bring in</h2>
                {/* ── DO NOT NAME THE THING THEY EARN ON ───────────
                    This said "a percentage of every wallet top-up".
                    Commission is not one shape: some arrangements pay on
                    what the advertiser spends, some a monthly amount,
                    some a one-off when they start. Naming top-ups
                    promises the one arrangement this affiliate may not
                    be on, and it is the sentence they will quote back.
                    The rate is agreed per affiliate, so the page says
                    that instead of picking one for them. */}
                <p>
                  Share one link. Anyone who signs up through it is yours and
                  stays yours — and you earn from what they do with us, for
                  as long as they keep going.
                </p>
                <ul className="jh-list">
                  <li>
                    <Ic name="i-check" /> One link, yours for good
                  </li>
                  <li>
                    <Ic name="i-check" /> You keep earning, not just on their
                    first month
                  </li>
                  <li>
                    <Ic name="i-check" /> Your rate agreed with us before you
                    start
                  </li>
                </ul>
                <button
                  className="btn grad"
                  disabled={applying}
                  onClick={applyAffiliate}
                >
                  <Ic name="i-gift" /> {applying ? "Sending…" : "Join the affiliate program"}
                </button>
                {/* The bullet three lines up already says "Your rate
                    agreed with us before you start". Saying it again
                    directly under the button was the same sentence
                    twice, two lines apart. Before applying, the note
                    answers the other question — what happens next; after
                    applying it carries the state. */}
                <span className="jh-note">
                  Takes a minute. Nothing changes on your account.
                </span>
              </div>
            ) : (
              <>
            {/* ── THE CABINET FIRST ──────────────────────────────────
                The owner, 22-09: "first the casino card and the stats,
                then the link -- that can be much more subtle". What
                somebody opens this tab for is what they have earned; the
                link is a tool. Same rule as the affiliate portal's hero:
                a figure we could not read is a dash and a sentence,
                never a zero. */}
            <section className="xhero">
              <div className="xh-ribbon" aria-hidden="true" />
              <div className="xh-glow" aria-hidden="true" />
              <div className="xh-coins" aria-hidden="true">
                <span>€</span>
                <span>$</span>
                <span>€</span>
                <span>$</span>
                <span>€</span>
                <span>$</span>
                <span>€</span>
                <span>$</span>
              </div>
              <div className="xh-in">
                <p className="xh-eyebrow">
                  <Ic name="i-gift" /> Your total earnings
                </p>
                {affUnavailable ? (
                  <>
                    <h2 className="xh-amt">
                      <span className="cur">€</span>—
                    </h2>
                    <p className="xh-sub">
                      {aff.isError
                        ? "We couldn't load your earnings just now — this is not a zero. Reload to try again."
                        : "Counting your earnings…"}
                    </p>
                  </>
                ) : (
                  <>
                    {(() => {
                      // Both legs, to the cent. The one with money in it
                      // leads; a dollar-only affiliate is not shown €0.
                      const e = Number(aff.totals.earnings_eur) || 0;
                      const u = Number(aff.totals.earnings_usd) || 0;
                      const usdLeads = u > 0 && e === 0;
                      const lead = usdLeads ? usd(u) : eur(e);
                      // Euros and dollars are never added: a second
                      // currency is its own line, lit the same way.
                      return (
                        <>
                          <h2 className="xh-amt">
                            <span className="cur">{lead.charAt(0)}</span>
                            {lead.slice(1)}
                          </h2>
                          {!usdLeads && u > 0 ? (
                            <p className="xh-amt xh-amt2">
                              <span className="cur">$</span>
                              {usd(u).slice(1)}
                            </p>
                          ) : null}
                        </>
                      );
                    })()}
                    <div className="xh-tiles">
                      <button
                        type="button"
                        className="xh-t"
                        onClick={() =>
                          document
                            .getElementById("aff-refs")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" })
                        }
                      >
                        <span className="v">{aff.rows.length}</span>
                        <span className="l">Referred</span>
                      </button>
                      <button
                        type="button"
                        className="xh-t win"
                        onClick={() =>
                          document
                            .getElementById("aff-refs")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" })
                        }
                      >
                        <span className="v">{affActive}</span>
                        <span className="l">Active</span>
                      </button>
                      {affWaiting ? (
                        <button
                          type="button"
                          className="xh-t gold"
                          onClick={() =>
                            document
                              .getElementById("aff-refs")
                              ?.scrollIntoView({ behavior: "smooth", block: "start" })
                          }
                        >
                          <span className="v">{affWaiting}</span>
                          <span className="l">Waiting</span>
                        </button>
                      ) : null}
                    </div>
                    <span className="xh-pill">
                      <Ic name="i-trend" />{" "}
                      {affMonthUnavailable
                        ? "this month — not loaded"
                        : `+${twoLeg(affMonth.totals.earnings_eur, affMonth.totals.earnings_usd)} this month`}
                    </span>
                  </>
                )}
              </div>
            </section>

            {/* ── THE PERIOD ─────────────────────────────────────────
                Every figure from here down covers the same days: the
                four stats, each referral's row, the commission list and
                its totals. The card above stays all time. */}
            <RangePicker
              value={affRange}
              onChange={(next) => setAffRange(next)}
              busy={affRanged.isFetching && !affRanged.isLoading}
            />

            {/* Four figures, each one the sum of the list below it. Dimmed
                while the new period is on its way, so last period's
                figures are never read as this one's. */}
            <div className={`stats xstats${affRanged.isPlaceholderData ? " busy" : ""}`}>
              <div className="stat g-blue">
                <div className="k">
                  <span className="ci b">
                    <Ic name="i-trend" />
                  </span>{" "}
                  Earned
                </div>
                <div className="v win">
                  {affRangedUnavailable
                    ? "—"
                    : legs(affRanged.totals.earnings_eur, affRanged.totals.earnings_usd)}
                </div>
              </div>
              <div className="stat g-gold">
                <div className="k">
                  <span className="ci g">
                    <Ic name="i-wallet" />
                  </span>{" "}
                  To be paid
                </div>
                <div className="v gold">
                  {affRangedUnavailable
                    ? "—"
                    : legs(affRanged.payable.eur, affRanged.payable.usd)}
                </div>
              </div>
              <div className="stat g-win">
                <div className="k">
                  <span className="ci t">
                    <Ic name="i-check" />
                  </span>{" "}
                  Paid out
                </div>
                <div className="v">
                  {affRangedUnavailable || affRanged.payable.isLifetime
                    ? "—"
                    : legs(
                        Math.max(
                          0,
                          Math.round(
                            ((Number(affRanged.totals.earnings_eur) || 0) -
                              (Number(affRanged.totals.unpaid_eur) || 0)) *
                              100,
                          ) / 100,
                        ),
                        Math.max(
                          0,
                          Math.round(
                            ((Number(affRanged.totals.earnings_usd) || 0) -
                              (Number(affRanged.totals.unpaid_usd) || 0)) *
                              100,
                          ) / 100,
                        ),
                      )}
                </div>
              </div>
              <div className="stat g-purple">
                <div className="k">
                  <span className="ci p">
                    <Ic name="i-chart" />
                  </span>{" "}
                  Spend driven
                </div>
                <div className="v">
                  {affRangedUnavailable
                    ? "—"
                    : legs(affRanged.totals.spend_eur, affRanged.totals.spend_usd)}
                </div>
              </div>
            </div>

            {/* The link, quiet: a tool, not the headline. */}
            <div className="card xshare">
              <div className="xs-top">
                <span className="ci b">
                  <Ic name="i-gift" />
                </span>
                <div style={{ minWidth: 0 }}>
                  <h2>Your referral link</h2>
                  <p className="cap">
                    Anyone who signs up through it is yours, and stays yours.
                  </p>
                </div>
              </div>
              {referralLink ? (
                <>
                  <div className="xs-link mono" title={referralLink}>
                    {referralLink}
                  </div>
                  <div className="xs-acts">
                    <button className="btn sm" onClick={copyReferral}>
                      <Ic name="i-copy" /> Copy link
                    </button>
                    <a
                      className="btn ghost sm wa"
                      href={`https://wa.me/?text=${encodeURIComponent(
                        `Advertise with Prime Scale Media — sign up through my link: ${referralLink}`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <WhatsappIcon /> WhatsApp
                    </a>
                  </div>
                </>
              ) : affiliateLoading && !affiliateError ? (
                /* Still asking. This used to print the FAILURE sentence
                   while the read was in flight, so the first thing the
                   Referrals screen said was that it could not check. */
                <p className="cap" style={{ margin: "10px 0 0" }}>
                  Checking your referral link…
                </p>
              ) : affiliateUnknown ? (
                /* "Ask an admin to enable the affiliate program" is a
                   statement about this account's STATUS, and we do not know
                   it — the read failed. Telling an approved affiliate to go
                   and ask for something they already have sends them to
                   support about an account that works. */
                <p className="cap" style={{ margin: "10px 0 0" }}>
                  We couldn&apos;t check your referral link just now. This
                  does not mean you don&apos;t have one — reload and it should
                  appear.
                </p>
              ) : (
                <p className="cap" style={{ margin: "10px 0 0" }}>
                  Your referral link isn&apos;t set up yet — ask an admin to
                  enable the affiliate program for your account, or apply via
                  Settings.
                </p>
              )}
            </div>

            {/* ── ONE LINE PER REFERRAL ─────────────────────────────── */}
            <div className="card xlist" id="aff-refs">
              <div className="xl-head">
                <h2>
                  <Ic name="i-user" /> Your referrals
                </h2>
                {!affRangedUnavailable ? (
                  <span className="xl-count">{affRanged.rows.length}</span>
                ) : null}
              </div>
              {affRanged.rows.length ? (
                affRanged.rows.map((r) => {
                  const waiting = String(r.link_status ?? "active") === "pending";
                  const topups = Number(r.topup_count) || 0;
                  return (
                    <button
                      type="button"
                      className="xrow"
                      key={r.referred_advertiser_id}
                      onClick={() => {
                        // Every commission behind this row, one tap away.
                        setRefFocus(r.referred_advertiser_code || null);
                        document
                          .getElementById("aff-commissions")
                          ?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      title="Show every commission from this referral"
                    >
                      <span className="av">{refInitials(r.referred_advertiser_name)}</span>
                      <span className="mid">
                        <span className="nm">
                          <span className="t">{r.referred_advertiser_name || "Advertiser"}</span>
                          {waiting ? (
                            <span
                              className="badge pend xs"
                              title="We check every new referral. What they do in the meantime counts once it is approved."
                            >
                              Waiting for approval
                            </span>
                          ) : null}
                        </span>
                        <span className="sm">
                          {[
                            r.referred_advertiser_code,
                            `${topups} top-up${topups === 1 ? "" : "s"}`,
                            `${twoLeg(r.spend_eur, r.spend_usd)} spend`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="rt">
                        <span className="amt">{legs(r.earnings_eur, r.earnings_usd)}</span>
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="xl-empty">
                  {affRanged.isError
                    ? "We couldn't read your referrals just now — this is not a zero. Reload to try again."
                    : affRanged.isLoading
                      ? "Loading your referrals…"
                      : "No referrals yet — share your link and they appear here."}
                </p>
              )}
            </div>
            <div id="aff-commissions">
              <AffiliateCommissionsCard
                enabled={!!advertiserId}
                focusCode={refFocus}
                onClearFocus={() => setRefFocus(null)}
                from={affPeriod.from}
                to={affPeriod.to}
                periodLabel={rangeCaption(affRange)}
              />
            </div>
              </>
            )}
          </div>

          {/* WALLET */}
          <div className={`view${view === "wallet" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Wallet</h1>
                <p>Your money, ready when you are.</p>
              </div>
              {/* The page-level "Top up wallet" is gone: each card already
                  carries its own Top up, so this screen offered the same
                  action three times and the one at the top could not even say
                  which wallet it meant. */}
            </div>
            <div className="grid2">
              <WalletCard
                cur="eur"
                label="EUR wallet"
                value={eurText}
                pending={pendingByCurrency.EUR}
                pendingUnknown={pendingUnknown}
                pendingChecking={pendingChecking}
                onTopup={() => openTopup("EUR")}
                onExchange={() => openExchange("EUR")}
                disabled={!wallet || (!companyComplete && !companyUnknown)}
                /* `!wallet` is true for a tenant with genuinely no wallet
                   row AND for a read that failed, and the second one left
                   both buttons dead with nothing said — beside balances
                   already rendering "—", so the screen admitted it could
                   not read this and then disabled the way to fix it. The
                   two stay merged (a missing wallet really is a reason to
                   disable) and the reason is now spoken. */
                disabledReason={
                  walletError
                    ? "We couldn't read your wallet just now — reload and try again"
                    : // A THIRD STATE. `!wallet` is also true while the
                      // read is in flight, so opening ?view=wallet said
                      // "No wallet on this account yet" -- twice, once per
                      // card -- to a customer who has one, before flipping
                      // to their balance.
                      walletLoading
                      ? "Just a moment — loading your wallet"
                      : !wallet
                        ? "No wallet on this account yet"
                        : undefined
                }
              />
              <WalletCard
                cur="usd"
                label="USD wallet"
                value={usdText}
                pending={pendingByCurrency.USD}
                pendingUnknown={pendingUnknown}
                pendingChecking={pendingChecking}
                onTopup={() => openTopup("USD")}
                onExchange={() => openExchange("USD")}
                disabled={!wallet || (!companyComplete && !companyUnknown)}
                /* `!wallet` is true for a tenant with genuinely no wallet
                   row AND for a read that failed, and the second one left
                   both buttons dead with nothing said — beside balances
                   already rendering "—", so the screen admitted it could
                   not read this and then disabled the way to fix it. The
                   two stay merged (a missing wallet really is a reason to
                   disable) and the reason is now spoken. */
                disabledReason={
                  walletError
                    ? "We couldn't read your wallet just now — reload and try again"
                    : // A THIRD STATE. `!wallet` is also true while the
                      // read is in flight, so opening ?view=wallet said
                      // "No wallet on this account yet" -- twice, once per
                      // card -- to a customer who has one, before flipping
                      // to their balance.
                      walletLoading
                      ? "Just a moment — loading your wallet"
                      : !wallet
                        ? "No wallet on this account yet"
                        : undefined
                }
              />
            </div>
            {/* THE SAME GATE THE DASHBOARD HAS, and the same sentence.
                It was applied on the dashboard's hero and nowhere else,
                so a customer with no company details could tap the
                balance, land here, open the dialog, and be handed an IBAN
                and a reference. They make a real bank transfer, and
                wallet_topup_advertiser_create takes amount, currency and
                slip only — there is no server-side gate — so the money
                arrives for somebody no invoice can be raised for. A
                disabled button on one screen is not a rule. */}
            {/* ...and not while the company read is still in flight.
                `companyComplete` is false before the answer arrives, so
                this told a customer whose details are complete to go and
                add them, every time they opened the Wallet view. */}
            {!companyComplete && !companyUnknown && !companyLoading && (
              <div className="duerow msg" style={{ marginTop: 12 }}>
                <span className="ai">
                  <Ic name="i-building" />
                </span>
                {/* SAY WHICH PART IS MISSING. "Add your company details"
                    to somebody who has just filled in and saved the company
                    card reads as though nothing was saved — and the thing
                    they are actually missing is usually the billing
                    address, which lives on a different form. One clause
                    turns a dead end into an instruction. */}
                <span className="dtx">
                  {companyMissing.length && companyMissing.length <= 2
                    ? `Still needed before you can top up or request an account: ${companyMissing.join(" and ")}`
                    : "Add your company details to top up or request an account"}
                </span>
                <a className="dlink" href="/complete-profile">
                  Add <Ic name="i-arrow" />
                </a>
              </div>
            )}
            {pendingTopups.length > 0 && (
              <div className="card">
                <h2>
                  Pending wallet top-up{pendingTopups.length > 1 ? "s" : ""}
                </h2>
                {/* This was one flex row: amount, then "Ref … · awaiting
                    verification" as a single sentence, then a badge pushed
                    to the right with margin-left:auto. On a phone the
                    sentence wrapped mid-phrase — "awaiting" on one line and
                    "verification" on the next — while the badge squeezed
                    the text it was sitting next to. It read as broken
                    layout rather than as a payment in progress.

                    Now it is what it actually is: a card for something that
                    is HAPPENING. One fact per line, the state on its own
                    line, and a bar that keeps moving while we are looking
                    at it. See .ptup in adv-shell-css.ts. */}
                {pendingTopups.map((t) => (
                  <div className="ptup" key={t.id}>
                    <span className="ico">
                      <Ic name="i-clock" />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      {/* Just the amount. The card's own heading already
                          says "Pending wallet top-up"; repeating it on the
                          line under it said the same thing twice. */}
                      <div className="l1">
                        {currencySymbol(t.currency)}
                        {money2(t.amount)}
                      </div>
                      <div className="l2">
                        {/* THE SAME STRING THE DIALOG TOLD THEM TO USE.
                            Step 2 of the top-up shows
                            formatPaymentReference(clientCode, referenceNo)
                            — "000005-6164655424" — and every admin screen
                            shows the composed form too. This printed the
                            bare number, so the customer copied one string,
                            wired the money, came back to check, and read a
                            different one for the payment they had just
                            made. */}
                        Bank transfer · Ref{" "}
                        {formatPaymentReference(referralCode, t.reference_no) ||
                          (t.reference_no ?? "—")}
                      </div>
                      <div className="l3">
                        <span className="badge pend">Verifying</span>
                        <span className="l3t">
                          {/* Nothing watches. The Wise adapter answers
                              "not implemented yet" for every live call
                              and the deposit feed is off on production,
                              so the only crediting path is an admin
                              checking the bank by hand. "As soon as we
                              see it land" makes a customer wait instead
                              of chasing. */}
                          We check the bank and credit it by hand, usually
                          the same working day.
                        </span>
                      </div>
                    </div>
                    <div className="bar">
                      <i />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="card" style={{ padding: "16px 8px 8px" }}>
              <div style={{ padding: "0 14px 8px" }}>
                <h2>
                  <Ic name="i-wallet" /> Wallet activity
                </h2>
              </div>
              <div className="tblwrap">
                <table className="tbl wide">
                  <thead>
                    <tr>
                      <th style={{ paddingLeft: 14 }}>Date</th>
                      <th>Reference</th>
                      <th>Description</th>
                      <th className="r">Amount</th>
                      <th className="r">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {walletEvents.length ? (
                      walletEvents.map((ev) => {
                        if (ev.kind === "invoice") {
                          const inv = ev.row;
                          const sym =
                            String(inv.currency ?? "EUR").toUpperCase() === "USD"
                              ? "$"
                              : "€";
                          return (
                            <tr key={`i-${inv.id}`}>
                              <td
                                data-label="Date"
                                style={{ fontWeight: 600, whiteSpace: "nowrap" }}
                              >
                                {dayjs(ev.at).format("D MMM")}
                              </td>
                              <td data-label="Reference" className="mono">
                                {formatPaymentReference(referralCode, inv.number)}
                              </td>
                              <td
                                data-label="Description"
                                style={{ color: "var(--txt-2)" }}
                              >
                                {invoiceTypeLabel(inv.type)}
                              </td>
                              {/* A minus, and the danger colour. Everything
                                  else in this list is money arriving; the
                                  one direction that is not has to look
                                  different at a glance, not read the same
                                  and start with a character. */}
                              <td
                                data-label="Amount"
                                className="r mono"
                                style={{ color: "var(--danger)" }}
                              >
                                −{sym}
                                {money2(inv.total)}
                              </td>
                              <td data-label="Status" className="r">
                                <span className="badge muted">Paid</span>
                              </td>
                            </tr>
                          );
                        }
                        if (ev.kind === "funding") {
                          const t = ev.row;
                          // amount_received is in the currency the
                          // customer's wallet was debited in; every
                          // other figure on this row is USD by
                          // construction. Printing the wallet-side one
                          // is the only honest choice on a WALLET
                          // statement.
                          // Not a two-way map: a GBP or HKD payment
                          // would print a euro sign, which is the fault
                          // fixed one screen away in psm-verify-ad-topups
                          // and reintroduced here an hour later. An
                          // unknown code prints as a code.
                          const code = String(t.currency ?? "EUR").toUpperCase();
                          const sym =
                            code === "USD"
                              ? "$"
                              : code === "EUR"
                                ? "€"
                                : code === "GBP"
                                  ? "£"
                                  : `${code} `;
                          return (
                            <tr key={`f-${t.id}`}>
                              <td
                                data-label="Date"
                                style={{ fontWeight: 600, whiteSpace: "nowrap" }}
                              >
                                {dayjs(ev.at).format("D MMM")}
                              </td>
                              <td data-label="Reference" className="mono">
                                {t.number
                                  ? `#${String(t.number).padStart(6, "0")}`
                                  : "—"}
                              </td>
                              <td
                                data-label="Description"
                                style={{ color: "var(--txt-2)" }}
                              >
                                Funded {t.account_name || "an ad account"}
                              </td>
                              <td
                                data-label="Amount"
                                className="r mono"
                                style={{ color: "var(--danger)" }}
                              >
                                −{sym}
                                {money2(t.amount_received)}
                              </td>
                              <td data-label="Status" className="r">
                                {/* The money has left the wallet in every
                                    one of these states. What differs is
                                    where it IS: on the account, on its
                                    way, or refused and owed back. */}
                                <span
                                  className={`badge ${
                                    String(t.status ?? "").toLowerCase() ===
                                    "completed"
                                      ? "muted"
                                      : ["rejected", "failed"].includes(
                                            String(t.status ?? "").toLowerCase(),
                                          )
                                        ? "due"
                                        : "pend"
                                  }`}
                                >
                                  {String(t.status ?? "").toLowerCase() ===
                                  "completed"
                                    ? "On the account"
                                    : /* FAILED IS NOT ON ITS WAY. The
                                         badge special-cased completed and
                                         rejected and let everything else
                                         fall through, so a `failed`
                                         funding -- a real status, handled
                                         as failure everywhere else --
                                         told the customer their money was
                                         en route to an account it will
                                         never reach. */
                                      ["rejected", "failed"].includes(
                                          String(t.status ?? "").toLowerCase(),
                                        )
                                      ? "Refused"
                                      : "On its way"}
                                </span>
                              </td>
                            </tr>
                          );
                        }
                        if (ev.kind === "reqfee") {
                          const q = ev.row;
                          const refund = ev.refund === true;
                          const amt = Number(
                            refund ? q.refunded_amount : q.charged_amount,
                          );
                          const sym = currencySymbol(q.charged_currency);
                          return (
                            <tr key={ev.id}>
                              <td
                                data-label="Date"
                                style={{ fontWeight: 600, whiteSpace: "nowrap" }}
                              >
                                {dayjs(ev.at).format("D MMM")}
                              </td>
                              <td data-label="Reference" className="mono">
                                —
                              </td>
                              <td data-label="What">
                                {refund
                                  ? "Ad-account request refunded"
                                  : "Ad-account request fee"}
                              </td>
                              <td data-label="Amount" className="r">
                                {refund ? "+" : "−"}
                                {sym}
                                {Math.abs(amt).toFixed(2)}
                              </td>
                              <td data-label="Status" className="r">
                                <span
                                  className={`badge ${refund ? "ok" : "muted"}`}
                                >
                                  {refund ? "Returned" : "Charged"}
                                </span>
                              </td>
                            </tr>
                          );
                        }
                        if (ev.kind === "return") {
                          const w = ev.row;
                          const sym =
                            String(w.currency ?? "USD").toUpperCase() === "EUR"
                              ? "€"
                              : "$";
                          return (
                            <tr key={`w-${w.id}`}>
                              <td
                                data-label="Date"
                                style={{ fontWeight: 600, whiteSpace: "nowrap" }}
                              >
                                {dayjs(ev.at).format("D MMM")}
                              </td>
                              <td data-label="Reference" className="mono">
                                —
                              </td>
                              <td
                                data-label="Description"
                                style={{ color: "var(--txt-2)" }}
                              >
                                {String(w.status ?? "").toLowerCase() ===
                                "pending"
                                  ? "Return requested from an ad account"
                                  : "Returned from an ad account"}
                              </td>
                              <td
                                data-label="Amount"
                                className="r mono"
                                style={{ fontWeight: 700 }}
                              >
                                {/* A pending return has not been credited,
                                    so it shows the amount asked for, in
                                    lighter type, and never lands in a
                                    running total. */}
                                {String(w.status ?? "").toLowerCase() ===
                                "pending" ? (
                                  <span style={{ color: "var(--faint)" }}>
                                    {sym}
                                    {money2(w.amount)}
                                  </span>
                                ) : (
                                  <>
                                    {sym}
                                    {money2(w.amount)}
                                  </>
                                )}
                              </td>
                              <td data-label="Status" className="r">
                                {String(w.status ?? "").toLowerCase() ===
                                "pending" ? (
                                  <span className="badge pend">
                                    Requested
                                  </span>
                                ) : (
                                  <span className="badge ok">Credited</span>
                                )}
                              </td>
                            </tr>
                          );
                        }
                        if (ev.kind === "exchange") {
                          const x = ev.row;
                          const sym = (c: string) => (c === "USD" ? "$" : "€");
                          return (
                            <tr key={`x-${x.id}`}>
                              <td
                                data-label="Date"
                                style={{ fontWeight: 600, whiteSpace: "nowrap" }}
                              >
                                {dayjs(x.created_at).format("D MMM")}
                              </td>
                              <td data-label="Reference" className="mono">
                                —
                              </td>
                              <td
                                data-label="Description"
                                style={{ color: "var(--txt-2)" }}
                              >
                                Exchanged {sym(x.from_currency)}
                                {money2(x.from_amount)} to{" "}
                                {x.to_currency}
                                {/* ── THE RATE, IN THE DIRECTION IT WENT ──
                                    exchange_rate is stored as "1 USD = N
                                    EUR" whichever way the money moved, and
                                    this printed it raw. Walked on
                                    production: "Exchanged EUR 50.00 to USD
                                    at 0.8724" beside "USD 56.98" -- and
                                    50 x 0.8724 is 43.62. Three numbers on
                                    one row, two of them right. Printed
                                    both ways round now, with the fee that
                                    explains the rest of the gap. */}
                                {(() => {
                                  const shown = rateForDirection(
                                    x.from_currency === "USD" ? "USD" : "EUR",
                                    Number(x.exchange_rate),
                                  );
                                  const fee = Number(x.fee_amount);
                                  const hasFee = Number.isFinite(fee) && fee > 0;
                                  if (!shown && !hasFee) return null;
                                  return (
                                    <div
                                      className="cap"
                                      style={{ marginTop: 2 }}
                                    >
                                      {shown
                                        ? `1 ${x.from_currency} = ${shown.toFixed(6)} ${x.to_currency}`
                                        : ""}
                                      {shown && hasFee ? " · " : ""}
                                      {hasFee
                                        ? `fee ${sym(x.to_currency)}${money2(fee)}`
                                        : ""}
                                    </div>
                                  );
                                })()}
                              </td>
                              <td
                                data-label="Amount"
                                className="r mono"
                                style={{ fontWeight: 700 }}
                              >
                                {sym(x.to_currency)}
                                {money2(x.to_amount)}
                              </td>
                              <td data-label="Status" className="r">
                                <span className="badge ok">Exchanged</span>
                              </td>
                            </tr>
                          );
                        }
                        const t = ev.row;
                        return (
                        <tr key={t.id}>
                          <td
                            data-label="Date"
                            style={{ fontWeight: 600, whiteSpace: "nowrap" }}
                          >
                            {dayjs(t.created_at).format("D MMM")}
                          </td>
                          <td data-label="Reference" className="mono">
                            {formatPaymentReference(
                              referralCode,
                              t.reference_no,
                            ) ||
                              (t.reference_no ?? "—")}
                          </td>
                          <td data-label="Description" style={{ color: "var(--txt-2)" }}>
                            {t.description || "Wallet top-up"}
                          </td>
                          <td
                            data-label="Amount"
                            className="r mono"
                            style={{ fontWeight: 700 }}
                          >
                            {currencySymbol(t.currency)}
                            {money2(t.amount)}
                          </td>
                          <td data-label="Status" className="r">
                            {/* `failed` fell through the else and rendered
                                "Pending" — so a top-up that will never be
                                credited sat on the customer's statement
                                looking like one still being checked, and
                                it is also excluded from the pending panel
                                above, so nothing else contradicted it.
                                Every value the column can hold gets its
                                own word now, and an unknown one says so
                                rather than claiming to be in progress. */}
                            <span
                              className={`badge ${
                                t.status === "completed"
                                  ? "ok"
                                  : t.status === "rejected" ||
                                      t.status === "failed"
                                    ? "due"
                                    : t.status === "pending"
                                      ? "pend"
                                      : ""
                              }`}
                            >
                              {t.status === "completed"
                                ? "Credited"
                                : t.status === "rejected"
                                  ? "Rejected"
                                  : t.status === "failed"
                                    ? "Failed"
                                    : t.status === "pending"
                                      ? "Pending"
                                      : (t.status ?? "Unknown")}
                            </span>
                          </td>
                        </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            textAlign: "center",
                            padding: 24,
                            color: "var(--faint)",
                          }}
                        >
                          {/* EVERY read, not two of the five. The
                              invoices read has its own flag and was
                              never consulted, so a failed invoices
                              query turned a statement with debits into
                              one with only credits — or into "Nothing
                              has moved yet" — with no notice. The two
                              reads added here would have had the same
                              hole on day one. */}
                          {activityError ||
                          exchangesError ||
                          invError ||
                          fundingsError ||
                          returnsError ||
                          // The sixth source. The banner listed five and
                          // could not name this one, because it had no
                          // flag -- so a EUR 50 request charge could be
                          // missing from the statement with nothing
                          // saying anything was missing.
                          requestChargesError
                            ? "We couldn't load all of your wallet activity — this isn't an empty list. Give it a reload."
                            : activityLoading
                              ? "Looking up your wallet activity…"
                              : "Nothing has moved yet. Top-ups, exchanges, ad-account funding and anything paid from your wallet show up here."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {activityTruncated ? (
                  <p
                    className="cap"
                    style={{
                      margin: 0,
                      padding: "10px 14px",
                      color: "var(--faint)",
                    }}
                  >
                    Showing your most recent activity. Older entries are not
                    listed here — the financial report has the full period.
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {/* AD ACCOUNTS */}
          <div className={`view${view === "accounts" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Ad accounts</h1>
                <p>Where your budget does its work.</p>
              </div>
              {/* "Request ad account" under a heading that already says
                  Ad accounts is the page title twice. The shorter label
                  is the one that fits beside the heading instead of
                  dropping to its own line. */}
              {/* ── ONE CALL TO ACTION, NOT TWO ──────────────────────
                  With no accounts, the empty state directly below already
                  carries a Request button, centred, with the sentence
                  explaining it. A second one floating at the right edge of
                  the header, a few pixels above the card, is the same
                  offer twice and the worse-placed of the two. So the
                  header button appears only once there is a list to sit
                  above. */}
              {/* ── THE ACTIONS, TOGETHER, TOP RIGHT ──────────────────
                  "Tax rates by country" was a raw blue underline inside
                  the subtitle, which made the left block two lines tall
                  -- and .phead wraps, so Request one dropped onto its own
                  row and floated under the heading instead of beside it.
                  Both are actions; both belong in the action slot. */}
              <div className="phead-actions">
                <button className="btn ghost" onClick={() => setTaxOpen(true)}>
                  <Ic name="i-help" /> Tax rates
                </button>
                {(accounts ?? []).length > 0 &&
                  (canRequestAccount ? (
                    <RequestAdAccountDialog>
                      <button className="btn grad">
                        <Ic name="i-plus" /> Request one
                      </button>
                    </RequestAdAccountDialog>
                  ) : (
                    <>
                      <button className="btn grad" disabled>
                        <Ic name="i-plus" /> Request one
                      </button>
                      {/* A title does not fire on a disabled control, so
                          the reason it is dead has to be said out loud --
                          this file makes that point about the Requests
                          tab and the Accounts header was missed. */}
                      {requestBlockedReason() ? (
                        <span className="phead-why">
                          {requestBlockedReason()}
                        </span>
                      ) : null}
                    </>
                  ))}
              </div>
            </div>
            {(accounts ?? []).length ? (
              <div className="grid3">
                {(accounts ?? []).map((a) => (
                  <AccountCard key={a.id} a={a} />
                ))}
              </div>
            ) : (
              <div className="card empty">
                <span className="empty-ic">
                  <Ic name="i-ad" />
                </span>
                <h3>
                  {accountsError
                    ? "Couldn't load your ad accounts"
                    : // BEFORE ANY OF THE OTHER ANSWERS. An empty list is
                      // what this component holds while the read is in
                      // flight AND when there is genuinely nothing, and
                      // requestBlockedReason() reads a company and a plan
                      // that have not arrived either -- so opening
                      // ?view=accounts told a customer with a live ad
                      // account, a paid PRIME plan and complete company
                      // details to "Add your company details first" and
                      // that "paying for [your plan] is the first step".
                      accountsLoading || companyLoading
                      ? "Loading your ad accounts…"
                      : canRequestAccount
                        ? "No ad accounts yet"
                        : (requestBlockedReason() ?? "Nothing here yet")}
                </h3>
                <p>
                  {accountsError
                    ? "This isn't an empty list — the request didn't come back. Give it a reload."
                    : accountsLoading || companyLoading
                      ? "One moment."
                    : !canRequestAccount && invError
                      ? "Your invoices didn't load, so we can't tell whether the plan is paid. Reload to try again."
                    : canRequestAccount
                    ? "We set it up on our verified Business Manager. Your plan covers the first few; extras are billed as you go."
                    : pendingTopups.length > 0
                      ? "Your transfer is with us and being verified. Once your plan is paid you can request one."
                      : "Ad accounts come with your plan, so paying for it is the first step."}
                </p>
                {accountsError ? (
                  /* Neither "request one" nor "go to billing" is the right
                     next step when the list simply failed to load. */
                  <button
                    className="btn"
                    onClick={() => window.location.reload()}
                  >
                    <Ic name="i-refresh" /> Reload
                  </button>
                ) : canRequestAccount ? (
                  <RequestAdAccountDialog>
                    <button className="btn">
                      <Ic name="i-plus" /> Request ad account
                    </button>
                  </RequestAdAccountDialog>
                ) : (
                  <button className="btn" onClick={() => go("billing")}>
                    <Ic name="i-shield" /> Go to billing
                  </button>
                )}
              </div>
            )}
          </div>

          {/* FINANCIAL REPORT */}
          <div className={`view${view === "report" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Financial report</h1>
                <p>
                  Every top-up, funding, fee, invoice and return in one
                  place — filter it, total it, export it.
                </p>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <FinanceReport audience="advertiser" />
            </div>
          </div>

          {/* REQUESTS */}
          <div className={`view${view === "requests" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Requests</h1>
                <p>Everything you&apos;ve asked us for.</p>
              </div>
              {/* THE SAME GATE AS THE ACCOUNTS TAB. This button opened the
                  identical dialog with no check, so a customer with no
                  company details and an unpaid plan could fill the whole
                  form and submit — and the RPC has no company or plan
                  check either, only a balance one. It charged 50 EUR and
                  created a request for somebody the Accounts screen
                  refuses and who cannot be invoiced. */}
              {canRequestAccount ? (
                <RequestAdAccountDialog>
                  <button className="btn grad">
                    <Ic name="i-plus" /> New request
                  </button>
                </RequestAdAccountDialog>
              ) : (
                <button
                  className="btn grad"
                  disabled
                  title={requestBlockedReason() ?? undefined}
                >
                  <Ic name="i-plus" /> New request
                </button>
              )}
            </div>
            {/* ── A title IS INVISIBLE ON A PHONE ──────────────────────
                and this is a phone app -- there is a bottom bar below.
                A title does not fire on a DISABLED control even with a
                mouse, so the reason this button is dead was reachable
                by nobody. The empty state underneath talks about
                requests that do not exist yet, which does not explain
                it either.
                The same fault was fixed twice already in this file, on
                the Accounts empty state and on the notification
                toggles, both with the same note. The Requests tab was
                missed. */}
            {!canRequestAccount && requestBlockedReason() ? (
              <p
                className="cap"
                style={{ margin: "0 0 12px", color: "var(--faint)" }}
              >
                {requestBlockedReason()}.
              </p>
            ) : null}
            {myRequests.length ? (
              <div className="card" style={{ padding: 0 }}>
                <div className="tblwrap">
                  <table className="tbl wide">
                    <thead>
                      <tr>
                        <th style={{ paddingLeft: 14 }}>Date</th>
                        <th>Platform</th>
                        <th className="r">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myRequests.map((r) => {
                        const st = (r.status ?? "pending").toLowerCase();
                        // GREEN MEANS DONE. This read "rejected or
                        // declined -> red, pending or in_review ->
                        // amber, ANYTHING ELSE -> green", and the real
                        // statuses are pending, payment_pending,
                        // in_progress, completed, rejected and
                        // cancelled. So a request blocked on money, one
                        // still being built and one that was cancelled
                        // all rendered as completed. in_review is not a
                        // status anywhere; that branch was dead.
                        const cls =
                          st === "completed"
                            ? "ok"
                            : st === "rejected" || st === "cancelled"
                              ? "due"
                              : "pend";
                        return (
                          <tr key={r.id}>
                            <td
                              data-label="Date"
                              style={{ fontWeight: 600, whiteSpace: "nowrap" }}
                            >
                              {dayjs(r.created_at).format("D MMM YYYY")}
                            </td>
                            <td data-label="Platform">
                              {platformLabel(r.platform) || "—"}
                              {r.rejection_reason ? (
                                <span
                                  style={{
                                    display: "block",
                                    color: "var(--faint)",
                                    fontSize: ".78rem",
                                  }}
                                >
                                  {r.rejection_reason}
                                </span>
                              ) : null}
                            </td>
                            <td data-label="Status" className="r">
                              <span
                                className={`badge ${cls}`}
                                style={{ textTransform: "capitalize" }}
                              >
                                {st.replace(/_/g, " ")}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="card">
                <p className="cap" style={{ margin: 0 }}>
                  {isRequestsLoading
                    ? "Loading your requests…"
                    : isRequestsError
                      ? "We couldn't load your requests just now — this is not an empty list. Reload before you file another one, so you don't end up paying for two."
                      : "Nothing here yet. When you ask for an ad account, we set it up on our verified Business Manager and it shows up here."}
                </p>
              </div>
            )}
          </div>

          {/* BILLING */}
          <div className={`view${view === "billing" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Billing</h1>
                <p>Your plan, and what&apos;s coming up.</p>
              </div>
            </div>
            <div className="grid2">
              <div className="sub-card">
                <div className="ring" />
                {/* Top-right, out of the reading order. The status is a
                    label ON the card, not the first thing to read on it —
                    the plan name and the price are. It sat above both,
                    pushing the name down and making a pill the headline. */}
                {/* ── THE NAME AND THE STATE, ON ONE LINE ─────────────
                    The pill was absolutely positioned in the top-right
                    corner and the plan name started below it, so "PRIME"
                    and "Active" sat on two lines with a gap between them
                    that belonged to neither. They are one statement —
                    which plan, and whether it is running — so they go on
                    one row, and the phone-width hack that pushed the name
                    down to clear the pill is no longer needed. */}
                <div className="sub-head">
                {shownPlanName && (
                  <div className="plan-name">{shownPlanName}</div>
                )}
                <span className="pill pill-tr">
                  <Ic name="i-shield" />{" "}
                  {/* A failed read is not "no plan". Telling a paying
                      customer they have no subscription because a query
                      dropped is the worst kind of wrong: it is their own
                      screen, so there is nowhere else for them to check. */}
                  {subscription?.status
                    ? subStatusLabel(subscription.status)
                    : subError
                      ? "Couldn't load"
                      : // ── AND "STILL ARRIVING" IS NOT "NO PLAN" EITHER ──
                        // Every branch on this screen separates an ERROR
                        // from an empty answer, and none of them separated
                        // either from "has not answered yet". So for the
                        // width of one round trip a paying customer's own
                        // Billing screen read: No plan. Subscription --.
                        // "There is no plan on your account yet, so nothing
                        // is being charged." "Ad accounts come with a plan,
                        // so you will need one before you can request an
                        // account." "No invoices yet."
                        //
                        // Every sentence of that is false for a customer on
                        // PRIME at EUR 5.00 a month with four invoices and a
                        // live ad account -- which is what the screen then
                        // flips to. Caught by opening it on production.
                        advReadsWillRun && !subLoaded
                        ? "Loading…"
                        : "No plan"}
                </span>
                </div>
                {/* THE NAME FIRST — it moved up into .sub-head above.
                    A customer knows what they bought by its NAME, and the
                    price is what it costs, not what it is. */}
                <div className="plan">
                  {subscription && Number(subscription.amount ?? 0) > 0
                    ? // THE INVOICE'S FIGURE WHERE THERE IS ONE. The
                      // billing run applies a subscription_discount perk
                      // to the invoice and leaves subscriptions.amount at
                      // list price, so a discounted customer read EUR 200
                      // a month on the card that describes what they pay
                      // while EUR 5 was taken. The outstanding branch was
                      // fixed for exactly this; the three branches with
                      // no unpaid invoice were not.
                      (chargedUnknown
                        ? "Subscription"
                        : lastChargedAmount != null
                          ? `${chargedMoneyNeat(lastChargedAmount)} / month`
                          : `${planMoneyNeat(subscription.amount)} / month`)
                    : noPlan
                      ? "No plan yet"
                      : "Subscription"}
                </div>
                <div className="meta">
                  {/* ── "RENEWS" A DATE THAT HAS ALREADY PASSED ──────
                      next_payment_date only moves forward when the invoice
                      for the period is PAID, so between the invoice being
                      raised and settled — up to the full seven days of
                      grace — this printed "Renews 20 Sep 2026" on the
                      21st. A date in the past, presented as something
                      still to come, on the card that tells the customer
                      what they are paying for.
                      The renewal HAS happened; the invoice below is what
                      it produced. Say that instead. */}
                  {subscription?.next_payment_date
                    ? dayjs(subscription.next_payment_date).isAfter(
                        dayjs().startOf("day"),
                      )
                      ? `Renews ${dayjs(subscription.next_payment_date).format("D MMM YYYY")}`
                      : dueSubInvoice
                        ? `Renewed ${dayjs(subscription.next_payment_date).format("D MMM YYYY")} · invoice below`
                        : `Due for renewal since ${dayjs(subscription.next_payment_date).format("D MMM YYYY")}`
                    : "—"}
                </div>
                <div
                  /* Small print, and it should look like it: one calm
                     line under the price rather than a four-line block
                     of body copy on the card that carries the most
                     expensive figure on the screen. */
                  style={{
                    opacity: 0.66,
                    fontSize: ".74rem",
                    lineHeight: 1.5,
                    marginTop: 14,
                    maxWidth: "36ch",
                  }}
                >
                  {/* No "ask an admin to do it by hand". Every plan change
                      settles against the invoice it affects, so pointing a
                      customer at a manual override invites exactly the
                      off-ledger change this product is built to avoid. */}
                  {/* They do not. An increase raises a pro-rata
                      subscription_adjustment invoice immediately, due in
                      seven days, which the daily auto-debit then takes
                      from the wallet; an unpaid current invoice is voided
                      and reissued at the new amount for the SAME period.
                      Telling somebody the money moves next month, on the
                      screen where they ask for the change, is the one
                      sentence that decides whether they keep enough in
                      the wallet. */}
                  {/* ── NOT PRO-RATA. IT SAYS SO BECAUSE IT IS TRUE ──
                      change_subscription_amount raises the DIFFERENCE
                      between the old and the new monthly figure, with
                      no day count anywhere in it — so a change on the
                      28th charges a whole month's difference for two
                      days. Telling a customer it is pro-rata on the one
                      screen where they decide is the sentence that
                      makes them keep the wrong amount in the wallet. */}
                  {noPlan
                    ? "Ad accounts come with a plan. Ask us which one fits and we'll start it for you."
                    : "Switch anytime — you pay the difference straight away, never a part-month. Ask us for the figure first."}
                </div>
              </div>
              <div className="card">
                <h2>
                  <Ic name="i-clock" /> This month
                </h2>
                {/* Two different situations, two different sentences. The
                    first one was printed whether or not anything was owed,
                    so a customer who had just paid was still being told how
                    to pay. */}
                <p className="cap">
                  {invError || dueInvError
                    ? "We couldn't read your invoices just now, so we'd rather not tell you this month is settled."
                    : advReadsWillRun && !dueInvLoaded
                      ? "Looking up this month…"
                    : awaitingFirstInvoice
                      ? "We raise your first invoice overnight. Nothing has been charged yet, and nothing is owed until it appears."
                    : invLoading
                      ? "Looking up this month…"
                      : dueSubInvoice
                        ? // ── DO NOT PROMISE A DATE THAT IS NOT THERE ──
                          // This printed "we'll take it from your wallet
                          // on the due date" directly above a row that
                          // read "Due date not set" — one sentence telling
                          // the customer not to worry, sitting on top of
                          // the field saying nobody knows when.
                          unpaidSubCount > 1
                          ? `You have ${unpaidSubCount} invoices open, together ${unpaidSubText}. The oldest is below — pay that one first.`
                          : dueBillDate
                            ? "Pay it from your wallet whenever suits you — or leave it, and we'll take it from your wallet on the due date."
                            : "Pay it from your wallet whenever suits you. This one carries no due date, so nothing will be taken automatically — if that looks wrong, tell us."
                        : /* ── AND NOT A PROMISE WE DO NOT KEEP ──────
                             "We'll raise the next one automatically" is
                             true of somebody on a plan and false of
                             somebody without one — and it printed for
                             both, directly above a block explaining that
                             no plan is running. Two sentences, same
                             card, opposite claims. */
                          subscription && Number(subscription.amount ?? 0) > 0
                          ? "Nothing owed right now. We'll raise the next one automatically."
                          : "Nothing owed right now."}
                </p>
                {subscription &&
                Number(subscription.amount ?? 0) > 0 &&
                subscription.next_payment_date ? (
                  <>
                    <div className="list-row" style={{ borderTop: 0 }}>
                      <span
                        className="ico"
                        style={
                          dueSubInvoice
                            ? {
                                background: "var(--warn-soft)",
                                color: "var(--warn)",
                              }
                            : {
                                background: "var(--win-soft)",
                                color: "#0e8f66",
                              }
                        }
                      >
                        <Ic name={dueSubInvoice ? "i-receipt" : "i-check"} />
                      </span>
                      {/* The DUE DATE OF THE INVOICE, not next_payment_date.
                          Those are different facts and the screen was
                          printing the wrong one: next_payment_date is when
                          the NEXT invoice is raised (a month out, and the
                          "Renews …" line above already says it), while the
                          money is wanted by the unpaid invoice's own due
                          date — seven days after it was issued. So a
                          customer read "Due 16 Oct" while auto-debit and
                          dunning were working to 23 Sep, three weeks
                          earlier. The amount comes off the invoice too, for
                          the same reason: an adjustment can make it differ
                          from the plan's monthly figure. */}
                      <div>
                        <div style={{ fontWeight: 700 }}>
                          {/* A failed or in-flight read is not "paid".
                              Every branch here keyed off dueSubInvoice,
                              which is falsy for paid, errored AND loading
                              alike — so on a dropped invoices read the
                              customer got a green tick, "This month is
                              paid" and "Nothing owed right now", directly
                              above a button saying the invoices could not
                              be loaded. */}
                          {dueUnknown
                            ? "Checking your billing…"
                            : awaitingFirstInvoice
                              ? "Your first invoice is on its way"
                            : dueSubInvoice
                              ? // An adjustment is not the monthly fee:
                                // it is the difference raised when a
                                // plan changed mid-month, and calling it
                                // "Monthly fee" would have the customer
                                // looking for a second charge.
                                String(dueSubInvoice.type ?? "") ===
                                "subscription_adjustment"
                                ? "Plan change"
                                : "Monthly fee"
                              : "This month is paid"}
                        </div>
                        <div
                          style={{ color: "var(--faint)", fontSize: ".82rem" }}
                        >
                          {dueSubInvoice
                            ? `${
                                dueBillDate
                                  ? `Due ${dayjs(dueBillDate).format("D MMM YYYY")}`
                                  : "Due date not set"
                              } · ${dueBillAmount}`
                            : awaitingFirstInvoice
                              ? `${planMoney2(subscription.amount)} · we raise it overnight`
                            : subscription.next_payment_date
                              ? `Next on ${dayjs(subscription.next_payment_date).format("D MMM YYYY")}${
                                  chargedUnknown
                                    ? ""
                                    : ` · ${
                                        lastChargedAmount != null
                                          ? chargedMoney(lastChargedAmount)
                                          : planMoney2(subscription.amount)
                                      }`
                                }`
                              : "We'll tell you when the next one is ready"}
                        </div>
                      </div>
                      {/* "18 hours ago" in a red badge, on an invoice that
                          has been PAID, is the screen telling somebody they
                          are late for something they have already done.
                          A relative time belongs on something still open;
                          on a settled one the only useful word is Paid. */}
                      {dueUnknown ? null : dueSubInvoice ? (
                        dueBillDate ? (
                          <span
                            className="badge due"
                            style={{ marginLeft: "auto" }}
                          >
                            {dayjs(dueBillDate).fromNow()}
                          </span>
                        ) : null
                      ) : awaitingFirstInvoice ? (
                        // Not "Paid". Nothing has been raised yet, so
                        // there is nothing to have paid.
                        <span
                          className="badge muted"
                          style={{ marginLeft: "auto" }}
                        >
                          Not yet raised
                        </span>
                      ) : (
                        <span className="badge ok" style={{ marginLeft: "auto" }}>
                          Paid
                        </span>
                      )}
                    </div>
                    {/* NO BUTTON WHEN THERE IS NOTHING TO PRESS.
                        A full-width gradient slab reading "No subscription
                        invoice due" is the loudest thing on the card, and
                        it says nothing — it is a disabled control shouting
                        about its own absence. The row above already says
                        the month is paid and when the next one lands.
                        The failed-to-load case DOES get a button, because
                        there the customer can do something: reload. */}
                    {dueSubInvoice ? (
                      <button
                        className="btn block grad"
                        style={{ marginTop: 14 }}
                        onClick={() => {
                          // Not enough in the wallet: send them to the one
                          // screen that can change that, rather than into a
                          // confirmation that ends in a refusal.
                          if (!canPayInvoice(dueSubInvoice)) {
                            // The other wallet can cover it: offer the
                            // exchange rather than a transfer they do
                            // not need to make.
                            if (canExchangeToPay(dueSubInvoice)) {
                              const n = exchangeNeedFor(dueSubInvoice);
                              openExchange(
                                invCurrency(dueSubInvoice) === "USD"
                                  ? "EUR"
                                  : "USD",
                                n
                                  ? {
                                      amount: n.amount,
                                      currency: n.currency,
                                      label: n.label,
                                    }
                                  : null,
                              );
                              return;
                            }
                            go("wallet");
                            return;
                          }
                          askToPay(dueSubInvoice);
                        }}
                      >
                        {/* A WALLET, not a tick. A tick means "done", and
                            this button has not done anything yet — it takes
                            money out of a wallet, which is what the icon
                            should say. */}
                        <Ic
                          name={
                            canPayInvoice(dueSubInvoice)
                              ? "i-wallet"
                              : canExchangeToPay(dueSubInvoice)
                                ? "i-refresh"
                                : "i-plus"
                          }
                        />{" "}
                        {canPayInvoice(dueSubInvoice)
                          ? `Pay ${dueSubSymbol}${money2(dueSubInvoice.total)} from wallet`
                          : canExchangeToPay(dueSubInvoice)
                            ? `Exchange to pay ${dueSubSymbol}${money2(dueSubInvoice.total)}`
                            : `Top up to pay ${dueSubSymbol}${money2(dueSubInvoice.total)}`}
                      </button>
                    ) : invError ? (
                      <button
                        className="btn block ghost"
                        style={{ marginTop: 14 }}
                        onClick={() => window.location.reload()}
                      >
                        <Ic name="i-refresh" /> Couldn&apos;t load your invoices
                        — reload
                      </button>
                    ) : null}
                    {/* ── ONE CONTROL MUST NOT TAKE THE OTHER AWAY ─────
                        The primary button is Pay, or Exchange, or Top up —
                        one of three, chosen for them. So a customer offered
                        the exchange no longer had a way to top up, and one
                        offered a top-up was never told the money was
                        already sitting in the other wallet. Whichever of
                        the two is not the primary goes here, quietly. */}
                    {dueSubInvoice && !canPayInvoice(dueSubInvoice) ? (
                      canExchangeToPay(dueSubInvoice) ? (
                        <button
                          className="linkish"
                          style={{
                            display: "block",
                            margin: "10px auto 0",
                            fontSize: ".82rem",
                          }}
                          onClick={() => go("wallet")}
                        >
                          Or top up your {invCurrency(dueSubInvoice)} wallet
                          instead
                        </button>
                      ) : (eurBal > 0 || usdBal > 0) ? (
                        <button
                          className="linkish"
                          style={{
                            display: "block",
                            margin: "10px auto 0",
                            fontSize: ".82rem",
                          }}
                          onClick={() => {
                            const n = exchangeNeedFor(dueSubInvoice);
                            openExchange(
                              invCurrency(dueSubInvoice) === "USD" ? "EUR" : "USD",
                              n
                                ? { amount: n.amount, currency: n.currency, label: n.label }
                                : null,
                            );
                          }}
                        >
                          Or exchange from your{" "}
                          {invCurrency(dueSubInvoice) === "USD" ? "EUR" : "USD"}{" "}
                          wallet
                        </button>
                      ) : null
                    ) : null}
                  </>
                ) : subError ? (
                  /* `subscription` is undefined when the subscriptions read
                     FAILS, and this else-branch then stated "Nothing to pay
                     right now" — and took the Pay button away with it. The
                     invoices come from a SEPARATE query, so an unpaid one
                     can be sitting right there. The paragraph directly above
                     was already fixed for invError and says "Pay it from your
                     wallet whenever suits you"; underneath it, this said the
                     opposite. The customer is told they owe nothing on the
                     one screen that could tell them otherwise, the invoice
                     goes past due, gets dunned, and is auto-debited anyway. */
                  <p className="cap" style={{ margin: 0 }}>
                    We couldn&apos;t read your plan just now, so we can&apos;t
                    show what&apos;s due.{" "}
                    <button
                      className="linkish"
                      onClick={() => window.location.reload()}
                    >
                      Reload
                    </button>
                  </p>
                ) : advReadsWillRun && !subLoaded ? (
                  /* Still arriving. Saying nothing is the only honest
                     thing there is to say yet -- see the pill above. */
                  <p className="cap" style={{ margin: 0 }}>
                    Looking up your plan…
                  </p>
                ) : (
                  /* ── NO PLAN IS A DEAD END, NOT A CLEAN SLATE ───────
                     Three screens used to close a loop here. The Accounts
                     empty state says "your plan has to be active first —
                     ad accounts come with your plan, so paying for it is
                     the first step" and sends you to Billing. Billing
                     said "Nothing to pay right now." and offered nothing
                     at all: no button, no explanation, no way to ask.
                     An advertiser invited without a plan, or one whose
                     subscription was cancelled, arrives here and stops.

                     Only a person can actually resolve it -- a plan is
                     priced by the owner -- so the honest answer is to
                     say why there is nothing to pay and give them the
                     way to ask. */
                  <>
                    {/* ── A PAUSED PLAN IS NOT NO PLAN ──────────────
                        `subscription` is null for anything outside
                        active/past_due — paused, cancelled, inactive —
                        and this branch then told the customer "there is no
                        plan on your account yet, so nothing is being
                        charged" while an unpaid invoice sat in the table
                        below it with a live Pay button. Two statements
                        about their money, on one screen, contradicting
                        each other.

                        What is TRUE for all of those states is that
                        nothing NEW is being charged. What is owed is a
                        separate fact, and it gets its own line and its own
                        button. */}
                    {dueSubInvoice ? (
                      <>
                        <p className="cap" style={{ margin: 0 }}>
                          No plan is running on your account right now, so
                          nothing new is being charged — but{" "}
                          {unpaidSubCount > 1
                            ? `${unpaidSubCount} invoices are still open, together ${unpaidSubText}.`
                            : `an invoice of ${dueSubSymbol}${money2(dueSubInvoice.total)} is still open.`}
                        </p>
                        <button
                          className="btn block grad"
                          style={{ marginTop: 14 }}
                          onClick={() => {
                            if (!canPayInvoice(dueSubInvoice)) {
                              if (canExchangeToPay(dueSubInvoice)) {
                                const n = exchangeNeedFor(dueSubInvoice);
                                openExchange(
                                  invCurrency(dueSubInvoice) === "USD" ? "EUR" : "USD",
                                  n
                                    ? { amount: n.amount, currency: n.currency, label: n.label }
                                    : null,
                                );
                                return;
                              }
                              go("wallet");
                              return;
                            }
                            askToPay(dueSubInvoice);
                          }}
                        >
                          <Ic
                            name={
                              canPayInvoice(dueSubInvoice)
                                ? "i-wallet"
                                : canExchangeToPay(dueSubInvoice)
                                  ? "i-refresh"
                                  : "i-plus"
                            }
                          />{" "}
                          {canPayInvoice(dueSubInvoice)
                            ? `Pay ${dueSubSymbol}${money2(dueSubInvoice.total)} from wallet`
                            : canExchangeToPay(dueSubInvoice)
                              ? `Exchange to pay ${dueSubSymbol}${money2(dueSubInvoice.total)}`
                              : `Top up to pay ${dueSubSymbol}${money2(dueSubInvoice.total)}`}
                        </button>
                        <a
                          className="linkish"
                          style={{
                            display: "block",
                            margin: "10px auto 0",
                            fontSize: ".82rem",
                            textAlign: "center",
                          }}
                          href={whatsappUrl(
                            `Hi PSM, I'd like to restart my plan (${referralCode || "my account"}).`,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ask us on WhatsApp about restarting your plan
                        </a>
                      </>
                    ) : (
                      <>
                    {/* ── ONE LINE, NOT THREE ────────────────────────
                        This card carried four paragraphs that said the
                        same thing three times: "nothing owed", then
                        "nothing to pay, no plan is running", then "ad
                        accounts come with a plan, ask us and we will
                        price it with you" — above a button that already
                        says "Ask us to set up a plan". What the customer
                        needs is why they cannot request an account yet.
                        The button says the rest. */}
                    <p className="cap" style={{ margin: 0 }}>
                      You have no plan yet — that is where your included ad
                      accounts come from.
                    </p>
                    <a
                      className="btn block ghost"
                      style={{ marginTop: 14 }}
                      href={whatsappUrl(
                        `Hi PSM, I'd like to set up a plan (${referralCode || "my account"}).`,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <WhatsappIcon /> Ask us on WhatsApp to set up a plan
                    </a>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="card" style={{ padding: "16px 8px 8px" }}>
              <div style={{ padding: "0 14px 8px" }}>
                <h2>
                  <Ic name="i-receipt" /> Invoices
                </h2>
              </div>
              <div className="tblwrap">
                <table className="tbl wide lead-label">
                  <thead>
                    <tr>
                      <th style={{ paddingLeft: 14 }}>Invoice</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th className="r">Amount</th>
                      <th className="r">Status</th>
                      <th className="r"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(invoices ?? []).length ? (
                      (showAllInvoices
                        ? (invoices ?? [])
                        : (invoices ?? []).slice(0, 5)
                      ).map((inv) => {
                        // ── A CANCELLED INVOICE IS NOT AN UNPAID ONE ──
                        //
                        // "Pay now" rendered on anything that was not
                        // `paid`, and `void` is not `paid`. So an admin
                        // waiving a EUR 50 ad-account fee by voiding the
                        // invoice left the customer a live Pay button on
                        // it — and invoice_pay_from_wallet short-circuits
                        // on `paid` only, so pressing it debited the
                        // wallet and stamped a cancelled invoice paid.
                        // The badge beside it correctly read "Cancelled"
                        // the whole time.
                        const invSt = invoiceStatusView(inv.status, {
                          customer: true,
                          // "Past due", not "Due", once the date has
                          // gone by -- the auto-debit works to that
                          // date and the customer should see it coming.
                          dueDate: (inv as { due_date?: string | null })
                            .due_date,
                        });
                        // ── ONE ANSWER, NOT TWO ────────────────────
                        //
                        // `settled` was computed here by hand, beside an
                        // invoiceStatusView that already answers the
                        // same question -- and the two disagreed. The
                        // helper trims and lowercases; this compared
                        // byte-exact strings, so "Void" or "CANCELLED"
                        // was payable, and the two differed on "draft"
                        // as well. invoice_pay_from_wallet short-
                        // circuits on 'paid' alone, so a press on such a
                        // row debits the wallet and stamps a cancelled
                        // invoice paid. The duplicate WAS the hazard.
                        const settled = invSt.settled;
                        const invSym =
                          invCurrency(inv) === "USD" ? "$" : "€";
                        return (
                          <tr key={inv.id}>
                            {/* Client code first, same shape as the bank
                                reference, so an invoice and the payment that
                                settles it carry the same prefix. */}
                            {/* "Reference", not "Invoice". This string is
                                what you quote when you pay it and what you
                                quote when you ask us about it — the card
                                led with it in bold and nothing said what
                                it was, so it read as a serial number. The
                                lead-label modifier on the table turns the
                                card's title label back on for this one
                                list; everywhere else the first cell is a
                                name that speaks for itself. */}
                            <td data-label="Reference" style={{ fontWeight: 600 }}>
                              {/* One tap copies it. This is a string
                                  somebody retypes into a bank form or an
                                  email to us, and retyping a reference by
                                  hand is how it ends up not matching. The
                                  top-up dialog already offers this for its
                                  own reference; the invoice did not. */}
                              <CopyRef
                                value={formatPaymentReference(
                                  referralCode,
                                  inv.number,
                                )}
                              />
                            </td>
                            <td data-label="Date">
                              {dayjs(inv.created_at).format("D MMM YYYY")}
                            </td>
                            {/* WHAT the invoice is for. Without it the page
                                was a list of amounts: a plan fee and a plan
                                change, both "Due", both €-something, and
                                nothing on the row to tell them apart. */}
                            <td data-label="Type">
                              {invoiceTypeLabel(inv.type)}
                            </td>
                            <td data-label="Amount" className="r mono">
                              {invSym}
                              {money2(inv.total)}
                            </td>
                            {/* A voided invoice is NOT due. This said
                                "Due" for every status that was not 'paid',
                                so the €200 we superseded kept asking the
                                customer for €200 after it had been
                                cancelled. */}
                            <td data-label="Status" className="r">
                              <span className={`badge ${invSt.tone}`}>
                                {invSt.label}
                              </span>
                            </td>
                            {/* Download was admin-only. A customer could
                                see an invoice and not take it — and an
                                invoice you cannot hand to your own
                                bookkeeper is not much of an invoice. The
                                PDF route already refuses anybody else's
                                id, so there is nothing to gate here. */}
                            <td data-label="" className="r fullcell">
                              <div className="actrow">
                                {/* Pay now belongs to the MONTHLY invoice
                                    only. An adjustment or a manual invoice
                                    is not something a customer settles from
                                    here, and offering the button on all of
                                    them made a billing screen look like a
                                    list of debts. Download stays on every
                                    row. */}
                                {/* Pay now on the ONE due monthly invoice —
                                    and on a one-off charge, which is a real
                                    bill with no other way to settle it.
                                    Narrowing this to the subscription alone
                                    left an ad-account fee invoice (raised by
                                    the desk, request parked at
                                    payment_pending) showing "Due" with only
                                    a Download button: the customer had
                                    nothing to press and the desk waited for
                                    a payment that could not be made. The
                                    auto-debit cron only takes invoices that
                                    carry a subscription_id, so it never
                                    collects these either.
                                    NOT on a subscription_adjustment: that is
                                    settled with its parent invoice, and
                                    offering it separately is what made the
                                    page read as a list of debts. */}
                                {/* ── EVERY ONE, NOT ONLY THE NEWEST ──
                                    `inv.id === dueSubInvoice?.id` offered
                                    Pay on the newest unpaid subscription
                                    invoice and on nothing else. With two
                                    open — the plan-change case the note
                                    above describes, or two missed months
                                    — the older one rendered "Past due"
                                    with Download and View beside it and
                                    NO way to pay it anywhere in the app.
                                    The nightly run collects every unpaid
                                    subscription invoice past its due
                                    date, so it takes that one too; a
                                    customer who funded the wallet to the
                                    figure this screen showed them is then
                                    short, and dunning marks them past
                                    due. Every unpaid one is payable. */}
                                {!settled &&
                                  (inv.type === "subscription" ||
                                    inv.type === "subscription_adjustment" ||
                                    inv.type === "ad_account_fee" ||
                                    inv.type === "manual_invoice") && (
                                  <button
                                    className="btn ghost sm"
                                    disabled={payingId === inv.id}
                                    title={
                                      canPayInvoice(inv)
                                        ? "Pay this from your wallet"
                                        : canExchangeToPay(inv)
                                          ? `Your ${
                                              invCurrency(inv) === "USD"
                                                ? "EUR"
                                                : "USD"
                                            } wallet has money in it — convert enough to settle this`
                                          : "Your wallet does not cover this yet"
                                    }
                                    onClick={() => {
                                      if (!canPayInvoice(inv)) {
                                        // Same as the primary button:
                                        // the other wallet covers it,
                                        // so offer the exchange rather
                                        // than a transfer they do not
                                        // need to make.
                                        if (canExchangeToPay(inv)) {
                                          const n = exchangeNeedFor(inv);
                                          openExchange(
                                            invCurrency(inv) === "USD"
                                              ? "EUR"
                                              : "USD",
                                            n
                                              ? {
                                                  amount: n.amount,
                                                  currency: n.currency,
                                                  label: "to pay this invoice",
                                                }
                                              : null,
                                          );
                                          return;
                                        }
                                        go("wallet");
                                        return;
                                      }
                                      askToPay(inv);
                                    }}
                                  >
                                    {/* .alab: it is the only thing the
                                        action-row CSS will clip, and this
                                        row has three buttons in it now. */}
                                    <span className="alab">
                                      {payingId === inv.id
                                        ? "Paying…"
                                        : canPayInvoice(inv)
                                          ? "Pay now"
                                          : canExchangeToPay(inv)
                                            ? "Exchange to pay"
                                            : "Top up to pay"}
                                    </span>
                                  </button>
                                )}
                                {/* VIEW as well as download, the same pair
                                    the admin screen has. Reading your own
                                    invoice used to mean saving a PDF first. */}
                                <InvoiceDocButtons
                                  invoiceId={inv.id}
                                  fileLabel={formatPaymentReference(
                                    referralCode,
                                    inv.number,
                                  )}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={6}
                          style={{
                            textAlign: "center",
                            padding: 24,
                            color: "var(--faint)",
                          }}
                        >
                          {invError
                            ? "We couldn't load your invoices — this isn't an empty list. Give it a reload."
                            : invLoading
                              ? "Looking up your invoices…"
                              : "No invoices yet. The first one arrives with your plan."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {(invoices ?? []).length > 5 && (
                  <button
                    className="btn ghost sm invmore"
                    onClick={() => setShowAllInvoices((v) => !v)}
                  >
                    {/* The query is .limit(30), so "View all 80" was never
                        on offer — a customer with eighty invoices was told
                        they had thirty. Say what it actually shows. */}
                    {showAllInvoices
                      ? "Show fewer"
                      : (invoices ?? []).length >= 30
                        ? "View your 30 most recent invoices"
                        : `View all ${(invoices ?? []).length} invoices`}
                    <Ic name="i-chev" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* NOTIFICATIONS */}
          <div className={`view${view === "notif" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Notifications</h1>
              </div>
              {notifs.some((n) => !n.is_read) && (
                <button
                  className="btn ghost sm"
                  onClick={() => markAllAsRead.mutate()}
                >
                  Mark all read
                </button>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {notifs.length ? (
                notifs.map((n) => {
                  const copy = getNotificationCopy(n);
                  return (
                    <div
                      key={n.id}
                      className={`nrow${n.is_read ? "" : " unread"}`}
                      style={{ cursor: n.is_read ? "default" : "pointer" }}
                      onClick={() => !n.is_read && markAsRead.mutate(n.id)}
                    >
                      <span className="nic b">
                        <Ic name="i-bell" />
                      </span>
                      {/* ── THE TIME WAS TAKING A THIRD OF THE ROW ─────
                          `.tm` sat beside the text as its own flex item
                          with margin-left:auto and nowrap, so on a phone
                          "a few seconds ago" reserved about 110px and the
                          message was squeezed into what was left -- a
                          two-line title over a column half the width of
                          the card. Title and time share the top line now;
                          the message gets the whole width underneath. */}
                      <div className="ntxt">
                        <div className="nhead">
                          <div className="t">{copy.title}</div>
                          <span className="tm">
                            {dayjs(n.created_at).fromNow()}
                          </span>
                          {!n.is_read && <span className="undot" />}
                        </div>
                        <div className="d">{copy.description}</div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="nrow">
                  <span className="nic b">
                    <Ic name={notifsError ? "i-refresh" : "i-bell"} />
                  </span>
                  <div>
                    <div className="t">
                      {notifsError
                        ? "We couldn't load your notifications"
                        : "You're all caught up"}
                    </div>
                    <div className="d">
                      {notifsError
                        ? "This is not an empty list — reload to try again."
                        : "Top-up, ad-account and billing updates will appear here."}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SETTINGS */}
          <div className={`view${view === "settings" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Settings</h1>
              </div>
            </div>
            <div className="grid2">
              {/* ── "PROFILE" IN THE AVATAR MENU LANDED HERE ──────────
                  ...and "here" was the COMPANY form. There was no
                  personal profile anywhere in the customer shell, so a
                  name typed wrong at signup stayed wrong for ever -- on
                  the welcome line, in the avatar initials and on every
                  message we send -- and the only way to a new password
                  was "forgot password" on the sign-in screen, for a
                  password nobody had forgotten. */}
              <div className="card">
                <h2>
                  <span
                    style={{
                      display: "inline-flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <Ic name="i-user" /> You
                  </span>
                </h2>
                <p className="cap" style={{ margin: "4px 0 12px" }}>
                  Your name is what we put on anything we send you.
                </p>
                <div className="field">
                  <label>Your name</label>
                  <input
                    placeholder="Your name"
                    value={me.full_name}
                    onChange={(e) =>
                      setMe({ full_name: e.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label>Sign-in email</label>
                  {/* READ-ONLY ON PURPOSE. `email` is in
                      PROFILE_SELF_ALLOWED and the server would happily
                      write it -- but that column is a MIRROR. The login
                      lives in Supabase auth, so an editable box here
                      would say "Saved" and then leave somebody signing
                      in with the old address, with no way to work out
                      why. Changing it is a support job until it is done
                      properly. */}
                  <input value={profile?.email ?? ""} readOnly disabled />
                  <p className="cap" style={{ marginTop: 6 }}>
                    This is how you sign in. Ask us if it needs to change.
                  </p>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginTop: 12,
                  }}
                >
                  <button
                    className="btn sm"
                    onClick={saveMe}
                    disabled={savingMe || !me.full_name.trim()}
                  >
                    {savingMe ? "Saving…" : "Save name"}
                  </button>
                  <a className="btn sm ghost" href="/auth/update-password">
                    Change password
                  </a>
                </div>
              </div>
              <div className="card">
                <h2>
                  <span
                    style={{
                      display: "inline-flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <Ic name="i-building" /> Company
                  </span>
                </h2>
                <p className="cap" style={{ margin: "4px 0 0" }}>
                  This is what your invoices are made from.
                </p>
                <div style={{ marginTop: 16 }}>
                  <div className="field">
                    <label>Company name</label>
                    <input
                      placeholder="Your company B.V."
                      value={comp.name}
                      onChange={(e) =>
                        setComp((c) => ({ ...c, name: e.target.value }))
                      }
                    />
                    </div>
                  <div className="frow">
                    <div className="field">
                      <label>Billing email</label>
                      <input type="email"
                        placeholder="billing@yourcompany.com"
                        value={comp.official_email}
                        onChange={(e) =>
                          setComp((c) => ({ ...c, official_email: e.target.value }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Phone</label>
                      <input
                        placeholder="+31 6 1234 5678"
                        value={comp.phone}
                        onChange={(e) =>
                          setComp((c) => ({ ...c, phone: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>Address</label>
                    <input
                      placeholder="Street and number"
                      value={comp.address}
                      onChange={(e) =>
                        setComp((c) => ({ ...c, address: e.target.value }))
                      }
                    />
                    </div>
                  <div className="frow">
                    <div className="field">
                      <label>Postcode</label>
                      <input
                        placeholder="1012 AB"
                        value={comp.zipcode}
                        onChange={(e) =>
                          setComp((c) => ({ ...c, zipcode: e.target.value }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label>City / region</label>
                      <input
                        placeholder="Amsterdam"
                        value={comp.state}
                        onChange={(e) =>
                          setComp((c) => ({ ...c, state: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>Country</label>
                    <input
                      placeholder="Netherlands"
                      value={comp.country}
                      onChange={(e) =>
                        setComp((c) => ({ ...c, country: e.target.value }))
                      }
                    />
                    </div>
                  <div className="frow">
                    <div className="field">
                      <label>VAT / Tax ID</label>
                      <input className="mono"
                        placeholder="NL0000.00.000.B00"
                        value={comp.vat_no}
                        onChange={(e) =>
                          setComp((c) => ({ ...c, vat_no: e.target.value }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Registration no.</label>
                      <input className="mono"
                        placeholder="Chamber of Commerce"
                        value={comp.registration_no}
                        onChange={(e) =>
                          setComp((c) => ({ ...c, registration_no: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>Website</label>
                    <input
                      placeholder="yourcompany.com"
                      value={comp.website_url}
                      onChange={(e) =>
                        setComp((c) => ({ ...c, website_url: e.target.value }))
                      }
                    />
                    </div>
                  {/* ── DO NOT SAVE A FORM BUILT FROM A FAILED READ ────
                      `comp` starts as ten empty strings and is populated
                      only `if (company)`. So when the company read fails,
                      this form renders BLANK — and the allowlist on the
                      server copies every key that is present, so pressing
                      Save writes ten empty strings over the real row: the
                      name, the VAT number, the registration number and the
                      whole address that goes on every invoice. The chip
                      comes back, Top up and Request grey out, and the
                      invoice header is gone.
                      Refusing while the read is unknown costs one reload. */}
                  <button
                    className="btn sm"
                    onClick={saveCompany}
                    disabled={savingComp || companyLoading || companyError}
                    title={
                      companyError
                        ? "We couldn't read your company details, so saving now would overwrite them with this blank form. Reload first."
                        : companyLoading
                          ? "Loading your company details…"
                          : undefined
                    }
                  >
                    {savingComp ? "Saving…" : "Save company"}
                  </button>
                  {companyError && (
                    <p className="cap" style={{ marginTop: 8 }}>
                      We couldn&apos;t load your company details, so this form
                      is empty — saving it would wipe what is stored. Reload
                      and try again.
                    </p>
                  )}
                </div>
              </div>
              <div className="card">
                <h2>
                  <Ic name="i-bell" /> Notification preferences
                </h2>
                <p className="cap">Pick what&apos;s worth a ping.</p>
                {/* ── FROM THE CATALOGUE, NOT TWO HARD-CODED ROWS ──────
                    The catalogue already carries an `audience` on every
                    type and a helper that filters by it -- and that
                    helper's ONLY consumer is the admin dialog, which a
                    customer can never open. So a customer had two
                    toggles out of six, and four of their own
                    notification types had no control anywhere: past
                    due, plan changed, and the three added tonight.
                    Anything added later now appears here on its own. */}
                {catalogForRole("advertiser").map((entry) => (
                  <Toggle
                    key={entry.type}
                    label={entry.label}
                    desc={entry.description}
                    notifType={entry.type}
                  />
                ))}
              </div>
            </div>
            {/* Not for people who already are one. isAffiliate was read
                once in this whole file, to build the referral link, and
                never to decide whether to show this card — so somebody
                with a live approved referral link was being invited, in
                their own settings, to apply for the thing they already
                have. */}
            {/* ...and hidden while we do not yet know. Offering
                "Become an affiliate" to somebody who already is one is
                the thing this flag is read to prevent. */}
            <div className="card" hidden={isAffiliate || affiliateUnknown}>
              <h2>
                <span
                  style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
                >
                  <Ic name="i-gift" /> Become an affiliate
                </span>
              </h2>
              <p className="cap">
                Share one link and earn from the advertisers you bring in —
                for as long as they keep going. We agree your rate first.
              </p>
              {/* ── NOT A mailto: ─────────────────────────────────────
                  This used to set location.href to a mailto:. On a
                  machine with no mail client registered — most machines,
                  and every phone where the customer uses webmail —
                  that does NOTHING. No error, no tab, no console entry.
                  They press the only button on the card, watch nothing
                  happen, and conclude the product is broken. Which, from
                  where they are standing, it is. */}
              {applicationOpen ? (
                // Applied: say where it stands, and where to follow it --
                // not a greyed-out button.
                <p className="cap" style={{ margin: 0 }}>
                  <b>Application received.</b> We&apos;re setting up your rate —
                  follow it under{" "}
                  <button
                    type="button"
                    className="lnk"
                    onClick={() => go("referrals")}
                    style={{ border: 0, background: "none", padding: 0, color: "var(--primary-600)", fontWeight: 700, cursor: "pointer" }}
                  >
                    Referrals
                  </button>
                  .
                </p>
              ) : (
                <>
                  <button className="btn ghost sm" disabled={applying} onClick={applyAffiliate}>
                    {applying ? "Sending…" : applicationRefused ? "Apply again" : "Join the affiliate program"}
                  </button>
                  {applicationRefused ? (
                    <p className="cap" style={{ margin: "8px 0 0" }}>
                      Not this time{affiliateRefusal ? `: ${affiliateRefusal}` : "."} You
                      can apply again whenever you like.
                    </p>
                  ) : null}
                </>
              )}
            </div>
            {/* -- GDPR, WHERE THE CUSTOMER CAN ACTUALLY REACH IT ------
                These two controls - download my data (art. 20) and
                request erasure (art. 17) - were mounted on /profile and
                nowhere else, and /profile now bounces every customer to
                their own shell. So the right to export and the right to
                be forgotten were both unreachable for the only people
                who have them, while /help still told them to go to
                Profile. Same component, mounted where they land. */}
            <div className="card">
              <h2>Your data</h2>
              <p className="cap" style={{ margin: "0 0 12px" }}>
                Sign out everywhere, or ask us to delete your account.
              </p>
              {/* heading={false}: this card already has one. The component
                  printed a second, "Privacy", with a sentence saying
                  nearly the same thing as the one above it. */}
              <PrivacyControls heading={false} />
            </div>
            {/* ── AND WHAT HAPPENED ON THEIR ACCOUNT: NOT YET ─────
                This card used to sit here and it could never hold
                anything. The only read policy on audit_events is the
                tenant OWNER, and RLS filters rather than refuses, so
                the list came back empty with no error and printed
                "Nothing here yet. Your changes will show up as you
                use the app." to a customer whose account had plenty
                of history. The question is a real one -- it is the
                first thing somebody asks when a figure surprises
                them -- but answering it needs its own narrowed view,
                because audit_events rows carry old_data/new_data and
                those hold supplier figures. Written up rather than
                faked. */}
          </div>

          {/* HELP */}
          <div className={`view${view === "help" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Get help</h1>
              </div>
            </div>
            <div className="grid2">
              <div className="card">
                <h2>
                  <Ic name="i-help" /> How it works
                </h2>
                <div className="faq" style={{ marginTop: 14 }}>
                  <div>
                    <div className="q">How do I fund an ad account?</div>
                    <div className="a">
                      Top up your wallet by bank transfer, we verify it, then
                      move budget onto any ad account.
                    </div>
                  </div>
                  <div>
                    <div className="q">How fast do accounts go live?</div>
                    {/* A question about SPEED, answered with a place —
                        and the answer was a copy of the sentence already
                        used in the ad-accounts empty state and in the
                        request dialog. */}
                    <div className="a">
                      Usually within one working day of approval. You get a
                      notification the moment it is live.
                    </div>
                  </div>
                  <div>
                    <div className="q">Can I get my money back?</div>
                    <div className="a">
                      You can request a withdrawal of an ad-account balance; our
                      team approves and returns it to your wallet.
                    </div>
                  </div>
                </div>
              </div>
              <div className="card">
                <h2>
                  <Ic name="i-mail" /> Talk to us
                </h2>
                <p className="cap">We&apos;re one tap away.</p>
                <button
                  className="btn block grad"
                  onClick={() =>
                    openWhatsapp(
                      `Hi PSM, I have a question about my account${referralCode ? ` (${referralCode})` : ""}.`,
                    )
                  }
                >
                  <WhatsappIcon /> Message us on WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>

        <nav className="bottombar">
          {BOTTOM.map((b) => (
            <button
              key={b.v + b.label}
              className={`bb${view === b.v ? " on" : ""}`}
              onClick={() => go(b.v)}
            >
              <span className="bbic">
                <Ic name={b.icon} />
              </span>
              {b.label}
            </button>
          ))}
        </nav>
      </div>

      <WalletTopupDialog
        open={topupOpen}
        onOpenChange={setTopupOpen}
        initialCurrency={topupCurrency}
        walletId={wallet?.id ?? null}
        referenceNo={wallet?.reference_no ?? null}
        // Not a constant. Before the plan is paid there is NO minimum — that
        // first payment is how the plan gets paid at all, and demanding €300
        // of someone who has put in nothing yet is the wrong way round. Once
        // it is running the floor applies — 250 for NSA, 300 for everyone
        // else, unless an admin set a value for this wallet.
        // UNKNOWN COUNTS AS RUNNING, here specifically.
        //
        // No minimum applies before the plan is active, and that is right
        // — the first payment is how the plan gets paid at all. But when
        // the three reads behind planActive have FAILED, treating that as
        // "not active" removes the floor for a customer whose plan is in
        // fact running: they are shown the IBAN, told 5 EUR is fine, they
        // make the transfer, and only then does the server read the same
        // facts from the database and refuse with "Minimum top-up is 300
        // EUR". The money has already left their bank.
        //
        // So an unreadable state takes the floor, not the exemption. The
        // cost of being wrong that way is one conversation; the other way
        // it is a transfer that has to be sent back.
        minTopup={effectiveMinTopup({
          walletMin: wallet?.min_topup as number | null | undefined,
          // planUnknown, not gateUnknown: a failed COMPANY read says
          // nothing about whether their plan is running, and using it
          // here put the EUR 300 floor on a first top-up the server would
          // have taken at EUR 5.
          planActive: planActive || !!planUnknown,
          community,
        })}
        // Their own accounts decide where the transfer goes, so the dialog
        // can work it out instead of showing every customer all three
        // beneficiary companies and asking them to route their own payment.
        accountTypeSlugs={(accounts ?? []).map((a) => a.platform)}
        /* A failed or in-flight accounts read is not "no accounts". It
           decides which company's IBAN the customer is told to pay. */
        accountsUnknown={accountsError || accountsLoading}
      />
      <WalletExchangeDialog
        initialFrom={exchangeFrom}
        open={exchangeOpen}
        onOpenChange={setExchangeOpen}
        walletId={wallet?.id ?? null}
        usdBalance={usdBal}
        eurBalance={eurBal}
        needAmount={exchangeNeed?.amount ?? null}
        needCurrency={exchangeNeed?.currency ?? null}
        needLabel={exchangeNeed?.label ?? null}
      />
      <CreateTopupDialog
        open={acctTopupOpen}
        setOpen={setAcctTopupOpen}
        account={acctTopup}
      />
      <AccountDetailsSheet
        open={detailsOpen}
        setOpen={() => setDetailsOpen(false)}
        accountId={detailsId}
      />

      {/* The money confirmation. Same shape as the sign-out one, because a
          customer should not have to learn two kinds of "are you sure". */}
      <TaxRatesDialog
        open={taxOpen}
        onClose={() => setTaxOpen(false)}
        tenantId={tenantId}
        apiLinked={false}
      />

      {ask && (
        <div className="modal">
          <div
            className="mback"
            onClick={() => {
              if (!asking) setAsk(null);
            }}
          />
          <div className="mcard" style={{ width: "min(430px,100%)" }}>
            <div className="mhead">
              <h2>{ask.title}</h2>
              <button
                className="iconbtn"
                onClick={() => setAsk(null)}
                disabled={asking}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {/* THE PLAN, as the card they chose it from. Dark, because
                that is what this brand looks like when it means it, and
                because a paid plan should not read like a grey line item.
                The sheen is one slow pass and stops for anyone who asked
                for less motion. */}
            {ask.hero && (
              <div className="planhero">
                {/* Two slow aurorae and a rocket watermark. The brand mark
                    is the quietest thing on it — a card that shouts its
                    own logo at somebody about to pay is selling to
                    somebody who has already bought. */}
                <span className="ph-aur a" aria-hidden="true" />
                <span className="ph-aur b" aria-hidden="true" />
                <span className="ph-mark" aria-hidden="true">
                  <Ic name="i-rocket" />
                </span>
                <span className="ph-sheen" aria-hidden="true" />
                <div className="ph-body">
                  {/* The name anchors the top-RIGHT and the money the
                      left, so the two do not compete on one line. The
                      perks are pills that wrap rather than a stacked list
                      — three lines become one or two, and the whole
                      confirmation stops needing a scroll. */}
                  <div className="ph-head">
                    <div className="ph-left">
                      <span className="ph-tag">Your plan</span>
                      <div className="ph-amt">
                        <b>{ask.hero.amount}</b>
                        <span>{ask.hero.per}</span>
                      </div>
                    </div>
                    <div className="ph-name">{ask.hero.name}</div>
                  </div>
                  <ul className="ph-perks">
                    {ask.hero.perks.map((t) => (
                      <li key={t}>
                        <Ic name="i-check" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <p className="cap">{ask.lead}</p>
            <div
              style={{
                marginTop: 14,
                border: "1px solid var(--line)",
                borderRadius: 14,
                padding: "6px 12px",
              }}
            >
              {ask.facts.map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "7px 0",
                    fontSize: ".88rem",
                  }}
                >
                  <span style={{ color: "var(--faint)" }}>{k}</span>
                  <span style={{ fontWeight: 600, textAlign: "right" }}>
                    {v}
                  </span>
                </div>
              ))}
            </div>
            <div className="mfoot">
              <button
                className="btn ghost"
                onClick={() => setAsk(null)}
                disabled={asking}
              >
                Go back
              </button>
              <button
                className="btn"
                disabled={asking}
                onClick={async () => {
                  if (asking) return;
                  setAsking(true);
                  try {
                    // Only clear it if the write actually landed.
                    if (await ask.run()) setAsk(null);
                  } finally {
                    setAsking(false);
                  }
                }}
              >
                <Ic name={ask.icon ?? "i-check"} />{" "}
                {asking ? ask.busyLabel : ask.cta}
              </button>
            </div>
          </div>
        </div>
      )}

      {signOutOpen && (
        <div className="modal">
          <div className="mback" onClick={() => setSignOutOpen(false)} />
          <div className="mcard" style={{ width: "min(400px,100%)" }}>
            <div className="mhead">
              <h2>Sign out?</h2>
              <button
                className="iconbtn"
                onClick={() => setSignOutOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="cap">You&apos;ll need to log in again.</p>
            <div className="mfoot">
              <button
                className="btn ghost"
                onClick={() => setSignOutOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn"
                onClick={() => {
                  setSignOutOpen(false);
                  logout();
                }}
              >
                <LogoutGlyph /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Small logout glyph reused by the account menu + sign-out modal.
/**
 * The dashboard's shape, before it has any content.
 *
 * Deliberately the same BLOCKS in the same order and at the same heights
 * as the finished view — hero, two wallet cards, a stat row, a card — so
 * the moment the data lands nothing moves. A skeleton that is a different
 * size from what replaces it is just a second flash.
 *
 * aria-hidden and no text: a screen reader should hear the real page when
 * it exists, not a description of a placeholder.
 */
function DashSkeleton() {
  return (
    <div className="dash-skel" aria-hidden="true">
      <div className="ds-hero" />
      <div className="ds-row">
        <div className="ds-card" />
        <div className="ds-card" />
      </div>
      <div className="ds-stats">
        <div className="ds-stat" />
        <div className="ds-stat" />
        <div className="ds-stat" />
      </div>
      <div className="ds-block" />
    </div>
  );
}

function LogoutGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  );
}

function WalletCard({
  cur,
  label,
  value,
  pending = 0,
  pendingUnknown = false,
  pendingChecking = false,
  onTopup,
  onExchange,
  disabled,
  disabledReason,
}: {
  cur: "eur" | "usd";
  label: string;
  value: string;
  /** Sent but not yet verified, in this currency. */
  pending?: number;
  /** The activity read failed, so `pending` is 0 by accident, not fact. */
  pendingUnknown?: boolean;
  pendingChecking?: boolean;
  onTopup: () => void;
  onExchange: () => void;
  disabled?: boolean;
  /** Why the buttons are dead. Shown so the screen is not just mute. */
  disabledReason?: string;
}) {
  const sym = cur === "usd" ? "$" : "€";
  return (
    <div className={`wallet ${cur}`}>
      <div className="wsh" />
      <div className="wl">{label}</div>
      <div className="wv">{value}</div>
      {/* This line used to repeat the balance verbatim — "€0" and then "€0
          available" — which told a customer nothing the line above had not.
          What belongs here is the money they have sent that we have not
          verified yet, because that is what explains a balance that looks
          lower than they expect. */}
      <div className="wavail">
        {pendingUnknown ? (
          // "Couldn't" is past tense and reads as a failure. It was shown
          // for the whole of the ordinary loading window too, on both
          // cards, every time the Wallet view opened.
          pendingChecking ? (
            "Checking for pending transfers…"
          ) : (
            "We couldn't check for pending transfers"
          )
        ) : pending > 0 ? (
          <>
            <b>
              {sym}
              {/* Two decimals, like the panel directly under it. This
                  printed a rounded "EUR 1,235 awaiting verification"
                  above a row reading EUR 1,234.50 — the same money,
                  twice, on one screen. */}
              {(Number(pending) || 0).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </b>{" "}
            awaiting verification
          </>
        ) : (
          "Available to spend"
        )}
      </div>
      <div className="wa">
        <button
          className="wbtn"
          onClick={onTopup}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
        >
          <Ic name="i-plus" /> Top up
        </button>
        <button
          className="wbtn gh"
          onClick={onExchange}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
        >
          <Ic name="i-swap" /> Exchange
        </button>
      </div>
      {/* A title attribute is invisible on a phone, and this is a phone
          app. The sentence goes on the card. */}
      {disabled && disabledReason && (
        <div className="wavail">{disabledReason}</div>
      )}
    </div>
  );
}

function Toggle({
  label,
  desc,
  notifType,
}: {
  label: string;
  desc: string;
  notifType: NotificationType;
}) {
  const { isEnabled, setPreference, isError } = useNotificationPreferences();
  const on = isEnabled(notifType);
  return (
    <div className="toggle-row">
      <div>
        <div className="t">{label}</div>
        {/* ── A FAILED READ IS NOT "IT IS ON" ─────────────────────────
            The hook defaulted to an empty preference list on any
            failure, which reads as "nothing is disabled" -- so a
            customer who had switched this off saw it rendered ON. They
            either leave it and keep getting alerts they refused, or
            toggle it again and write a preference that was already
            there. Say what happened instead, and do not draw a state
            we do not have. */}
        <div className="d">
          {isError ? "We couldn't read your setting just now." : desc}
        </div>
      </div>
      <button
        className={`sw${isError ? "" : on ? " on" : ""}`}
        disabled={setPreference.isPending || isError}
        onClick={() => setPreference.mutate({ type: notifType, enabled: !on })}
        aria-label={label}
      />
    </div>
  );
}

/**
 * A reference you can take with you.
 *
 * Copy-on-tap, then say so for a moment. Nothing about a reference is
 * useful if it has to be retyped: the whole job of the string is to match
 * two records to each other, and a typo in it means a payment nobody can
 * find.
 */
function CopyRef({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copyref"
      title="Copy this reference"
      aria-label={`Copy reference ${value}`}
      onClick={(e) => {
        e.stopPropagation();
        // clipboard is unavailable over plain http and in some embedded
        // webviews, and it REJECTS rather than throwing synchronously.
        // A failed copy must not look like a successful one.
        void copyText(value).then((ok) => {
          if (!ok) return;
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        });
      }}
    >
      <span>{value}</span>
      <Ic name={done ? "i-check" : "i-copy"} />
    </button>
  );
}
