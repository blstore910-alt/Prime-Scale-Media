import { createSubscriptionAsAdmin } from "@/actions/subscription-actions";
import { useAppContext } from "@/context/app-provider";
import { useMutation, useQueryClient } from "@tanstack/react-query";

type CreateSubscriptionInput = {
  advertiser_id: string;
  currency: "EUR" | "USD";
  amount: number;
  start_date: string;
};

export default function useCreateSubscription() {
  const { profile } = useAppContext();
  const queryClient = useQueryClient();

  const mutation = useMutation<{ id: string }, Error, CreateSubscriptionInput>({
    mutationKey: ["create-subscription", profile?.tenant_id],
    mutationFn: async (values) => {
      const result = await createSubscriptionAsAdmin(values);
      if (!result.ok) throw new Error(result.error);
      return result.data;
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
  });

  return {
    ...mutation,
    createSubscription: mutation.mutate,
  };
}
