"use client";

import { dmSans, jakarta } from "@/lib/fonts";
import { signOutCompletely } from "@/lib/auth/sign-out";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import useAffiliateStats from "@/hooks/use-affiliate-stats";
import TaxRatesDialog from "./tax-rates-dialog";
import useNotifications from "@/components/notifications/use-notifications";
import { getNotificationCopy } from "@/components/notifications/notification-utils";
import { updateOwnProfileAndCompany } from "@/actions/company-actions";
import { getURL } from "@/lib/utils";
import {
  AD_ACCOUNT_CUSTOMER_COLUMNS,
  AD_ACCOUNT_CORE_COLUMNS,
} from "@/lib/ad-account-columns";
import {
  isCompanyComplete,
  missingCompanyFields,
} from "@/lib/pure-company-complete";
import { AdAccount } from "@/lib/types/account";
import { Wallet } from "@/lib/types/wallet";
import { PLATFORMS } from "@/lib/constants";
import { InvoiceWithRelations } from "@/lib/types/invoice-extended";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useRouter } from "next/navigation";
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

const eur = (n: number | string | null | undefined) =>
  "€" + Math.round(Number(n) || 0).toLocaleString("en-US");
const usd = (n: number | string | null | undefined) =>
  "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
const money2 = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n ?? 0));

// Support inbox for the "contact us" actions. Change here if it differs.
const SUPPORT_EMAIL = "contact@primescalemedia.com";

const platformLabel = (p: string | null) =>
  PLATFORMS.find((x) => x.value === p)?.label ?? p ?? "—";


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

