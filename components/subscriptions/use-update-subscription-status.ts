import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SubscriptionStatus } from "./types";

type UpdateSubscriptionStatusInput = {
  subscriptionId: string;
  status: SubscriptionStatus;
};

export default function useUpdateSubscriptionStatus() {
  const { profile } = useAppContext();
  const queryClient = useQueryClient();
  const [pendingSubscriptionId, setPendingSubscriptionId] = useState<
    string | null
  >(null);

  const mutation = useMutation<unknown, Error, UpdateSubscriptionStatusInput>({
    mutationKey: ["update-subscription-status", profile?.tenant_id],
    mutationFn: async ({ subscriptionId, status }) => {
      const tenantId = profile?.tenant_id;

      if (!tenantId) {
        throw new Error("Tenant is missing for this profile.");
      }

      const supabase = createClient();
      const { data, error } = await supabase
        .from("subscriptions")
        .update({ status })
        .eq("id", subscriptionId)
        .eq("tenant_id", tenantId)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return data;
    },
    onMutate: ({ subscriptionId }) => {
      setPendingSubscriptionId(subscriptionId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["subscriptions", profile?.tenant_id],
      });
    },
    onSettled: () => {
      setPendingSubscriptionId(null);
    },
  });

  return {
    ...mutation,
    updateSubscriptionStatus: mutation.mutate,
    pendingSubscriptionId,
  };
}

