import { setAdAccountRequestStatus } from "@/actions/ad-account-actions";
import { createInvoiceAsAdmin } from "@/actions/invoice-actions";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

type CreateAdAccountRequestInvoiceInput = {
  advertiser_id: string;
  currency: "EUR" | "USD";
  amount: number;
  ad_account_request_id: string;
};

export default function useCreateAdAccountRequestInvoice() {
  const { profile } = useAppContext();
  const queryClient = useQueryClient();

  const mutation = useMutation<
    { id: string },
    Error,
    CreateAdAccountRequestInvoiceInput
  >({
    mutationKey: ["create-ad-account-request-invoice", profile?.tenant_id],
    mutationFn: async (values) => {
      const supabase = createClient();

      const { data: company, error: companyError } = await supabase
        .from("companies")
        .select("id")
        .eq("advertiser_id", values.advertiser_id)
        .maybeSingle();
      if (companyError) throw companyError;
      if (!company?.id) {
        throw new Error("Company not found for selected advertiser.");
      }

      const amount = Number(values.amount);
      const result = await createInvoiceAsAdmin({
        company_id: company.id,
        advertiser_id: values.advertiser_id,
        total: amount,
        type: "ad_account_fee",
        currency: values.currency,
        items: [
          {
            tax: 0,
            name: "Advertising Account Purchase",
            rate: amount,
            amount,
            currency: values.currency,
            quantity: 1,
            ad_account_request_id: values.ad_account_request_id,
          },
        ],
      });
      if (!result.ok) throw new Error(result.error);

      const statusResult = await setAdAccountRequestStatus(
        values.ad_account_request_id,
        "payment_pending",
      );
      if (!statusResult.ok) throw new Error(statusResult.error);

      return result.data;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["invoices", profile?.tenant_id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["ad-account-requests"],
      });
      await queryClient.invalidateQueries({
        queryKey: [
          "ad-account-request-details",
          variables.ad_account_request_id,
        ],
      });
    },
  });

  return {
    ...mutation,
    createInvoiceFromRequest: mutation.mutate,
  };
}
