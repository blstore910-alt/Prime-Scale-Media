import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExtraAdAccount } from "./types";

type CreateExtraAdAccountInput = {
  advertiser_id: string;
  amount: number;
};

export default function useCreateExtraAdAccount() {
  const { profile } = useAppContext();
  const queryClient = useQueryClient();

  const mutation = useMutation<ExtraAdAccount, Error, CreateExtraAdAccountInput>(
    {
      mutationKey: ["create-extra-ad-account", profile?.tenant_id],
      mutationFn: async (values) => {
        const tenantId = profile?.tenant_id;

        if (!tenantId) {
          throw new Error("Tenant is missing for this profile.");
        }

        const supabase = createClient();
        const payload = {
          advertiser_id: values.advertiser_id,
          tenant_id: tenantId,
          amount: Number(values.amount),
        };

        const { data, error } = await supabase
          .from("extra_ad_accounts")
          .insert(payload)
          .select(
            "*, advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email))",
          )
          .single();

        if (error) {
          throw error;
        }

        return data as ExtraAdAccount;
      },
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: ["extra-ad-accounts", profile?.tenant_id],
        });
      },
    },
  );

  return {
    ...mutation,
    createExtraAdAccount: mutation.mutate,
  };
}
