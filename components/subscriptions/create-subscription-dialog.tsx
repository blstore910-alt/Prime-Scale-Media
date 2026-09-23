"use client";

import SelectField from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { CURRENCIES } from "@/lib/constants";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { Controller, Resolver, useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";
import useCreateSubscription from "./use-create-subscription";
import { getTodayDateValue } from "./subscription-utils";
import SubscriptionDatePicker from "./subscription-date-picker";

type AdvertiserQueryRow = {
  id: string;
  tenant_client_code: string | null;
  profile: { full_name: string | null } | { full_name: string | null }[] | null;
};

// A plan/community preset the admin can pick to pre-fill the amount.
type PlanPreset = {
  id: string;
  name: string;
  kind: string;
  monthly_fee: number | string | null;
  currency: string | null;
};

const subscriptionFormSchema = z.object({
  advertiser_id: z.string().min(1, "Advertiser is required"),
  currency: z.enum(["EUR", "USD"]),
  amount: z.coerce.number().gt(0, "Amount must be greater than 0"),
  start_date: z
    .string()
    .min(1, "Start date is required")
    .refine(
      (value) =>
        !dayjs(value).startOf("day").isBefore(dayjs().startOf("day"), "day"),
      "Start date cannot be before today",
    ),
});

type SubscriptionFormValues = z.infer<typeof subscriptionFormSchema>;

function getAdvertiserName(
  profile: AdvertiserQueryRow["profile"],
): string | null {
  if (Array.isArray(profile)) {
    return profile[0]?.full_name ?? null;
  }

  return profile?.full_name ?? null;
}

function getDefaultValues(): SubscriptionFormValues {
  return {
    advertiser_id: "",
    currency: "EUR",
    amount: 0,
    start_date: getTodayDateValue(),
  };
}

export default function CreateSubscriptionDialog({
  open,
  onOpenChange,
  defaultAdvertiserId,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  defaultAdvertiserId?: string;
}) {
  const { profile } = useAppContext();
  const { createSubscription, isPending } = useCreateSubscription();

  const defaultValues = getDefaultValues();
  if (defaultAdvertiserId) {
    defaultValues.advertiser_id = defaultAdvertiserId;
  }

  const [planId, setPlanId] = useState("");

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<SubscriptionFormValues>({
    defaultValues,
    resolver: zodResolver(
      subscriptionFormSchema,
    ) as Resolver<SubscriptionFormValues>,
  });

  // Update form when defaultAdvertiserId changes
  useEffect(() => {
    const newDefaultValues = getDefaultValues();
    if (defaultAdvertiserId) {
      newDefaultValues.advertiser_id = defaultAdvertiserId;
    }
    reset(newDefaultValues);
    setPlanId("");
  }, [defaultAdvertiserId, reset]);

  const {
    data: advertisers = [],
    isLoading: isAdvertisersLoading,
    isError: isAdvertisersError,
    error: advertisersError,
  } = useQuery<AdvertiserQueryRow[]>({
    queryKey: ["advertisers", profile?.tenant_id, "subscriptions"],
    enabled: profile?.role === "admin" && !!profile?.tenant_id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertisers")
        .select("id, tenant_client_code, profile:user_profiles(full_name)")
        .eq("tenant_id", profile?.tenant_id)
        .order("tenant_client_code", { ascending: true });

      if (error) {
        throw error;
      }

      return (data ?? []) as AdvertiserQueryRow[];
    },
  });

  const { data: plans = [] } = useQuery<PlanPreset[]>({
    queryKey: ["plans", profile?.tenant_id, "sub-preset"],
    enabled: profile?.role === "admin" && !!profile?.tenant_id,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("plans")
        .select("id, name, kind, monthly_fee, currency")
        .eq("tenant_id", profile?.tenant_id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanPreset[];
    },
  });

  const applyPlan = (id: string) => {
    setPlanId(id);
    const p = plans.find((pl) => pl.id === id);
    if (!p) return;
    setValue("amount", Number(p.monthly_fee) || 0);
    if (p.currency === "EUR" || p.currency === "USD") {
      setValue("currency", p.currency);
    }
  };

  const currencyOptions = CURRENCIES.filter((currency) =>
    ["EUR", "USD"].includes(currency.value),
  );

  const advertiserOptions = advertisers.map((advertiser) => {
    const fullName = getAdvertiserName(advertiser.profile) ?? "-";

    return {
      value: advertiser.id,
      label: (
        <span className="inline-flex w-full justify-between">
          <span>{advertiser.tenant_client_code ?? "-"}</span>
          <span className="ml-2">{fullName}</span>
        </span>
      ),
    };
  });

  const onSubmit = (values: SubscriptionFormValues) => {
    createSubscription(values, {
      onSuccess: () => {
        // It is created INACTIVE - subscription-actions.ts writes
        // status:"inactive", and its own comment says the billing run
        // only collects active and past_due. So "created successfully"
        // over a row showing the amount in bold read as a running plan
        // that bills nothing, indefinitely, until somebody opened
        // /subscriptions and activated it.
        toast.success("Subscription created - not billing yet", {
          description:
            "It starts inactive. Activate it on the Subscriptions screen to begin invoicing.",
        });
        reset(getDefaultValues());
        setPlanId("");
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error("Failed to create subscription", {
          description: error.message,
        });
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          const resetValues = getDefaultValues();
          if (defaultAdvertiserId) {
            resetValues.advertiser_id = defaultAdvertiserId;
          }
          reset(resetValues);
          setPlanId("");
        }
        onOpenChange(value);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Subscription</DialogTitle>
          <DialogDescription>
            Add a subscription for one advertiser.
          </DialogDescription>
        </DialogHeader>

        <form
          id="subscription-form"
          className="space-y-4"
          onSubmit={handleSubmit(onSubmit)}
        >
          <SelectField
            label="Select Advertiser"
            name="advertiser_id"
            id="subscription-advertiser-select"
            control={control}
            options={advertiserOptions}
            placeholder={
              isAdvertisersLoading ? "Loading advertisers..." : "Select"
            }
            disabled={isAdvertisersLoading || isAdvertisersError}
          />

          {isAdvertisersError && (
            <p className="text-sm text-destructive">
              {advertisersError instanceof Error
                ? advertisersError.message
                : "Failed to load advertisers."}
            </p>
          )}

          {plans.length > 0 && (
            <Field>
              <FieldLabel htmlFor="subscription-plan-select">
                Plan (optional)
              </FieldLabel>
              <Select value={planId} onValueChange={applyPlan}>
                <SelectTrigger
                  id="subscription-plan-select"
                  className="h-9 w-full"
                >
                  <SelectValue placeholder="Pick a plan…" />
                </SelectTrigger>
                <SelectContent position="item-aligned">
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.kind === "community" ? " · community" : ""} —{" "}
                      {p.currency ?? "EUR"} {Number(p.monthly_fee) || 0}/mo
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Fills the amount from the plan — you can still edit it.
              </p>
            </Field>
          )}

          <Field
            data-invalid={Boolean(errors.amount) || Boolean(errors.currency)}
          >
            <FieldLabel htmlFor="subscription-amount">Amount</FieldLabel>
            <InputGroup className="gap-0">
              <Controller
                name="currency"
                control={control}
                render={({ field }) => (
                  <InputGroupAddon className="px-0">
                    <Select
                      name={field.name}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger
                        id="subscription-currency-select"
                        aria-invalid={Boolean(errors.currency)}
                        className="h-9 min-w-22 rounded-none border-0 bg-transparent text-left"
                      >
                        <SelectValue placeholder="EUR" />
                      </SelectTrigger>
                      <SelectContent position="item-aligned">
                        {currencyOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </InputGroupAddon>
                )}
              />

              <Controller
                name="amount"
                control={control}
                render={({ field }) => (
                  <InputGroupInput
                    {...field}
                    id="subscription-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    // Click a money box and you are typing a new amount,
                    // never appending to the old one. Without this a 0
                    // left in the field turns a typed 50 into 050.
                    onFocus={(e) => e.currentTarget.select()}
                    aria-invalid={Boolean(errors.amount)}
                    className="h-9"
                  />
                )}
              />
            </InputGroup>
            {errors.currency && <FieldError errors={[errors.currency]} />}
            {errors.amount && <FieldError errors={[errors.amount]} />}
          </Field>

          <Controller
            name="start_date"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="subscription-start-date">
                  Start Date
                </FieldLabel>
                <div id="subscription-start-date">
                  <SubscriptionDatePicker
                    value={field.value}
                    onChange={field.onChange}
                    disableBeforeToday
                    className="w-full"
                    align="start"
                  />
                </div>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </form>

        <DialogFooter>
          <Button
            form="subscription-form"
            type="submit"
            disabled={isPending || isAdvertisersLoading || isAdvertisersError}
          >
            {isPending && <Loader2 className="animate-spin" />}
            Create Subscription
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
