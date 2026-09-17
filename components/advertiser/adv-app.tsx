"use client";

import { dmSans, jakarta } from "@/lib/fonts";
import { signOutCompletely } from "@/lib/auth/sign-out";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import useAffiliateStats from "@/hooks/use-affiliate-stats";
import useNotifications from "@/components/notifications/use-notifications";
import { getNotificationCopy } from "@/components/notifications/notification-utils";
import { updateOwnProfileAndCompany } from "@/actions/company-actions";
import { getURL } from "@/lib/utils";
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
import { formatPaymentReference } from "@/lib/payment-reference";
import { effectiveMinTopup } from "@/lib/min-topup";

dayjs.extend(relativeTime);

type View =
  | "dash"
  | "wallet"
  | "accounts"
  | "requests"
  | "billing"
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

function initials(name?: string | null) {
  if (!name) return "PS";
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "PS"
  );
}

const statusBadge = (st: string | null) => {
  if (st === "active") return { cls: "ok", label: "Active" };
  if (st === "paused") return { cls: "pend", label: "Paused" };
  if (st === "pending") return { cls: "pend", label: "Setting up" };
  if (st === "banned") return { cls: "due", label: "Banned" };
  return { cls: "ok", label: st ?? "Active" };
};

export default function AdvertiserApp() {
  const { profile } = useAppContext();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("dash");
  // Where the bell was pressed from, so pressing it again returns there.
  const viewBeforeNotifs = useRef<View>("dash");
  const [navOpen, setNavOpen] = useState(false);

  const [topupOpen, setTopupOpen] = useState(false);
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

  const { requests: myRequests, isLoading: isRequestsLoading } =
    useAdAccountRequests({
      advertiserId: advertiserId ?? undefined,
      tenantId: tenantId ?? undefined,
      perPage: 50,
      enabled: !!advertiserId,
    });
  const name = (profile?.full_name as string) ?? "there";
  const firstName = name.split(" ")[0];
  const ini = initials(name);
  // Approved affiliate or not. An `active` referral_links row is the only
  // thing that makes an advertiser one.
  const { isAffiliate } = useIsAffiliate();

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
  const { data: accounts, isError: accountsError } = useQuery<AdAccount[]>({
    queryKey: ["adv-accounts", advertiserId],
    enabled: !!advertiserId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("ad_accounts")
        .select("*")
        .eq("advertiser_id", advertiserId);
      if (error) throw error;
      return (data ?? []) as AdAccount[];
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
        .select("amount, currency, status, next_payment_date")
        .eq("advertiser_id", advertiserId)
        .eq("tenant_id", tenantId)
        .order("start_date", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  // Same reason as the accounts query above: without isError a failed read
  // renders as "No wallet activity yet" to someone whose money moved this
  // morning. It also feeds pendingTopups, so a failure silently makes a
  // pending transfer disappear from the dashboard.
  const { data: activity, isError: activityError } = useQuery<
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
        .select()
        .eq("wallet_id", wallet!.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
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

  const { data: invoices, isError: invError } = useQuery<InvoiceWithRelations[]>({
    queryKey: ["adv-invoices", advertiserId, tenantId],
    enabled: !!advertiserId && !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("invoices")
        .select("id, number, total, status, paid_at, created_at, items, type")
        .eq("tenant_id", tenantId)
        .eq("advertiser_id", advertiserId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as InvoiceWithRelations[];
    },
  });

  // Advertiser-as-affiliate: their referral book (empty for a plain
  // advertiser). Shown under the "Affiliate program" view.
  const aff = useAffiliateStats({ enabled: !!advertiserId });
  const {
    notifications: notifs,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  const { data: company } = useQuery<Record<string, unknown> | null>({
    queryKey: ["adv-company", advertiserId],
    enabled: !!advertiserId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("companies")
        .select("name, vat_no, country, is_not_vat, official_email, phone, address, state, zipcode, billings(address, state, country, zipcode)")
        .eq("advertiser_id", advertiserId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Record<string, unknown> | null;
    },
  });
  const [comp, setComp] = useState({ name: "", vat_no: "", country: "" });
  const [savingComp, setSavingComp] = useState(false);
  useEffect(() => {
    if (company)
      setComp({
        name: (company.name as string) ?? "",
        vat_no: (company.vat_no as string) ?? "",
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
  const eurText = walletError ? "—" : eur(eurBal);
  const usdText = walletError ? "—" : usd(usdBal);
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
  const billing = (company?.billings as Array<Record<string, unknown>> | undefined)?.[0];
  const str2 = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const companyComplete = Boolean(
    str2(company?.name) &&
      str2(company?.official_email) &&
      str2(company?.phone) &&
      str2(company?.address) &&
      str2(company?.country) &&
      str2(company?.state) &&
      str2(company?.zipcode) &&
      (str2(company?.vat_no) || company?.is_not_vat === true) &&
      billing &&
      str2(billing.address) &&
      str2(billing.state) &&
      str2(billing.country) &&
      str2(billing.zipcode),
  );
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
  const planMoney = (v: number | string | null | undefined) =>
    planCur === "USD" ? usd(v) : eur(v);
  const planMoney2 = (v: number | string | null | undefined) =>
    (planCur === "USD" ? "$" : "€") + money2(v);

  const dueSubInvoice = (invoices ?? [])
    .filter((i) => i.status !== "paid" && i.type === "subscription")
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )[0];
  const dueSubSymbol =
    ((dueSubInvoice?.items as Array<{ currency?: string }> | undefined)?.[0]
      ?.currency ?? "EUR") === "USD"
      ? "$"
      : "€";

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
  const planPaid = (invoices ?? []).some(
    (i) => i.type === "subscription" && i.status === "paid",
  );
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
  const canRequestAccount =
    companyComplete && (planActive || (accounts ?? []).length > 0);

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
  const payInvoice = async (id: string) => {
    if (payingId) return;
    setPayingId(id);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("invoice_pay_from_wallet", {
        p_invoice_id: id,
      });
      if (error) throw error;
      toast.success("Invoice paid from your wallet.");
      queryClient.invalidateQueries({ queryKey: ["adv-invoices"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["wallet"], exact: false });
    } catch (e) {
      toast.error("Couldn't pay from wallet", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setPayingId(null);
    }
  };

  const NAV: { v: View; icon: string; label: string; aff?: boolean }[] = [
    { v: "dash", icon: "i-home", label: "Dashboard" },
    { v: "wallet", icon: "i-wallet", label: "Wallet" },
    { v: "accounts", icon: "i-ad", label: "Ad accounts" },
    { v: "requests", icon: "i-rocket", label: "Requests" },
    { v: "billing", icon: "i-receipt", label: "Billing" },
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
    const locked =
      a.status === "banned" || a.status === "paused" || a.status === "pending";
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
          <b>{a.fee ?? 0}%</b>
        </div>
        <div className="kv">
          <span>Currency</span>
          <b>{a.currency ?? "EUR"}</b>
        </div>
        {locked ? (
          <div className="acts">
            <div className={`lockmsg${a.status === "banned" ? " banned" : ""}`}>
              <Ic name={a.status === "banned" ? "i-shield" : "i-clock"} />
              {a.status === "banned"
                ? "Locked by PSM — top-ups & withdrawals are disabled."
                : a.status === "paused"
                  ? "Paused by PSM — actions are temporarily disabled."
                  : "Setting up — this account will be ready shortly."}
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
          <span className="avatar">{ini}</span>
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
              <span className="e">
                <small>Wallet</small>
                <b>{eurText}</b>
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
                <span className="avatar">{ini}</span>
                <Ic name="i-chev" />
              </button>
              {menuOpen && (
                <div className="umenu" role="menu">
                  <div className="umenu-hd">
                    {/* The avatar comes with you into the menu. Without it
                        the panel opens from a tile and then shows nothing
                        that connects it to the tile it came from. */}
                    <span className="umenu-av">{ini}</span>
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
            <OnboardingChecklist
              advertiserId={advertiserId}
              company={company ?? null}
              eurBalance={eurBal}
              usdBalance={usdBal}
              accountsCount={(accounts ?? []).length}
              onNavigate={(v) => go(v as View)}
            />
            {!companyComplete && (
              /* The app no longer blocks the door with this form, so it has
                 to say plainly why the buttons are quiet — otherwise "you can
                 look but nothing works" is just a broken app. */
              <div className="duerow">
                <span className="ai">
                  <Ic name="i-building" />
                </span>
                <span className="dtx">
                  Add your company details to top up or request an account
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
              onTopup={() => setTopupOpen(true)}
              onExchange={() => setExchangeOpen(true)}
              onOpenWallet={() => go("wallet")}
              onOpenAccounts={() => go("accounts")}
              disabled={!wallet || !companyComplete}
              loading={walletLoading}
            />
            {subscription?.amount && subscription.next_payment_date && (
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
                <span className="dtx">
                  Monthly fee <b>{planMoney(subscription.amount)}</b> · due{" "}
                  {dayjs(subscription.next_payment_date).format("D MMM")}
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
                <div className="v">{(accounts ?? []).length}</div>
                <div className="sub">
                  {(accounts ?? []).length === 0
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
                  {dueSubInvoice
                    ? `${planMoney(subscription?.amount)} outstanding`
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
                    No ad accounts yet — request your first one.
                  </p>
                )}
              </div>
            </div>
            {/* "Your wallets" used to repeat both balances and both actions
                here, a screen below the two stat tiles that already showed
                them. The hero at the top of this view is that section now. */}
          </div>

          {/* AFFILIATE PROGRAM (advertiser-as-affiliate) */}
          <div className={`view${view === "referrals" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Affiliate program</h1>
                <p>Earn on the advertisers you bring in.</p>
              </div>
            </div>
            <div className="card">
              <h2>
                  <Ic name="i-gift" /> Your referral link
                </h2>
              <p className="cap" style={{ margin: "6px 0 12px" }}>
                Anyone who signs up through your link is tracked as your
                referral.
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
                <div className="v">{aff.rows.length}</div>
              </div>
              <div className="stat">
                <div className="k">
                  <span className="ci t">
                    <Ic name="i-trend" />
                  </span>{" "}
                  Active
                </div>
                <div className="v">
                  {aff.rows.filter((r) => Number(r.topup_count) > 0).length}
                </div>
              </div>
              <div className="stat">
                <div className="k">
                  <span className="ci g">
                    <Ic name="i-wallet" />
                  </span>{" "}
                  Commission
                </div>
                <div className="v">{eur(aff.totals.earnings_eur)}</div>
              </div>
              <div className="stat">
                <div className="k">
                  <span className="ci p">
                    <Ic name="i-trend" />
                  </span>{" "}
                  Spend driven
                </div>
                <div className="v">{eur(aff.totals.spend_eur)}</div>
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
                            {eur(r.spend_eur)}
                          </td>
                          <td
                            data-label="Commission"
                            className="r mono"
                            style={{ fontWeight: 700, color: "var(--win)" }}
                          >
                            {eur(r.earnings_eur)}
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
                          No referrals yet.
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
                <p>Your money, before it goes anywhere.</p>
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
                onTopup={() => setTopupOpen(true)}
                onExchange={() => setExchangeOpen(true)}
                disabled={!wallet}
              />
              <WalletCard
                cur="usd"
                label="USD wallet"
                value={usdText}
                pending={pendingByCurrency.USD}
                onTopup={() => setTopupOpen(true)}
                onExchange={() => setExchangeOpen(true)}
                disabled={!wallet}
              />
            </div>
            {pendingTopups.length > 0 && (
              <div className="card">
                <h2>Pending top-up{pendingTopups.length > 1 ? "s" : ""}</h2>
                {pendingTopups.map((t) => (
                  <div className="list-row" key={t.id}>
                    <span
                      className="ico"
                      style={{
                        background: "var(--warn-soft)",
                        color: "var(--warn)",
                      }}
                    >
                      <Ic name="i-clock" />
                    </span>
                    <div>
                      <div style={{ fontWeight: 700 }}>
                        {t.currency === "USD" ? "$" : "€"}
                        {money2(t.amount)} · bank transfer
                      </div>
                      <div
                        style={{ color: "var(--faint)", fontSize: ".82rem" }}
                      >
                        Ref {t.reference_no ?? "—"} · awaiting verification
                      </div>
                    </div>
                    <span className="badge pend" style={{ marginLeft: "auto" }}>
                      Verifying
                    </span>
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
                                  ? ` at ${money2(x.exchange_rate)}`
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
                            {t.reference_no ?? "—"}
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
                            <span
                              className={`badge ${
                                t.status === "completed"
                                  ? "ok"
                                  : t.status === "rejected"
                                    ? "due"
                                    : "pend"
                              }`}
                            >
                              {t.status === "completed"
                                ? "Credited"
                                : t.status === "rejected"
                                  ? "Rejected"
                                  : "Pending"}
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
                            ? "We couldn't load your wallet activity — this is not an empty list. Reload to try again."
                            : "No wallet activity yet."}
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
                <p>Where your budget lives.</p>
              </div>
              {canRequestAccount ? (
                <RequestAdAccountDialog>
                  <button className="btn grad">
                    <Ic name="i-plus" /> Request ad account
                  </button>
                </RequestAdAccountDialog>
              ) : (
                <button
                  className="btn grad"
                  disabled
                  title="Your plan has to be active first — that is what your included ad accounts come from"
                >
                  <Ic name="i-plus" /> Request ad account
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
                      : invError
                        ? "We couldn't check your plan"
                        : "Activate your plan first"}
                </h3>
                <p>
                  {accountsError
                    ? "This is not an empty list — the request failed. Reload to try again."
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

          {/* REQUESTS */}
          <div className={`view${view === "requests" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Requests</h1>
                <p>Track your ad-account requests.</p>
              </div>
              <RequestAdAccountDialog>
                <button className="btn grad">
                  <Ic name="i-plus" /> New request
                </button>
              </RequestAdAccountDialog>
            </div>
            {myRequests.length ? (
              <div className="card" style={{ padding: "16px 8px 8px" }}>
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
                    : "No requests yet. Use Request ad account to start one — we set it up on our verified Business Manager."}
                </p>
              </div>
            )}
          </div>

          {/* BILLING */}
          <div className={`view${view === "billing" ? " on" : ""}`}>
            <div className="phead">
              <div>
                <h1>Billing</h1>
                <p>Your plan and what you owe.</p>
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
                  {subscription?.amount
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
                  Plan changes take effect from your next billing cycle.
                </div>
              </div>
              <div className="card">
                <h2>
                  <Ic name="i-clock" /> This month
                </h2>
                <p className="cap">
                  Pay your monthly fee from your wallet, or let it auto-debit on
                  the due date.
                </p>
                {subscription?.amount && subscription.next_payment_date ? (
                  <>
                    <div className="list-row" style={{ borderTop: 0 }}>
                      <span
                        className="ico"
                        style={{
                          background: "var(--warn-soft)",
                          color: "var(--warn)",
                        }}
                      >
                        <Ic name="i-receipt" />
                      </span>
                      <div>
                        <div style={{ fontWeight: 700 }}>Monthly fee</div>
                        <div
                          style={{ color: "var(--faint)", fontSize: ".82rem" }}
                        >
                          Due{" "}
                          {dayjs(subscription.next_payment_date).format(
                            "D MMM YYYY",
                          )}{" "}
                          · {planMoney2(subscription.amount)}
                        </div>
                      </div>
                      <span
                        className="badge due"
                        style={{ marginLeft: "auto" }}
                      >
                        {dayjs(subscription.next_payment_date).fromNow()}
                      </span>
                    </div>
                    <button
                      className="btn block grad"
                      style={{ marginTop: 14 }}
                      disabled={!dueSubInvoice}
                      onClick={() => {
                        if (dueSubInvoice) payInvoice(dueSubInvoice.id);
                        else if (invError) {
                          toast.error(
                            "We couldn't load your invoices — reload before paying.",
                          );
                        } else {
                          toast.message("No unpaid subscription invoice to pay.");
                        }
                      }}
                    >
                      <Ic name="i-check" />{" "}
                      {dueSubInvoice
                        ? `Pay ${dueSubSymbol}${money2(dueSubInvoice.total)} from wallet`
                        : invError
                          ? "Couldn't load your invoices"
                          : "No subscription invoice due"}
                    </button>
                  </>
                ) : (
                  <p className="cap" style={{ margin: 0 }}>
                    No subscription due right now.
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
                      <th className="r">Amount</th>
                      <th className="r">Status</th>
                      <th className="r"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(invoices ?? []).length ? (
                      (invoices ?? []).map((inv) => {
                        const paid = inv.status === "paid";
                        const invSym =
                          ((
                            inv.items as
                              | Array<{ currency?: string }>
                              | undefined
                          )?.[0]?.currency ?? "EUR") === "USD"
                            ? "$"
                            : "€";
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
                            <td data-label="Amount" className="r mono">
                              {invSym}
                              {money2(inv.total)}
                            </td>
                            <td data-label="Status" className="r">
                              <span className={`badge ${paid ? "ok" : "due"}`}>
                                {paid ? "Paid" : "Due"}
                              </span>
                            </td>
                            <td data-label="" className="r">
                              {!paid && (
                                <button
                                  className="btn ghost sm"
                                  disabled={payingId === inv.id}
                                  onClick={() => payInvoice(inv.id)}
                                >
                                  {payingId === inv.id
                                    ? "Paying…"
                                    : "Pay now"}
                                </button>
                              )}
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
                          {invError
                            ? "We couldn't load your invoices — this is not an empty list. Reload to try again."
                            : "No invoices yet."}
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
                    <Ic name="i-bell" />
                  </span>
                  <div>
                    <div className="t">You&apos;re all caught up</div>
                    <div className="d">
                      Top-up, ad-account and billing updates will appear here.
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
                      <label>VAT / Tax ID</label>
                      <input
                        className="mono"
                        placeholder="NL0000.00.000.B00"
                        value={comp.vat_no}
                        onChange={(e) =>
                          setComp((c) => ({ ...c, vat_no: e.target.value }))
                        }
                      />
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
                  </div>
                  <button
                    className="btn sm"
                    onClick={saveCompany}
                    disabled={savingComp}
                  >
                    {savingComp ? "Saving…" : "Save company"}
                  </button>
                </div>
              </div>
              <div className="card">
                <h2>
                  <Ic name="i-bell" /> Notification preferences
                </h2>
                <p className="cap">Choose what pings you.</p>
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
                Refer other advertisers and earn commission. Apply and our team
                reviews it.
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
                <p className="cap">Your account manager is one tap away.</p>
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
        walletId={wallet?.id ?? null}
        referenceNo={wallet?.reference_no ?? null}
        // Not a constant. Before the plan is paid there is NO minimum — that
        // first payment is how the plan gets paid at all, and demanding €300
        // of someone who has put in nothing yet is the wrong way round. Once
        // it is running the floor applies. (Community is not loaded on this
        // screen yet, so NSA's 250 does not apply here — the helper handles
        // it as soon as it is passed.)
        minTopup={effectiveMinTopup({
          walletMin: wallet?.min_topup as number | null | undefined,
          planActive,
        })}
        // Their own accounts decide where the transfer goes, so the dialog
        // can work it out instead of showing every customer all three
        // beneficiary companies and asking them to route their own payment.
        accountTypeSlugs={(accounts ?? []).map((a) => a.platform)}
      />
      <WalletExchangeDialog
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
  onTopup,
  onExchange,
  disabled,
}: {
  cur: "eur" | "usd";
  label: string;
  value: string;
  /** Sent but not yet verified, in this currency. */
  pending?: number;
  onTopup: () => void;
  onExchange: () => void;
  disabled?: boolean;
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
        {pending > 0 ? (
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
        <button className="wbtn" onClick={onTopup} disabled={disabled}>
          <Ic name="i-plus" /> Top up
        </button>
        <button className="wbtn gh" onClick={onExchange} disabled={disabled}>
          <Ic name="i-swap" /> Exchange
        </button>
      </div>
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
