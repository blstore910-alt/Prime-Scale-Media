"use client";

import { copyText } from "@/lib/copy-text";
import { safeErrorMessage } from "@/lib/pure-error";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import InputField from "@/components/form/input-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { listActivePlans } from "@/actions/plan-actions";
import type { PlanOption } from "@/lib/types/plan";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "../ui/input-group";
import { Label } from "../ui/label";
import { planPrice } from "@/lib/pure-plan-price";
import useExchangeRates from "@/components/settings/finance/use-exchange-rates";

/**
 * A blank box means "not set", never 0.
 *
 * z.coerce.number() turns "" into 0, and 0 is MEANINGFUL on this form:
 * the hint under these fields says "0 = free, no sub", and the RPC that
 * creates the subscription returns without writing anything when the fee
 * is 0. So when the plans read fails and the auto-prime never runs, all
 * three boxes stay blank, the invite goes out quoting "0.00 per month",
 * and that customer is billed NOTHING for ever — while
 * included_ad_accounts = 0 also means they are charged EUR 50 for the
 * accounts they were told were included.
 *
 * setValueAs runs before the resolver, so the empty string never reaches
 * zod. The change-subscription dialog guards this exact case and says so
 * in those words; this form never got it.
 */
const BLANK_OR_NUMBER = {
  setValueAs: (v: unknown) =>
    v === "" || v === null || v === undefined ? undefined : Number(v),
};

const inviteBaseSchema = z.object({
  email: z.email("Please enter a valid email address"),
  role: z.enum(["advertiser", "affiliate"], {
    message: "Please select a role",
  }),
  plan_id: z.string().optional(),
  community_id: z.string().optional(),
  affiliate_id: z.string().optional(),
  // An empty field is NOT zero — see BLANK_OR_NUMBER at the registration
  // sites below, which is what stops "" ever reaching zod here.
  monthly_fee: z.coerce.number().min(0).optional(),
  included_ad_accounts: z.coerce.number().min(0).optional(),
  topup_fee_pct: z.coerce.number().min(0).max(100).optional(),
  send_email: z.boolean().default(true),
});

type InviteFormInput = z.input<typeof inviteBaseSchema>;
type InviteFormValues = z.output<typeof inviteBaseSchema>;

type AdvertiserOption = {
  id: string;
  tenant_client_code: string | null;
  profile: { full_name: string | null } | { full_name: string | null }[] | null;
};

function advName(p: AdvertiserOption["profile"]): string | null {
  if (Array.isArray(p)) return p[0]?.full_name ?? null;
  return p?.full_name ?? null;
}

