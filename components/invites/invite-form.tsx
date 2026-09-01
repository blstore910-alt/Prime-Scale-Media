"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
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

const inviteBaseSchema = z.object({
  email: z.email("Please enter a valid email address"),
  role: z.enum(["advertiser", "affiliate"], {
    message: "Please select a role",
  }),
  plan_id: z.string().optional(),
  monthly_fee: z.coerce.number().min(0).optional(),
  included_ad_accounts: z.coerce.number().min(0).optional(),
  topup_fee_pct: z.coerce.number().min(0).max(100).optional(),
  send_email: z.boolean().default(true),
});

type InviteFormInput = z.input<typeof inviteBaseSchema>;
type InviteFormValues = z.output<typeof inviteBaseSchema>;

export default function InviteForm() {
  const { state, dispatch } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [emailWasSent, setEmailWasSent] = useState(false);
  const supabase = createClient();
  const { profile } = useAppContext();
  const queryClient = useQueryClient();
  const { tenant } = profile || {};

  const { data: plans } = useQuery<PlanOption[]>({
    queryKey: ["plans", "active"],
    enabled: state.inviteUserOpen,
    queryFn: async () => {
      const res = await listActivePlans();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
  });

  const form = useForm<InviteFormInput, unknown, InviteFormValues>({
    resolver: zodResolver(inviteBaseSchema),
    defaultValues: {
      email: "",
      role: "advertiser",
      plan_id: "",
      monthly_fee: undefined,
      included_ad_accounts: undefined,
      topup_fee_pct: undefined,
      send_email: true,
    },
  });

  const role = form.watch("role");
  const planId = form.watch("plan_id");

  // Pre-fill the plan fields from the chosen preset (still editable).
  useEffect(() => {
    if (!planId || !plans) return;
    const p = plans.find((x) => x.id === planId);
    if (!p) return;
    form.setValue("monthly_fee", p.monthly_fee);
    form.setValue("included_ad_accounts", p.included_ad_accounts);
    form.setValue("topup_fee_pct", p.topup_fee_pct);
  }, [planId, plans, form]);

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
      const res = await fetch("/api/send-invite", {
        body: JSON.stringify({
          email: values.email,
          role: values.role,
          tenant_id: profile?.tenant_id,
          tenant_name: tenant?.name,
          sender_profile_id: profile?.id,
          send_email: values.send_email,
          // Plan (advertiser only) — pre-filled from a preset, adjustable.
          plan_id: isAdvertiser ? values.plan_id || null : null,
          monthly_fee: isAdvertiser ? values.monthly_fee ?? null : null,
          included_ad_accounts: isAdvertiser
            ? values.included_ad_accounts ?? null
            : null,
          topup_fee_pct: isAdvertiser ? values.topup_fee_pct ?? null : null,
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
        // Always surface the unique link to copy; note whether it emailed.
        setCreatedLink((data.inviteLink as string) ?? null);
        setEmailWasSent(data.emailSent === true);
        toast.success(data.message);
      }
    } catch (error) {
      console.error(error);
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite a Member</DialogTitle>
          <DialogDescription>
            Invite someone to your organization. For advertisers, pick a plan
            or community to pre-fill their fees (editable).
          </DialogDescription>
        </DialogHeader>

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

            {/* Plan (advertiser only) */}
            {role === "advertiser" && (
              <div className="rounded-md border p-3 space-y-3">
                <div>
                  <Label htmlFor="invite-plan" className="mb-2">
                    Plan / community
                  </Label>
                  <Controller
                    control={form.control}
                    name="plan_id"
                    render={({ field }) => (
                      <Select
                        value={field.value || ""}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger id="invite-plan">
                          <SelectValue placeholder="Pick a plan to pre-fill" />
                        </SelectTrigger>
                        <SelectContent>
                          {(plans ?? []).map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} · {p.kind} · {p.currency}
                              {p.monthly_fee}/mo · {p.included_ad_accounts}{" "}
                              incl · {p.topup_fee_pct}%
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Monthly fee</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      {...form.register("monthly_fee")}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Included accts</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      {...form.register("included_ad_accounts")}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Topup fee %</Label>
                    <Input
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
              </div>
            )}

            {/* Email toggle */}
            <label className="flex items-center gap-2 text-sm">
              <Controller
                control={form.control}
                name="send_email"
                render={({ field }) => (
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                  />
                )}
              />
              Also email the invite (otherwise just get the link)
            </label>

            {/* Created invite link — always shown after creation */}
            {createdLink && (
              <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
                <p className="text-xs">
                  {emailWasSent
                    ? "Invite emailed. You can also share this link:"
                    : "Invite created. Share this unique link:"}
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
            )}

            <DialogFooter>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send />
                )}
                {createdLink ? "Create another" : "Create invite"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
