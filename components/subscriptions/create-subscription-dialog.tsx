"use client";

import InputField from "@/components/form/input-field";
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
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import dayjs from "dayjs";
import { useEffect } from "react";
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

const subscriptionFormSchema = z.object({
  advertiser_id: z.string().min(1, "Advertiser is required"),
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

  const { control, handleSubmit, reset } = useForm<SubscriptionFormValues>({
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
        toast.success("Subscription created successfully.");
        reset(getDefaultValues());
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

          <InputField
            label="Amount (€)"
            name="amount"
            id="subscription-amount"
            type="number"
            min={0}
            step="0.01"
            control={control}
          />

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