export default function InviteForm() {
  const { state, dispatch } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [emailWasSent, setEmailWasSent] = useState(false);
  // What the done-screen says it did. Read off the form at submit time,
  // because `nextClientCode` moves on the moment the tenant row
  // refreshes and the address box is cleared for the next invite.
  const [lastInviteEmail, setLastInviteEmail] = useState("");
  const [lastClientCode, setLastClientCode] = useState("");
  const supabase = createClient();
  const { profile } = useAppContext();
  const queryClient = useQueryClient();
  const { tenant } = profile || {};

  // Super-admin = the admin who owns the tenant. Affiliate-linking (the
  // referrer field) is super-admin only.
  const isSuperAdmin = Boolean(
    profile?.role === "admin" &&
      profile?.user_id &&
      tenant?.owner_id &&
      profile.user_id === tenant.owner_id,
  );

  // ── A PLAN LIST THAT DID NOT LOAD IS NOT "NO PLANS" ──────────────
  //
  // isError was discarded here, so listActivePlans failing left `plans`
  // undefined, `tiers` empty, and the Plan dropdown opening COMPLETELY
  // BLANK -- not even the "none defined" line its sibling below gets.
  // Auto-prime then bails on `tiers.length === 0`, monthly fee, included
  // accounts and top-up fee stay empty, and nothing validates them.
  //
  // What that invite produces is the part that matters:
  // create_subscription_from_invite reads `if v_fee <= 0 then return`,
  // so NO SUBSCRIPTION IS CREATED AT ALL. The customer signs up, is
  // never invoiced, and is still charged EUR 50 for each ad account the
  // plan was supposed to include. The invite email prints only the
  // non-null plan lines, so nothing on the way out says so either.
  const { data: plans, isError: plansUnreadable } = useQuery<PlanOption[]>({
    queryKey: ["plans", "active"],
    enabled: state.inviteUserOpen,
    queryFn: async () => {
      const res = await listActivePlans();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const tiers = (plans ?? []).filter((p) => p.kind === "tier");
  const communities = (plans ?? []).filter((p) => p.kind === "community");

  // Candidate referrers = advertisers in this tenant (super-admin only).
  // isError, for the same reason as the plans read above: "we could not
  // read who could refer this customer" is not "nobody can". Sending the
  // invite without a referrer means referral_link_from_invite never runs
  // and the affiliate who brought this customer in earns nothing, with
  // nothing on any screen recording that it happened.
  const { data: advertisers, isError: advertisersUnreadable } =
    useQuery<AdvertiserOption[]>({
    queryKey: ["advertisers", tenant?.id, "invite-referrer"],
    enabled: state.inviteUserOpen && isSuperAdmin && !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advertisers")
        .select("id, tenant_client_code, profile:user_profiles(full_name)")
        .eq("tenant_id", tenant!.id)
        .order("tenant_client_code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AdvertiserOption[];
    },
  });

  // WHICH OF THEM ALREADY REFER SOMEBODY. The picker listed every
  // advertiser in client-code order, so the handful who actually earn
  // commission were scattered through a list of everyone — and the person
  // setting a referrer is looking for exactly those. They go first.
  const { data: affiliateIds } = useQuery<string[]>({
    queryKey: ["invite-referrer-affiliates", tenant?.id],
    enabled: state.inviteUserOpen && isSuperAdmin && !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_links")
        .select("affiliate_advertiser_id")
        .eq("tenant_id", tenant!.id)
        .not("affiliate_advertiser_id", "is", null);
      if (error) throw error;
      return Array.from(
        new Set(
          (data ?? [])
            .map(
              (r) =>
                (r as { affiliate_advertiser_id: string | null })
                  .affiliate_advertiser_id,
            )
            .filter((v): v is string => !!v),
        ),
      );
    },
  });

  // Typing narrows the list. With more than a handful of customers,
  // finding one by scrolling is the slowest part of sending an invite.
  const [referrerQuery, setReferrerQuery] = useState("");
  const referrerOptions = (() => {
    const isAff = new Set(affiliateIds ?? []);
    const needle = referrerQuery.trim().toLowerCase();
    const matches = (a: AdvertiserOption) =>
      !needle ||
      `${a.tenant_client_code ?? ""} ${advName(a.profile) ?? ""}`
        .toLowerCase()
        .includes(needle);
    const all = (advertisers ?? []).filter(matches);
    return {
      affiliates: all.filter((a) => isAff.has(a.id)),
      rest: all.filter((a) => !isAff.has(a.id)),
      total: all.length,
    };
  })();

  const form = useForm<InviteFormInput, unknown, InviteFormValues>({
    resolver: zodResolver(inviteBaseSchema),
    defaultValues: {
      email: "",
      role: "advertiser",
      plan_id: "",
      community_id: "",
      affiliate_id: "",
      monthly_fee: undefined,
      included_ad_accounts: undefined,
      topup_fee_pct: undefined,
      send_email: true,
    },
  });

  const role = form.watch("role");
  const planId = form.watch("plan_id");
  const communityId = form.watch("community_id");
  const affiliateId = form.watch("affiliate_id");
  const monthlyFee = form.watch("monthly_fee");
  const nextClientCodeRef = useRef("");
  const includedAccts = form.watch("included_ad_accounts");
  const topupFeePct = form.watch("topup_fee_pct");
  const sendEmail = form.watch("send_email");
  const emailValue = form.watch("email");

  // Fee precedence: picking a tier prefills; picking a community overrides;
  // manual edits win (nothing re-runs unless you pick again). A community
  // "takes over" simply because selecting it is the most recent action.
  // THE PLAN'S CURRENCY TRAVELS WITH ITS PRICE.
  //
  // Only the amount was carried, and the invitation's plan_currency was
  // never written at all, so create_subscription_from_invite defaulted to
  // EUR: a $225 plan became a EUR 225 subscription, invoiced in EUR and
  // collectable only from the EUR wallet. A customer who funds a USD
  // wallet then goes past_due every month and is dunned for money they
  // cannot pay with.
  const [planCurrency, setPlanCurrency] = useState<"EUR" | "USD">("EUR");

  // THE RATE, which planPrice needs to fall back on.
  //
  // Both call sites below omitted it, so a plan with no pinned USD price
  // returned the EUR amount with pinned:false — and the chip printed
  // "$200 ~" for the EUR 200 plan while the tooltip said "this is a
  // conversion". It was not a conversion; it was the euro number wearing
  // a dollar sign, and picking it would have billed $200 a month for
  // ever. The three seeded plans now have pinned prices, which hides it;
  // any new plan would have walked straight into it.
  const { exchangeRates: inviteRates } = useExchangeRates({ activeOnly: true });
  const eurToUsd = useMemo(() => {
    const row = (inviteRates ?? []).find(
      (r) => String(r.currency).toUpperCase() === "USD",
    );
    const eur = Number(row?.eur);
    return Number.isFinite(eur) && eur > 0 ? 1 / eur : null;
  }, [inviteRates]);

  function prefillFrom(p: PlanOption | undefined) {
    if (!p) return;
    const base = String(p.currency).toUpperCase() === "USD" ? "USD" : "EUR";
    setPlanCurrency(base);
    form.setValue("monthly_fee", planPrice(p, base, "month", eurToUsd).amount);
    form.setValue("included_ad_accounts", p.included_ad_accounts);
    form.setValue("topup_fee_pct", p.topup_fee_pct);
  }

  useEffect(() => {
    if (!planId) return;
    prefillFrom(tiers.find((x) => x.id === planId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, plans]);

  useEffect(() => {
    if (!communityId) return;
    prefillFrom(communities.find((x) => x.id === communityId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId, plans]);

  // Default to Prime (200/2/3%) once per open, so the standard plan is
  // pre-filled without the admin having to pick.
  const didAutoPrime = useRef(false);
  useEffect(() => {
    if (!state.inviteUserOpen) {
      didAutoPrime.current = false;
      return;
    }
    if (didAutoPrime.current || tiers.length === 0) return;
    if (form.getValues("role") !== "advertiser") return;
    if (form.getValues("plan_id") || form.getValues("community_id")) return;
    const prime =
      tiers.find((p) => /prime/i.test(p.name)) ??
      tiers.find((p) => Number(p.monthly_fee) === 200) ??
      tiers[0];
    if (prime) {
      didAutoPrime.current = true;
      form.setValue("plan_id", prime.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.inviteUserOpen, plans]);

  // ── A RESET HAS TO RESET THE THINGS THAT ARE NOT IN THE FORM ─────
  //
  // "Create another" called form.reset() and nothing else. Two pieces
  // of state live outside the form, and both survived:
  //
  //   * didAutoPrime.current — only cleared when the dialog CLOSES. So
  //     the second invite opened with plan_id "" and all three fee
  //     boxes blank, and the prime effect never re-ran. Nothing
  //     validates a fee (monthly_fee is .optional()), so it posted
  //     nulls, create_subscription_from_invite hit `if v_fee <= 0 then
  //     return` and that customer got NO SUBSCRIPTION AT ALL — free
  //     for ever, and charged EUR 50 for each ad account they were sold
  //     as included. The invite email says nothing either: the plan
  //     lines are only printed for non-null values.
  //
  //   * planCurrency — component state, and the only place it is ever
  //     shown is the "Bills in" chips, which render only when a PLAN is
  //     picked. So: pick Prime, press the USD chip, press "Create
  //     another", type 200 into the blank Monthly fee box, send. That
  //     invite carries plan_currency USD and the customer is billed
  //     USD 200 against a EUR 200 intention — invoiced and auto-debited
  //     from a USD wallet they have never funded.
  const resetForNextInvite = () => {
    form.reset();
    didAutoPrime.current = false;
    setPlanCurrency("EUR");
  };

  async function onSubmit(values: InviteFormValues) {
    try {
      form.clearErrors();
      setLoading(true);
      setCreatedLink(null);
      const { data: user } = await supabase.auth.getUser();

      if (// Both sides normalised, and `user.email` rather than the
      // user_metadata copy (which only the self-signup path writes).
      // The server lowercases and trims; this did neither, so one
      // capital letter walked straight past it -- and an invitation to
      // your own address can never be accepted ("You are already in
      // this organisation as admin") while blocking that address from a
      // real one until somebody cancels the row.
      values.email.trim().toLowerCase() ===
        (user.user?.email ?? "").trim().toLowerCase()) {
        form.setError("email", { message: `You can't send an invite to yourself` });
        return;
      }

      const isAdvertiser = values.role === "advertiser";
      // Community overrides the tier as the stored plan; fees are whatever
      // is in the (prefilled or manually-edited) fields.
      const effectivePlanId = isAdvertiser
        ? values.community_id || values.plan_id || null
        : null;
      // Whatever the admin actually picked, for the blanks below.
      const planFallback = isAdvertiser
        ? (values.community_id
            ? communities.find((x) => x.id === values.community_id)
            : tiers.find((x) => x.id === values.plan_id)) ?? null
        : null;
      const res = await fetch("/api/send-invite", {
        body: JSON.stringify({
          email: values.email,
          role: values.role,
          tenant_id: profile?.tenant_id,
          tenant_name: tenant?.name,
          sender_profile_id: profile?.id,
          send_email: values.send_email,
          // Referrer (super-admin only) — links the new advertiser to an
          // affiliate on accept.
          affiliate_id:
            isSuperAdmin && isAdvertiser ? values.affiliate_id || null : null,
          // Plan (advertiser only) — pre-filled from a preset, adjustable.
          plan_id: effectivePlanId,
          // ── A BLANK BOX MEANS "AS THE PLAN SAYS", NOT "ZERO" ───────
          //
          // These went out as null, and the RPC stores
          // `coalesce(v_inv.topup_fee_pct, 0)` into a NOT NULL DEFAULT 0
          // column. resolveEffectiveFeePct then tests `plan.topup_fee_pct
          // != null` — and 0 is not null — so the stored zero BEATS the
          // ad-account type's own default and every funding for that
          // customer is charged 0% for ever. At a 3% plan that is
          // EUR 300 per EUR 10,000 funded, silently.
          //
          // included_ad_accounts has the same shape in the other
          // direction: a blank box becomes 0 included, and they are
          // charged EUR 50 for each account that was sold to them as
          // part of the plan.
          //
          // Clearing a box is not a statement that the number is zero.
          // If a plan or community is chosen, its own figure is what the
          // blank means; type a 0 to actually mean zero.
          monthly_fee: isAdvertiser ? values.monthly_fee ?? planFallback?.monthly_fee ?? null : null,
          included_ad_accounts: isAdvertiser
            ? values.included_ad_accounts ?? planFallback?.included_ad_accounts ?? null
            : null,
          topup_fee_pct: isAdvertiser
            ? values.topup_fee_pct ?? planFallback?.topup_fee_pct ?? null
            : null,
          plan_currency: isAdvertiser ? planCurrency : null,
        }),
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || data.error);
      }

      const data = await res.json();
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["invites"] });
        setCreatedLink((data.inviteLink as string) ?? null);
        setEmailWasSent(data.emailSent === true);
        setLastInviteEmail(String(values.email ?? "").trim());
        setLastClientCode(nextClientCodeRef.current);
        toast.success(data.message);
      }
    } catch (error) {
      console.error(safeErrorMessage(error));
      toast.error(error instanceof Error ? error.message : "");
    } finally {
      setLoading(false);
    }
  }

  // FOUR, like the trigger that actually assigns it. generate_client_code
  // does `initials || lpad(next_number, 4, '0')` -- every customer in the
  // database is PSM0001..PSM0011, seven characters. This padded to six, so
  // the owner was shown PSM000012 for somebody who will be PSM0012. The
  // client code is the first half of every payment reference
  // (0012-1234567890), so it is a string that gets read out to a customer
  // and typed into a bank.
  const nextClientCode = String((tenant?.last_client_code as number) + 1).padStart(
    4,
    "0",
  );
  nextClientCodeRef.current = nextClientCode;

  // The money half only exists for an advertiser, and only the owner may
  // set it -- the server drops these fields for anybody else.
  const showTerms = role === "advertiser" && isSuperAdmin;

  // ---- WHAT WILL ACTUALLY BE WRITTEN, LINE BY LINE -----------------
  //
  // This was one dot-separated sentence and it wrapped into a wall.
  // Label on the left, value on the right: you find the one figure you
  // are checking without reading the rest.
  const summaryRows: Array<[string, string]> = (() => {
    const chosen =
      (communityId && communities.find((c) => c.id === communityId)) ||
      (planId && tiers.find((t) => t.id === planId)) ||
      null;
    const sym = planCurrency === "USD" ? "$" : "€";
    const rows: Array<[string, string]> = [];
    rows.push(["Client code", `${tenant?.initials ?? ""}${nextClientCode}`]);
    rows.push(["Role", role === "affiliate" ? "Affiliate" : "Advertiser"]);
    if (showTerms) {
      rows.push([
        communityId ? "Community" : "Plan",
        chosen ? chosen.name : "None chosen",
      ]);
      const fee = Number(monthlyFee);
      rows.push([
        "Monthly",
        Number.isFinite(fee)
          ? fee > 0
            ? `${sym}${fee}`
            : "Free — no subscription"
          : "Not set",
      ]);
      const incl = Number(includedAccts);
      rows.push([
        "Ad accounts included",
        Number.isFinite(incl) ? String(incl) : "Not set",
      ]);
      const tf = Number(topupFeePct);
      rows.push(["Top-up fee", Number.isFinite(tf) ? `${tf}%` : "Not set"]);
      const ref = affiliateId
        ? (advertisers ?? []).find((a) => a.id === affiliateId)
        : null;
      rows.push([
        "Referrer",
        ref
          ? `${ref.tenant_client_code ?? "—"} · ${advName(ref.profile) ?? "—"}`
          : "Nobody",
      ]);
    }
    rows.push([
      "Invitation",
      sendEmail === false
        ? "Not sent — you pass the link on"
        : `Emailed to ${String(emailValue ?? "").trim() || "the address above"}`,
    ]);
    return rows;
  })();

  return (
    <Dialog
      open={state.inviteUserOpen}
      onOpenChange={() => {
        // NOT WHILE IT IS BEING SENT. Escape or a click outside used to
        // close and reset this mid-POST: the invitation still commits,
        // the owner never sees the link it returned, and inviting the
        // same address again is refused with "There's already a pending
        // invitation".
        if (loading) return;
        setCreatedLink(null);
        form.reset();
        dispatch("close-invite-user");
      }}
    >
      {/* No max-h/overflow of its own: the base DialogContent already sets
          max-h-[92dvh] and overflow-y-auto, and an unprefixed 90vh here
          fought it at equal specificity — whichever Tailwind emitted
          last won, and if 90vh won the sheet was taller than the
          visible viewport and "Send invite" started below the fold on
          the longest form in the admin app. */}
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Invite a Member</DialogTitle>
          {/* Three lines of preamble above the first field pushed the form
              itself below the fold on a phone. What an admin needs to know
              here is one sentence; the rest is visible in the controls. */}
          <DialogDescription>
            Advertisers get Prime pre-filled — a community overrides it, and
            every figure stays editable.
          </DialogDescription>
        </DialogHeader>

        {createdLink ? (
          <div className="space-y-4">
            {/* ---- THE DONE STATE IS A SCREEN, NOT A NOTICE ----------
                The owner does this every day and this is the moment
                they act on: copy the link, or check it went to the
                right address. So it says WHO it went to, WHAT was
                created, and puts the link under one big button. */}
            <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                  <Check className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">
                    {emailWasSent
                      ? "Invitation sent"
                      : "Invitation ready"}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground break-words">
                    {emailWasSent ? (
                      <>
                        We emailed the link to{" "}
                        <span className="font-medium text-foreground">
                          {lastInviteEmail || "them"}
                        </span>
                        . {tenant?.initials}
                        {lastClientCode} is reserved for them.
                      </>
                    ) : (
                      <>
                        Nothing was sent. Pass this link on yourself —{" "}
                        {tenant?.initials}
                        {lastClientCode} is reserved for them.
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <InputGroupInput
                  readOnly
                  value={createdLink}
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  className="shrink-0"
                  onClick={async () => {
                    try {
                      if (!(await copyText(createdLink))) throw new Error("copy refused");
                      toast.success("Link copied");
                    } catch {
                      toast.error("Couldn't copy — select manually");
                    }
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy link
                </Button>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreatedLink(null);
                  resetForNextInvite();
                }}
              >
                Create another
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setCreatedLink(null);
                  resetForNextInvite();
                  dispatch("close-invite-user");
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* ---- WHO ON THE LEFT, WHAT THEY PAY ON THE RIGHT -------
                One long scroll put the address, the role and six money
                fields in a single column, and this form is opened every
                day. The two halves answer different questions, so they
                sit side by side and neither pushes the send button off
                the screen. On a phone it is still one column. */}
            <div
              className={
                showTerms
                  ? "grid gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:items-start"
                  : ""
              }
            >
              <div className="space-y-3">
                <InputField
                  control={form.control}
                  id="invite-email"
                  name="email"
                  label="Email"
                  placeholder="user@example.com"
                  type="email"
                />

                <div>
                  <Label className="mb-1.5">Role</Label>
                  {/* Two options is a pair of buttons, not a dropdown:
                      one press instead of open-read-pick, and both
                      choices are readable without opening anything. */}
                  <Controller
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            ["advertiser", "Advertiser"],
                            ["affiliate", "Affiliate"],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => field.onChange(value)}
                            aria-pressed={field.value === value}
                            className={
                              "rounded-md border px-3 py-2 text-sm font-medium transition-colors " +
                              (field.value === value
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-input text-muted-foreground hover:bg-muted/60")
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  />
                </div>

                <div>
                  <Label className="mb-1.5">Assigned client code</Label>
                  <InputGroup className="cursor-not-allowed">
                    <InputGroupAddon className="border-r pr-2">
                      {tenant?.initials}
                    </InputGroupAddon>
                    <InputGroupInput value={nextClientCode} disabled />
                  </InputGroup>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Given out on signup. It is the first half of every
                    payment reference.
                  </p>
                </div>

              {/* ── EMAIL IT, OR JUST GIVE ME THE LINK ────────────────
                  `send_email` has been in the schema, in the defaults and
                  in the POST body all along, and /api/send-invite has the
                  branch for it -- right down to its own reply, "Invite
                  created — share the link below." No control was ever
                  rendered, so the flag was always true and that branch was
                  unreachable. An owner who wants to hand the link over
                  themselves (a customer who reads mail somewhere else, an
                  address they are not sure of yet, a link going into a
                  chat) had no way to say so. */}
              <Controller
                control={form.control}
                name="send_email"
                render={({ field }) => (
                  <label
                    className="flex items-start gap-2.5 rounded-md border p-3 text-sm"
                    htmlFor="invite-send-email"
                  >
                    <input
                      id="invite-send-email"
                      type="checkbox"
                      className="mt-0.5"
                      checked={field.value !== false}
                      onChange={(e) => field.onChange(e.target.checked)}
                    />
                    <span>
                      <span className="font-medium">Email the invitation</span>
                      <span className="block text-xs text-muted-foreground">
                        {field.value !== false
                          ? "We send them the link."
                          : "Nothing is sent — you get the link to pass on yourself."}
                      </span>
                    </span>
                  </label>
                )}
              />
              </div>

            {/* ── PRICING IS THE OWNER'S, ON THE SCREEN TOO ──────────
                The server drops these fields for a non-owner rather
                than refusing — which is the right call for an invite,
                but it left the three fee inputs fully editable by an
                employee admin. They type EUR 200/mo, get "Invitation
                email sent", the invitation stores monthly_fee: null,
                create_subscription_from_invite sees v_fee <= 0 and
                returns, and the customer is onboarded FREE, for ever,
                with nothing reporting it. included_ad_accounts: null
                also bills them EUR 50 per extra account from day one.

                Same class as the four controls on /subscriptions that
                were hidden for this reason: a control that can only
                ever fail is not a control. */}
{showTerms && (
              <div className="space-y-4">
                {/* ---- ONE CHOICE, NOT TWO CONTROLS -------------------
                    Plan and Community were two dropdowns that clear each
                    other, under a heading saying one "overrides" the
                    other -- so the owner had to hold the rule in their
                    head and open two menus to see four options. They are
                    one list of tiles now: name, price, what is included
                    and the top-up fee, all readable without opening
                    anything, and one tap picks it. */}
                <div>
                  <div className="mb-2 flex items-baseline justify-between">
                    <Label>What they pay</Label>
                    {(planId || communityId) && (
                      <button
                        type="button"
                        className="text-xs text-primary underline"
                        onClick={() => {
                          form.setValue("plan_id", "");
                          form.setValue("community_id", "");
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {tiers.length === 0 && communities.length === 0 ? (
                    <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
                      {plansUnreadable
                        ? "We couldn't read the plans. Do NOT send this invite yet — without a plan the customer is never invoiced."
                        : "No plans defined yet."}
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        ...tiers.map((p) => ({ p, community: false })),
                        ...communities.map((p) => ({ p, community: true })),
                      ].map(({ p, community }) => {
                        const picked = community
                          ? communityId === p.id
                          : planId === p.id;
                        return (
                          <button
                            key={(community ? "c-" : "p-") + p.id}
                            type="button"
                            aria-pressed={picked}
                            onClick={() => {
                              // Picking one empties the other: that is
                              // the whole "overrides" rule, now enforced
                              // by the control instead of explained.
                              form.setValue(
                                community ? "community_id" : "plan_id",
                                p.id,
                              );
                              form.setValue(
                                community ? "plan_id" : "community_id",
                                "",
                              );
                            }}
                            className={
                              "rounded-lg border p-3 text-left transition-colors " +
                              (picked
                                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                                : "border-input hover:bg-muted/50")
                            }
                          >
                            <span className="flex items-center gap-2">
                              <span className="font-semibold">{p.name}</span>
                              {community && (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  community
                                </span>
                              )}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {p.currency}
                              {p.monthly_fee}/mo · {p.included_ad_accounts}{" "}
                              account{Number(p.included_ad_accounts) === 1 ? "" : "s"}{" "}
                              included · {p.topup_fee_pct}% top-up fee
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* WHICH CURRENCY THIS CUSTOMER PAYS IN.
                      The plan carries a price per currency -- EUR 200 is
                      $225, not $226.14 -- and the figure beside each
                      option is the amount that will be invoiced, so
                      nobody has to trust that the conversion happened.
                      A converted, unpinned figure is a suggestion and
                      not a price, so it cannot be chosen: see
                      lib/pure-plan-price.ts. */}
                  {planId ? (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Invoice in
                      </span>
                      {(["EUR", "USD"] as const).map((c) => {
                        const p = tiers.find((x) => x.id === planId);
                        const price = p ? planPrice(p, c, "month", eurToUsd) : null;
                        const isBase =
                          c ===
                          (String(p?.currency ?? "EUR").toUpperCase() === "USD"
                            ? "USD"
                            : "EUR");
                        const unpriceable = !!price && !price.pinned && !isBase;
                        return (
                          <button
                            key={c}
                            type="button"
                            disabled={unpriceable}
                            title={
                              unpriceable
                                ? "No price is set for this plan in this currency. A converted figure is a suggestion, not a price — pin one in Settings → Finance → Plans first."
                                : undefined
                            }
                            onClick={() => {
                              if (unpriceable) return;
                              setPlanCurrency(c);
                              if (price) form.setValue("monthly_fee", price.amount);
                            }}
                            className={
                              "rounded-md border px-2.5 py-1 text-xs font-medium " +
                              (planCurrency === c
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-input text-muted-foreground")
                            }
                          >
                            {unpriceable ? "" : c === "USD" ? "$" : "€"}
                            {unpriceable ? `${c} —` : price ? price.amount : "—"}
                            {price && !price.pinned ? (
                              <span
                                className="ml-1 opacity-60"
                                title="No price set for this currency — this is a conversion, not a chosen price. Set one in Settings → Finance → Plans."
                              >
                                ~
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                {/* ---- THE FIGURES, WITH THEIR UNITS ON THEM ----------
                    Three bare number boxes reading 200 / 2 / 3 said
                    nothing about what they were. They are filled from
                    the tile above and are only touched when this one
                    customer is different, so they are marked as such.

                    htmlFor/id on all three: nothing read them out, and
                    tapping a label did not focus its field, which on a
                    phone is how you hit a box this narrow. */}
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Only if this customer is different
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label htmlFor="invite-monthly-fee" className="text-xs">
                        Per month
                      </Label>
                      <InputGroup>
                        <InputGroupAddon className="border-r pr-2 text-xs">
                          {planCurrency === "USD" ? "$" : "€"}
                        </InputGroupAddon>
                        <InputGroupInput
                          id="invite-monthly-fee"
                          type="number"
                          min="0"
                          // NOT step="1": the form submits through a real
                          // <form onSubmit>, so native validation runs
                          // first, and a EUR 99.50 plan made Submit do
                          // nothing but show a browser tooltip.
                          step="0.01"
                          {...form.register("monthly_fee", BLANK_OR_NUMBER)}
                        />
                      </InputGroup>
                    </div>
                    <div>
                      <Label htmlFor="invite-included-accts" className="text-xs">
                        Accounts free
                      </Label>
                      <Input
                        id="invite-included-accts"
                        type="number"
                        min="0"
                        step="1"
                        {...form.register("included_ad_accounts", BLANK_OR_NUMBER)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="invite-topup-fee" className="text-xs">
                        Top-up fee
                      </Label>
                      <InputGroup>
                        <InputGroupInput
                          id="invite-topup-fee"
                          type="number"
                          min="0"
                          max="100"
                          // numeric(5,2) in the database, so two decimals
                          // are storable and step="0.1" refused them.
                          step="0.01"
                          {...form.register("topup_fee_pct", BLANK_OR_NUMBER)}
                        />
                        <InputGroupAddon className="border-l pl-2 text-xs">
                          %
                        </InputGroupAddon>
                      </InputGroup>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    A subscription is auto-created on signup (0 = free, no
                    sub).
                  </p>
                </div>

                {/* Referrer — super-admin only */}
                {isSuperAdmin && (
                  <div className="border-t pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <Label htmlFor="invite-referrer">
                        Referrer{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          (affiliate who referred them)
                        </span>
                      </Label>
                      {affiliateId && (
                        <button
                          type="button"
                          className="text-xs text-primary underline"
                          onClick={() => form.setValue("affiliate_id", "")}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <Controller
                      control={form.control}
                      name="affiliate_id"
                      render={({ field }) => (
                        <Select
                          value={field.value || ""}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger id="invite-referrer">
                            <SelectValue placeholder="No referrer" />
                          </SelectTrigger>
                          <SelectContent>
                            {/* stopPropagation: Radix Select has its own
                                type-ahead, which otherwise swallows every
                                keystroke meant for this box and jumps the
                                highlight around instead of filtering. */}
                            <div className="sticky top-0 z-10 bg-popover p-1">
                              <Input
                                autoFocus
                                value={referrerQuery}
                                onChange={(e) =>
                                  setReferrerQuery(e.target.value)
                                }
                                onKeyDown={(e) => e.stopPropagation()}
                                placeholder="Search code or name…"
                                className="h-8"
                              />
                            </div>
                            {referrerOptions.affiliates.length > 0 && (
                              <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Already affiliates
                              </div>
                            )}
                            {referrerOptions.affiliates.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {(a.tenant_client_code ?? "—") +
                                  " · " +
                                  (advName(a.profile) ?? "—")}
                              </SelectItem>
                            ))}
                            {referrerOptions.rest.length > 0 &&
                              referrerOptions.affiliates.length > 0 && (
                                <div className="px-2 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  Everyone else
                                </div>
                              )}
                            {referrerOptions.rest.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {(a.tenant_client_code ?? "—") +
                                  " · " +
                                  (advName(a.profile) ?? "—")}
                              </SelectItem>
                            ))}
                            {referrerOptions.total === 0 && (
                              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                                {referrerQuery.trim()
                                  ? `Nobody matches “${referrerQuery.trim()}”.`
                                  : advertisersUnreadable
                                    ? "We couldn't read the advertisers. This is NOT “there are none” — if this invite has a referrer, wait and try again."
                                    : "No advertisers to pick from yet."}
                              </div>
                            )}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {/* NOT "earns commission on their topups". Of the seven
                        commission types on the Commission Setup dialog, four
                        have nothing to do with a top-up: One Time, Monthly
                        Fixed, and the two combinations built on them. Naming
                        one of them here tells the owner the wrong thing about
                        the other six, and top-ups are the one thing the
                        affiliate copy must not promise. */}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Linked as their affiliate on signup, and paid on whatever
                      terms are set under Commission. Only a super-admin can set
                      this.
                    </p>
                  </div>
                )}
              </div>
              )}
            </div>

            {/* ---- ONE SENTENCE OF WHAT IS ABOUT TO BE CREATED -----
                Plan, community and the three overrides can all say
                something different, and the owner had to assemble the
                answer in their head every time. This reads back what
                will actually be written. */}
            <div className="rounded-lg border bg-muted/40 px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                About to create
              </span>
              <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {summaryRows.map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-1 last:border-0 sm:border-0 sm:pb-0"
                  >
                    <dt className="shrink-0 text-muted-foreground">{k}</dt>
                    <dd className="min-w-0 truncate text-right font-medium">
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send />
                )}
                Create invite
              </Button>
            </DialogFooter>
          </form>
        </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