export default function AdvertiserApp() {
  const { profile } = useAppContext();
  const queryClient = useQueryClient();
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
  const openExchange = (cur: "EUR" | "USD") => {
    setExchangeFrom(cur);
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
  const { isAffiliate, isError: affiliateUnknown } = useIsAffiliate();

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

  const { data: subscription, isError: subError } = useQuery<{
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
  const { data: exchanges, isError: exchangesError } = useQuery<
    {
      id: string;
      created_at: string;
      from_currency: string;
      to_currency: string;
      from_amount: number | string | null;
      to_amount: number | string | null;
      exchange_rate: number | string | null;
    }[]
  >({
    queryKey: ["adv-wallet-exchanges", wallet?.id],
    enabled: !!wallet?.id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wallet_exchanges")
        .select(
          "id, created_at, from_currency, to_currency, from_amount, to_amount, exchange_rate",
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
  const {
    notifications: notifs,
    markAsRead,
    markAllAsRead,
    // "You're all caught up" over a read that FAILED is the worst kind of
    // reassurance: these carry "your top-up was rejected" and request
    // approvals. The hook exports isError for exactly this, and neither
    // app was asking for it.
    isError: notifsError,
  } = useNotifications();

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
      const { data, error } = await supabase
        .from("companies")
        // registration_no and website_url are in COMPANY_ALLOWED and are
        // posted back by saveCompany, so leaving them OUT of this select
        // meant they came back as "" and every save wiped them. The
        // registration number is printed on the invoice PDF and it is the
        // field /complete-profile's own gate tests — so wiping it makes
        // that page reappear for ever.
        .select("name, vat_no, country, is_not_vat, official_email, phone, address, state, zipcode, registration_no, website_url, billings(address, state, country, zipcode)")
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
      const res = await updateOwnProfileAndCompany({ company: comp });
      if (!res.ok) throw new Error(res.error);
      toast.success("Company saved");
      queryClient.invalidateQueries({
        queryKey: ["adv-company"],
        exact: false,
      });
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
      await navigator.clipboard.writeText(referralLink);
      toast.success("Referral link copied.");
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };

  const eurBal = Number(wallet?.eur_balance ?? 0);
  const usdBal = Number(wallet?.usd_balance ?? 0);
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

  const eurText = walletError ? "—" : walletLoading ? "…" : eur(eurBal);
  // The hero sits above both wallets and belongs to neither, so its Top
  // up and Exchange need a currency of their own. Whichever one they
  // actually hold; EUR when they hold both or nothing, because that is
  // what every RPC on the server falls back to.
  const heroCurrency: "EUR" | "USD" =
    eurBal <= 0 && usdBal > 0 ? "USD" : "EUR";
  const usdText = walletError ? "—" : walletLoading ? "…" : usd(usdBal);
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
  type WalletEvent =
    | { kind: "topup"; id: string; at: string; row: NonNullable<typeof activity>[number] }
    | { kind: "exchange"; id: string; at: string; row: NonNullable<typeof exchanges>[number] };
  const walletEvents: WalletEvent[] = [
    ...(activity ?? []).map(
      (t) => ({ kind: "topup", id: t.id, at: t.created_at, row: t }) as WalletEvent,
    ),
    ...(exchanges ?? []).map(
      (x) => ({ kind: "exchange", id: x.id, at: x.created_at, row: x }) as WalletEvent,
    ),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

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
  const pendingUnknown = activityError || activityLoading || !wallet?.id;
  const pendingTopups = (activity ?? []).filter(
    (t) =>
      t.status !== "completed" &&
      t.status !== "failed" &&
      t.status !== "rejected",
  );
  // What is on its way but not yet credited, per currency. The wallet cards
  // used to print the balance twice — "€0" and then "€0 available" — which
  // told a customer nothing the first line had not. Money sitting in a
  // transfer we have not verified yet is the thing they actually want to see
  // on that second line, because it explains a balance that looks too low.
  const pendingByCurrency = (activity ?? []).reduce(
    (acc, t) => {
      if (
        t.status === "completed" ||
        t.status === "failed" ||
        t.status === "rejected"
      ) {
        return acc;
      }
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
  const unpaidSubInvoices = (invoices ?? [])
    .filter((i) => i.status !== "paid" && i.status !== "void" && i.type === "subscription")
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  const dueSubInvoice = unpaidSubInvoices[0];
  // invoices.currency first, items[0] only as a fallback — the same order
  // the paying RPC uses. The modal was fixed for this and the CARD and the
  // amount column were not, so one invoice could read €120 on the button
  // and $120 in the confirmation it opened.
  const invCurrency = (inv: {
    currency?: string | null;
    items?: unknown;
  } | null | undefined): "USD" | "EUR" =>
    ((inv?.currency as string | null | undefined) ??
      (inv?.items as Array<{ currency?: string }> | undefined)?.[0]?.currency ??
      "EUR")
      .toString()
      .toUpperCase() === "USD"
      ? "USD"
      : "EUR";
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
  const twoLeg = (e: number, u: number): string => {
    const eNum = Number(e) || 0;
    const uNum = Number(u) || 0;
    if (eNum && uNum) return `${eur(eNum)} · ${usd(uNum)}`;
    if (uNum) return usd(uNum);
    return eur(eNum);
  };

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
    return bal + 0.005 >= Number(inv.total ?? 0);
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
  const { data: planPaidRow, isError: planPaidError } = useQuery({
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
  const planActive =
    !!subscription &&
    subscription.status === "active" &&
    !dueSubInvoice &&
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
  const planUnknown = planPaidError || subError || invError;
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
    if (!planActive && !planUnknown) {
      return "Your plan has to be active first — that is what your included ad accounts come from";
    }
    return "We couldn't check your plan just now — reload and try again";
  };

  const canRequestAccount =
    (companyComplete || companyUnknown) &&
    (planActive || planUnknown || (accounts ?? []).length > 0);

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
    if (wanted && wanted in TITLES) setView(wanted as View);
    // Mount only. Later changes come from go(), which writes the URL itself.
  }, []);

  const go = (v: View) => {
    setView(v);
    setNavOpen(false);
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
      const { error } = await supabase.rpc("invoice_pay_from_wallet", {
        p_invoice_id: id,
      });
      if (error) throw error;
      toast.success("Invoice paid from your wallet.");
      queryClient.invalidateQueries({ queryKey: ["adv-invoices"], exact: false });
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
    // The invoice's own currency first, items[0] only as a fallback, and
    // EUR last — the same order and the same default as the RPC that takes
    // the money.
    const cur =
      ((inv.currency as string | null | undefined) ??
        (inv.items as Array<{ currency?: string }> | undefined)?.[0]?.currency ??
        "EUR")
        .toString()
        .toUpperCase() === "USD"
        ? "USD"
        : "EUR";
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
        onClick={() => openDetails(a.id)}
      >
        <div className="top">
          <span className="pfi">
            <Ic name="i-ad" />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="nm">{a.name || "Ad account"}</div>
            <div className="sub">{platformLabel(a.platform)}</div>
          </div>
          <span style={{ marginLeft: "auto" }}>
            <span className={`badge ${b.cls}`}>{b.label}</span>
          </span>
        </div>
        <div className="kv">
          <span>Fee</span>
          <b>{Number(a.fee ?? 0)}%</b>
        </div>
        <div className="kv">
          <span>Currency</span>
          <b>{a.currency ?? "EUR"}</b>
        </div>
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
        <div className="logo">
          <span className="mark">
            <Ic name="i-rocket" />
          </span>
          <span className="name">
            Prime Scale Media<small>Advertiser</small>
          </span>
        </div>
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
              size={36}
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
            <span className="tb-brand">
              <span className="mark">
                <Ic name="i-rocket" />
              </span>
            </span>
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
                {subscription.status[0].toUpperCase() +
                  subscription.status.slice(1)}
              </button>
            )}
            <button
              className="tool ic-btn"
              onClick={toggleNotifs}
              aria-label="Notifications"
              aria-pressed={view === "notif"}
            >
              <Ic name="i-bell" />
              {notifs.filter((n) => !n.is_read).length > 0 && (
                <span className="badge-n">
                  {notifs.filter((n) => !n.is_read).length}
                </span>
              )}
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
              size={36}
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
              loading={companyLoading || walletLoading || accountsLoading}
              /* AND WAIT FOR A FAILED READ TOO. `loading` goes false when a
                 query FAILS, and then company is null and both balances are
                 0 — indistinguishable from a brand-new account. So a
                 customer holding EUR 10,000 with six live accounts was
                 shown "Get started — 4 steps left" at 0%, told to fund
                 their wallet, on the same dashboard whose other cards
                 already said the reads had failed. */
              unavailable={walletError || accountsError || companyError}
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
              loading={walletLoading}
            />
            {/* Number(), not truthiness. subscriptions.amount is moving from
                a float to numeric, and PostgREST serialises numeric as a
                STRING — so `0` stops being falsy and becomes "0.00", which
                is not. A free plan would then start showing "Monthly fee €0"
                with a Pay button beside it on the customer's own dashboard.
                Same at the two sites below. */}
            {subscription &&
              Number(subscription.amount ?? 0) > 0 &&
              subscription.next_payment_date && (
              /* One quiet row, not a filled banner with a solid blue button
                 in it. Nothing here is wrong yet — the fee is simply due —
                 and a notice that shouts competes with the balances directly
                 above it, which is what people actually came to see. */
              <div className="duerow">
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
                <span className="dtx">
                  {dueSubInvoice ? "Outstanding" : "Monthly fee"}{" "}
                  <b>{dueSubInvoice ? dueBillAmount : planMoney(subscription.amount)}</b>
                  {dueBillDate
                    ? ` · due ${dayjs(dueBillDate).format("D MMM")}`
                    : ""}
                </span>
                {/* "Pay", not "Pay now". The row must hold one line at phone
                    width and the sentence beside it is the part carrying the
                    information; next to an amber button on a fee notice,
                    "Pay" is not ambiguous. */}
                <button
                  className="dlink"
                  onClick={() => go("billing")}
                  title="Pay this invoice from your wallet"
                >
                  Pay <Ic name="i-arrow" />
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
                    textTransform: "capitalize",
                    color: dueSubInvoice ? "var(--warn)" : undefined,
                  }}
                >
                  {dueSubInvoice
                    ? "Unpaid"
                    : (subscription?.status ?? "—")}
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
                  {dueSubInvoice
                    ? `${dueBillAmount} outstanding`
                    : subscription?.next_payment_date
                      ? `Renews ${dayjs(subscription.next_payment_date).format("D MMM")}`
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
                    No ad accounts yet. Ask for your first one whenever
                  you&apos;re ready.
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
            <div className="card">
              <h2>
                  <Ic name="i-gift" /> Your referral link
                </h2>
              <p className="cap" style={{ margin: "6px 0 12px" }}>
                Anyone who signs up through your link is yours, and stays
                    yours.
              </p>
              {referralLink ? (
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                  <div
                    className="mono"
                    style={{
                      flex: 1,
                      minWidth: 200,
                      background: "var(--panel-2)",
                      border: "1px solid var(--line-2)",
                      borderRadius: 11,
                      padding: "12px 13px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: ".84rem",
                    }}
                  >
                    {referralLink}
                  </div>
                  <button className="btn" onClick={copyReferral}>
                    <Ic name="i-check" /> Copy link
                  </button>
                </div>
              ) : affiliateUnknown ? (
                /* "Ask an admin to enable the affiliate program" is a
                   statement about this account's STATUS, and we do not know
                   it — the read failed. Telling an approved affiliate to go
                   and ask for something they already have sends them to
                   support about an account that works. */
                <p className="muted" style={{ margin: 0 }}>
                  We couldn&apos;t check your referral link just now. This
                  does not mean you don&apos;t have one — reload and it should
                  appear.
                </p>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  Your referral link isn&apos;t set up yet — ask an admin to
                  enable the affiliate program for your account, or apply via
                  Settings.
                </p>
              )}
            </div>
            <div className="stats">
              <div className="stat">
                <div className="k">
                  <span className="ci b">
                    <Ic name="i-user" />
                  </span>{" "}
                  Referred
                </div>
                {/* aff.isError was referenced NOWHERE on this screen, so
                    a failed read printed Referred 0, Active 0, Commission
                    €0 and Spend €0 — four figures it could not vouch for,
                    on the page where an advertiser checks what their
                    referrals earned them. The wallet block eight lines up
                    already does this correctly. */}
                <div className="v">{aff.isError ? "—" : aff.rows.length}</div>
              </div>
              <div className="stat">
                <div className="k">
                  <span className="ci t">
                    <Ic name="i-trend" />
                  </span>{" "}
                  Active
                </div>
                <div className="v">
                  {aff.isError
                    ? "—"
                    : aff.rows.filter((r) => Number(r.topup_count) > 0).length}
                </div>
              </div>
              <div className="stat">
                <div className="k">
                  <span className="ci g">
                    <Ic name="i-wallet" />
                  </span>{" "}
                  Commission
                </div>
                <div className="v">
                  {aff.isError
                    ? "—"
                    : twoLeg(aff.totals.earnings_eur, aff.totals.earnings_usd)}
                </div>
              </div>
              <div className="stat">
                <div className="k">
                  <span className="ci p">
                    <Ic name="i-trend" />
                  </span>{" "}
                  Spend driven
                </div>
                <div className="v">
                  {aff.isError
                    ? "—"
                    : twoLeg(aff.totals.spend_eur, aff.totals.spend_usd)}
                </div>
              </div>
            </div>
            <div className="card" style={{ padding: "16px 8px 8px" }}>
              <div style={{ padding: "0 14px 8px" }}>
                <h2>
                  <Ic name="i-user" /> Your referrals
                </h2>
              </div>
              <div className="tblwrap">
                <table className="tbl wide">
                  <thead>
                    <tr>
                      <th style={{ paddingLeft: 14 }}>Advertiser</th>
                      <th>Code</th>
                      <th className="r">Top-ups</th>
                      <th className="r">Spend</th>
                      <th className="r">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aff.rows.length ? (
                      aff.rows.map((r) => (
                        <tr key={r.referred_advertiser_id}>
                          <td data-label="Advertiser" style={{ fontWeight: 600 }}>
                            {r.referred_advertiser_name || "Advertiser"}
                          </td>
                          <td data-label="Code" className="mono">
                            {r.referred_advertiser_code || "—"}
                          </td>
                          <td data-label="Top-ups" className="r">
                            {r.topup_count}
                          </td>
                          <td data-label="Spend" className="r mono">
                            {twoLeg(r.spend_eur, r.spend_usd)}
                          </td>
                          <td
                            data-label="Commission"
                            className="r mono"
                            style={{ fontWeight: 700, color: "var(--win)" }}
                          >
                            {twoLeg(r.earnings_eur, r.earnings_usd)}
                          </td>
                        </tr>
                      ))
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
                          {aff.isError
                            ? "We couldn't read your referrals just now — this is not a zero. Reload to try again."
                            : "No referrals yet."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
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
            {!companyComplete && !companyUnknown && (
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
                        {t.currency === "USD" ? "$" : "€"}
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
                                {x.exchange_rate
                                  ? ` at ${// The rate, at the precision it is STORED at. money2 printed 0.8612
                          // as "0.86", so the row did not reconcile: the amounts
                          // beside it are exact and the rate they came from was not.
                          Number(x.exchange_rate).toFixed(4)}`
                                  : ""}
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
                            {t.currency === "USD" ? "$" : "€"}
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
                          {activityError || exchangesError
                            ? "We couldn't load your wallet activity — this isn't an empty list. Give it a reload."
                            : "Nothing has moved yet. Your top-ups and exchanges will show up here."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* AD ACCOUNTS */}
          <div className={`view${view === "accounts" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Ad accounts</h1>
                <p>
                  Where your budget does its work.{" "}
                  {/* The question a customer asks when a figure is lower
                      than they expected. Answering it before they ask is
                      cheaper than answering it afterwards. */}
                  <button className="linkish" onClick={() => setTaxOpen(true)}>
                    Tax rates by country
                  </button>
                </p>
              </div>
              {/* "Request ad account" under a heading that already says
                  Ad accounts is the page title twice. The shorter label
                  is the one that fits beside the heading instead of
                  dropping to its own line. */}
              {canRequestAccount ? (
                <RequestAdAccountDialog>
                  <button className="btn grad">
                    <Ic name="i-plus" /> Request one
                  </button>
                </RequestAdAccountDialog>
              ) : (
                <button
                  className="btn grad"
                  disabled
                  title={requestBlockedReason() ?? undefined}
                >
                  <Ic name="i-plus" /> Request one
                </button>
              )}
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
                    : canRequestAccount
                      ? "No ad accounts yet"
                      : (requestBlockedReason() ?? "Nothing here yet")}
                </h3>
                <p>
                  {accountsError
                    ? "This isn't an empty list — the request didn't come back. Give it a reload."
                    : !canRequestAccount && invError
                      ? "Your invoices didn't load, so we can't tell whether the plan is paid. Reload to try again."
                    : canRequestAccount
                    ? "Request one and we set it up for you on our verified Business Manager. Your plan covers the accounts it includes; anything beyond that is billed as you go."
                    : pendingTopups.length > 0
                      ? "Your transfer is with us and being verified. Once your plan is paid, the ad accounts it includes are yours to request."
                      : "Your ad accounts come with your plan, so the first step is paying for it. After that the included accounts are yours to request, and extras are billed as you go."}
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
                        const cls =
                          st === "rejected" || st === "declined"
                            ? "due"
                            : st === "pending" || st === "in_review"
                              ? "pend"
                              : "ok";
                        return (
                          <tr key={r.id}>
                            <td
                              data-label="Date"
                              style={{ fontWeight: 600, whiteSpace: "nowrap" }}
                            >
                              {dayjs(r.created_at).format("D MMM YYYY")}
                            </td>
                            <td data-label="Platform">
                              {platformLabel(r.platform)}
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
                <span className="pill">
                  <Ic name="i-shield" />{" "}
                  {/* A failed read is not "no plan". Telling a paying
                      customer they have no subscription because a query
                      dropped is the worst kind of wrong: it is their own
                      screen, so there is nowhere else for them to check. */}
                  {subscription?.status
                    ? subscription.status[0].toUpperCase() +
                      subscription.status.slice(1)
                    : subError
                      ? "Couldn't load"
                      : "No plan"}
                </span>
                <div className="plan">
                  {subscription && Number(subscription.amount ?? 0) > 0
                    ? `${planMoney(subscription.amount)} / month`
                    : "Subscription"}
                </div>
                <div className="meta">
                  {subscription?.next_payment_date
                    ? `Renews ${dayjs(subscription.next_payment_date).format("D MMM YYYY")}`
                    : "—"}
                </div>
                <div
                  style={{ opacity: 0.82, fontSize: ".78rem", marginTop: 16 }}
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
                  A change is charged pro-rata straight away, not next
                  month. Ask us and we will tell you the exact figure
                  first.
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
                  {invError
                    ? "We couldn't read your invoices just now, so we'd rather not tell you this month is settled."
                    : invLoading
                      ? "Looking up this month…"
                      : dueSubInvoice
                        ? "Pay it from your wallet whenever suits you — or leave it, and we'll take it from your wallet on the due date."
                        : "Nothing owed right now. We'll raise the next one automatically."}
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
                          {invError || invLoading
                            ? "Checking your billing…"
                            : dueSubInvoice
                              ? "Monthly fee"
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
                            : subscription.next_payment_date
                              ? `Next on ${dayjs(subscription.next_payment_date).format("D MMM YYYY")} · ${planMoney2(subscription.amount)}`
                              : "We'll tell you when the next one is ready"}
                        </div>
                      </div>
                      {/* "18 hours ago" in a red badge, on an invoice that
                          has been PAID, is the screen telling somebody they
                          are late for something they have already done.
                          A relative time belongs on something still open;
                          on a settled one the only useful word is Paid. */}
                      {invError || invLoading ? null : dueSubInvoice ? (
                        dueBillDate ? (
                          <span
                            className="badge due"
                            style={{ marginLeft: "auto" }}
                          >
                            {dayjs(dueBillDate).fromNow()}
                          </span>
                        ) : null
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
                          name={canPayInvoice(dueSubInvoice) ? "i-wallet" : "i-plus"}
                        />{" "}
                        {canPayInvoice(dueSubInvoice)
                          ? `Pay ${dueSubSymbol}${money2(dueSubInvoice.total)} from wallet`
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
                      className="linkbtn"
                      onClick={() => window.location.reload()}
                    >
                      Reload
                    </button>
                  </p>
                ) : (
                  <p className="cap" style={{ margin: 0 }}>
                    Nothing to pay right now.
                  </p>
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
                <table className="tbl wide">
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
                      (invoices ?? []).map((inv) => {
                        const paid = inv.status === "paid";
                        const invSt = invoiceStatusView(inv.status, {
                          customer: true,
                        });
                        const invSym =
                          invCurrency(inv) === "USD" ? "$" : "€";
                        return (
                          <tr key={inv.id}>
                            {/* Client code first, same shape as the bank
                                reference, so an invoice and the payment that
                                settles it carry the same prefix. */}
                            <td data-label="Invoice" style={{ fontWeight: 600 }}>
                              {formatPaymentReference(referralCode, inv.number)}
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
                                {!paid &&
                                  (inv.id === dueSubInvoice?.id ||
                                    inv.type === "ad_account_fee" ||
                                    inv.type === "manual_invoice") && (
                                  <button
                                    className="btn ghost sm"
                                    disabled={payingId === inv.id}
                                    title={
                                      canPayInvoice(inv)
                                        ? "Pay this from your wallet"
                                        : "Your wallet does not cover this yet"
                                    }
                                    onClick={() => {
                                      if (!canPayInvoice(inv)) {
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
                            : "No invoices yet. The first one arrives with your plan."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
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
                      <div>
                        <div className="t">{copy.title}</div>
                        <div className="d">{copy.description}</div>
                      </div>
                      <span className="tm">
                        {dayjs(n.created_at).fromNow()}
                      </span>
                      {!n.is_read && <span className="undot" />}
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
                <Toggle
                  label="Top-up verified"
                  desc="When a payment is credited"
                  notifType="topup_completed"
                />
                <Toggle
                  label="Invoice / fee due"
                  desc="Before your monthly fee is charged"
                  notifType="subscription_invoice"
                />
              </div>
            </div>
            <div className="card">
              <h2>
                <span
                  style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
                >
                  <Ic name="i-gift" /> Become an affiliate
                </span>
              </h2>
              <p className="cap">
                Bring other advertisers in and earn a commission on what they
                  spend. Apply here and we&apos;ll look at it.
              </p>
              <button
                className="btn ghost sm"
                onClick={() => {
                  window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                    "Affiliate program application",
                  )}&body=${encodeURIComponent(
                    "Hi PSM team, I'd like to join the affiliate program.",
                  )}`;
                }}
              >
                Apply to the affiliate program
              </button>
            </div>
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
                    <div className="a">
                      Set up on our verified
                      Business Manager.
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
                  onClick={() => {
                    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                      "Question about my account",
                    )}`;
                  }}
                >
                  <Ic name="i-mail" /> Message your manager
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
          "We couldn't check for pending transfers"
        ) : pending > 0 ? (
          <>
            <b>
              {sym}
              {Math.round(pending).toLocaleString("en-US")}
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
  const { isEnabled, setPreference } = useNotificationPreferences();
  const on = isEnabled(notifType);
  return (
    <div className="toggle-row">
      <div>
        <div className="t">{label}</div>
        <div className="d">{desc}</div>
      </div>
      <button
        className={`sw${on ? " on" : ""}`}
        disabled={setPreference.isPending}
        onClick={() => setPreference.mutate({ type: notifType, enabled: !on })}
        aria-label={label}
      />
    </div>
  );
}
