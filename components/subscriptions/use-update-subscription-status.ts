import { setSubscriptionStatus } from "@/actions/subscription-actions";
import { useAppContext } from "@/context/app-provider";
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
      const result = await setSubscriptionStatus(subscriptionId, status);
      if (!result.ok) throw new Error(result.error);
      return null;
    },
    onMutate: ({ subscriptionId }) => {
      setPendingSubscriptionId(subscriptionId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["subscriptions", profile?.tenant_id],
      });
      // ── AND THE HEADER COUNTS, WHICH ARE A DIFFERENT KEY ─────────
      //
      // The counts live under ["subscription-status-counts", tenant]
      // with a 30s staleTime, and nothing invalidated them. Pause three
      // plans and the row badges flip immediately while the header
      // still reads "31 active" over 28 active rows -- and that header
      // is the figure the owner quotes upward.
      await queryClient.invalidateQueries({
        queryKey: ["subscription-status-counts"],
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

