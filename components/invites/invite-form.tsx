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
import { Loader2, Send } from "lucide-react";
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

  const { data: plans } = useQuery<PlanOption[]>({
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
  const { data: advertisers } = useQuery<AdvertiserOption[]>({
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

      if (values.email === user.user?.user_metadata.email) {
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
        toast.success(data.message);
      }
    } catch (error) {
      console.error(safeErrorMessage(error));
      toast.error(error instanceof Error ? error.message : "");
    } finally {
      setLoading(false);
    }
  }

  const nextClientCode = String((tenant?.last_client_code as number) + 1).padStart(
    6,
    "0",
  );

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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite a Member</DialogTitle>
          <DialogDescription>
            Invite someone to your organization. For advertisers, a plan is
            pre-filled (Prime by default); a community overrides it, and you can
            still edit the fees by hand.
          </DialogDescription>
        </DialogHeader>

        {createdLink ? (
          <div className="space-y-4">
            <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
              <p className="text-sm font-medium">
                {emailWasSent ? "Invite emailed ✓" : "Invite created ✓"} — share
                this link:
              </p>
              <div className="flex items-center gap-2">
                <InputGroupInput
                  readOnly
                  value={createdLink}
                  className="text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      if (!(await copyText(createdLink))) throw new Error("copy refused");
                      toast.success("Link copied");
                    } catch {
                      toast.error("Couldn't copy — select manually");
                    }
                  }}
                >
                  Copy
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
            <div>
              <Label className="mb-2">Assigned Client Code</Label>
              <InputGroup className="cursor-not-allowed">
                <InputGroupAddon className="border-r pr-2">
                  {tenant?.initials}
                </InputGroupAddon>
                <InputGroupInput value={nextClientCode} disabled />
              </InputGroup>
            </div>

            <InputField
              control={form.control}
              id="invite-email"
              name="email"
              label="Email"
              placeholder="user@example.com"
              type="email"
            />

            <div>
              <Label htmlFor="invite-role" className="mb-2">
                Role
              </Label>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="invite-role">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="advertiser">Advertiser</SelectItem>
                      <SelectItem value="affiliate">Affiliate</SelectItem>
                    </SelectContent>
                  </Select>
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
            {role === "advertiser" && isSuperAdmin && (
              <div className="rounded-md border p-3 space-y-3">
                {/* Plan (tier) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="invite-plan">Plan</Label>
                    {planId && (
                      <button
                        type="button"
                        className="text-xs text-primary underline"
                        onClick={() => form.setValue("plan_id", "")}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <Controller
                    control={form.control}
                    name="plan_id"
                    render={({ field }) => (
                      <Select
                        value={field.value || ""}
                        onValueChange={(v) => {
                          field.onChange(v);
                          // Plan and community are mutually exclusive.
                          form.setValue("community_id", "");
                        }}
                      >
                        <SelectTrigger id="invite-plan">
                          <SelectValue placeholder="Pick a plan" />
                        </SelectTrigger>
                        <SelectContent>
                          {tiers.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} · {p.currency}
                              {p.monthly_fee}/mo · {p.included_ad_accounts} incl ·{" "}
                              {p.topup_fee_pct}%
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />

                  {/* WHICH CURRENCY THIS CUSTOMER PAYS IN.
                      The plan carries a price per currency — EUR 200 is
                      $225, not $226.14 — and until this control existed
                      there was no way to choose the second one, so a
                      pinned USD price could be saved and never charged.
                      The figure beside each option is the amount that
                      will be invoiced, so nobody has to trust that the
                      conversion happened. */}
                  {planId ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Bills in
                      </span>
                      {(["EUR", "USD"] as const).map((c) => {
                        const p = tiers.find((x) => x.id === planId);
                        const price = p ? planPrice(p, c, "month", eurToUsd) : null;
                        // ── NO RATE AND NO PINNED PRICE IS NOT A PRICE ──
                        //
                        // planPrice returns the BASE amount unchanged when
                        // it has no rate to convert with — so with no
                        // active exchange rate the chip rendered "$200 ~"
                        // over the euro figure, and clicking it wrote
                        // monthly_fee 200 with plan_currency USD: a $200
                        // subscription for a EUR 200 plan, about EUR 23 a
                        // month short, for ever.
                        //
                        // "No active rate" is a state this app documents
                        // reaching — saving a rate stands the old one down
                        // first — and the top-up path REFUSES in it rather
                        // than pricing. So does this.
                        // ── A CONVERSION IS A SUGGESTION, NOT A PRICE ──
                        //
                        // This only refused when there was NO rate. With
                        // a rate present it happily wrote the converted,
                        // rounded figure into monthly_fee and shipped it
                        // as the agreed price — the only warning being a
                        // "~" whose own tooltip says "this is a
                        // conversion, not a chosen price".
                        //
                        // lib/pure-plan-price.ts states the rule that
                        // breaks: conversion is only ever a suggestion
                        // shown to the admin. And it is not an edge case
                        // — monthly_fee_usd is seeded only for USD-base
                        // plans, so every EUR plan has none until an
                        // owner pins one. At 0.86 the EUR 200 plan
                        // becomes $235 against the owner's stated $225,
                        // a different number every time the rate moves,
                        // so two customers on "the same plan" end up on
                        // different subscriptions.
                        //
                        // So: no pinned price in that currency, no chip.
                        // Pin one in Settings → Finance → Plans.
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

                {/* Community (overrides the plan) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="invite-community">
                      Community{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        (overrides plan)
                      </span>
                    </Label>
                    {communityId && (
                      <button
                        type="button"
                        className="text-xs text-primary underline"
                        onClick={() => form.setValue("community_id", "")}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <Controller
                    control={form.control}
                    name="community_id"
                    render={({ field }) => (
                      <Select
                        value={field.value || ""}
                        onValueChange={(v) => {
                          field.onChange(v);
                          // Picking a community empties the plan.
                          form.setValue("plan_id", "");
                        }}
                      >
                        <SelectTrigger id="invite-community">
                          <SelectValue placeholder="No community" />
                        </SelectTrigger>
                        <SelectContent>
                          {communities.length === 0 ? (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">
                              No communities defined
                            </div>
                          ) : (
                            communities.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} · {p.currency}
                                {p.monthly_fee}/mo · {p.included_ad_accounts} incl
                                · {p.topup_fee_pct}%
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                {/* htmlFor/id on all three. These set the advertiser's monthly
                    fee, how many ad accounts are included and the top-up fee
                    percentage — three adjacent number boxes whose labels were
                    only next to them, not bound to them. So nothing read them
                    out, and tapping a label did not focus its field, which on
                    a phone is how you hit a box this narrow. */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label htmlFor="invite-monthly-fee" className="text-xs">
                      Monthly fee
                    </Label>
                    <Input
                      id="invite-monthly-fee"
                      type="number"
                      min="0"
                      // NOT step="1": the form submits through a real
                      // <form onSubmit>, so native validation runs first,
                      // and a EUR 99.50 plan — which the Plans screen can
                      // store and a live subscription already uses — made
                      // Submit do nothing but show a browser tooltip.
                      step="0.01"
                      {...form.register("monthly_fee", BLANK_OR_NUMBER)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="invite-included-accts" className="text-xs">
                      Included accts
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
                      Topup fee %
                    </Label>
                    <Input
                      id="invite-topup-fee"
                      type="number"
                      min="0"
                      max="100"
                      // numeric(5,2) in the database, so two decimals are
                      // storable and step="0.1" refused them.
                      step="0.01"
                      {...form.register("topup_fee_pct", BLANK_OR_NUMBER)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  A subscription is auto-created on signup (0 = free, no sub).
                </p>

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
