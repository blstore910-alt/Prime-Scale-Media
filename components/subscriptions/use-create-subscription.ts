import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Subscription } from "./types";
import dayjs from "dayjs";

type CreateSubscriptionInput = {
  advertiser_id: string;
  currency: "EUR" | "USD";
  amount: number;
  start_date: string;
};

export default function useCreateSubscription() {
  const { profile } = useAppContext();
  const queryClient = useQueryClient();

  const mutation = useMutation<Subscription, Error, CreateSubscriptionInput>({
    mutationKey: ["create-subscription", profile?.tenant_id],
    mutationFn: async (values) => {
      const tenantId = profile?.tenant_id;

      if (!tenantId) {
        throw new Error("Tenant is missing for this profile.");
      }

      const supabase = createClient();

      const { data: existingSubscription, error: checkError } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("advertiser_id", values.advertiser_id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (checkError) {
        throw checkError;
      }

      if (existingSubscription) {
        throw new Error(
          "A subscription for this advertiser already exists with active status.",
        );
      }

      const payload = {
        advertiser_id: values.advertiser_id,
        tenant_id: tenantId,
        currency: values.currency,
        amount: Number(values.amount),
        start_date: values.start_date,
        status: "inactive" as const,
        next_payment_date: dayjs(values.start_date)
          .add(1, "month")
          .toISOString(),
      };

      const { data, error } = await supabase
        .from("subscriptions")
        .insert(payload)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return data as Subscription;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["subscriptions", profile?.tenant_id],
      });
    },
  });

  return {
    ...mutation,
    createSubscription: mutation.mutate,
  };
}
