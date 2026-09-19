import { createClient } from "@/lib/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type CurrencyCode = "USD" | "EUR";

type FormValues = {
  account_id: string;
  currency: CurrencyCode;
  amount: number;
};

type UseCreateAccountTopupOptions = {
  onSuccess: () => void;
};

export function useCreateAccountTopup({
  onSuccess,
}: UseCreateAccountTopupOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["create-ad-account-topup"],
    mutationFn: async (values: FormValues) => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("top_up_create_for_advertiser", {
        p_account_id: values.account_id,
        p_currency: values.currency,
        p_amount_received: values.amount,
        p_type: "top-up",
        p_payment_slip: null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      toast.success(// NOT "requested". There is no approval step on this one: the money
      // is out of the wallet by the time this toast renders, and it only
      // comes back through a withdrawal WE have to approve. The
      // confirmation inside the same dialog says so plainly; the title,
      // the description and this toast all promised an approval that
      // does not exist.
      "Sent to your ad account");
      queryClient.invalidateQueries({ queryKey: ["top-ups"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["wallet"], exact: false });
      onSuccess();
    },
    onError: (err: Error) => {
      toast.error("Unable to request topup", {
        description: err.message,
      });
    },
  });
}
