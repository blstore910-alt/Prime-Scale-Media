"use client";

import { safeErrorMessage } from "@/lib/pure-error";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
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

const inviteBaseSchema = z.object({
  email: z.email("Please enter a valid email address"),
  role: z.enum(["advertiser", "affiliate"], {
    message: "Please select a role",
  }),
  plan_id: z.string().optional(),
  community_id: z.string().optional(),
  affiliate_id: z.string().optional(),
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

  function prefillFrom(p: PlanOption | undefined) {
    if (!p) return;
    const base = String(p.currency).toUpperCase() === "USD" ? "USD" : "EUR";
    setPlanCurrency(base);
    form.setValue("monthly_fee", planPrice(p, base, "month").amount);
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
          monthly_fee: isAdvertiser ? values.monthly_fee ?? null : null,
          included_ad_accounts: isAdvertiser
            ? values.included_ad_accounts ?? null
            : null,
          topup_fee_pct: isAdvertiser ? values.topup_fee_pct ?? null : null,
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
                      await navigator.clipboard.writeText(createdLink);
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
                  form.reset();
                }}
              >
                Create another
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setCreatedLink(null);
                  form.reset();
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

            {/* Plan / community / referrer (advertiser only) */}
            {role === "advertiser" && (
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
                        const price = p ? planPrice(p, c, "month") : null;
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => {
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
                            {c === "USD" ? "$" : "€"}
                            {price ? price.amount : "—"}
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
                      step="1"
                      {...form.register("monthly_fee")}
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
                      {...form.register("included_ad_accounts")}
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
                      step="0.1"
                      {...form.register("topup_fee_pct")}
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
                    <p className="mt-1 text-xs text-muted-foreground">
                      Linked as their affiliate on signup; earns commission on
                      their topups. Only a super-admin can set this.
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
