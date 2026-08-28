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
    },
  });

  return {
    ...mutation,
    createSubscription: mutation.mutate,
  };
}
