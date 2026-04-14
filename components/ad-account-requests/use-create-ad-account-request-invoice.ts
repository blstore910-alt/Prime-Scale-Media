import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { Invoice } from "@/lib/types/invoice-extended";
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
    Invoice,
    Error,
    CreateAdAccountRequestInvoiceInput
  >({
    mutationKey: ["create-ad-account-request-invoice", profile?.tenant_id],
    mutationFn: async (values) => {
      const tenantId = profile?.tenant_id;

      if (!tenantId) {
        throw new Error("Tenant is missing for this profile.");
      }

      const supabase = createClient();

      const { data: company, error: companyError } = await supabase
        .from("companies")
        .select("id")
        .eq("advertiser_id", values.advertiser_id)
        .maybeSingle();

      if (companyError) {
        throw companyError;
      }

      if (!company?.id) {
        throw new Error("Company not found for selected advertiser.");
      }

      const amount = Number(values.amount);
      const payload = {
        tenant_id: tenantId,
        company_id: company.id,
        advertiser_id: values.advertiser_id,
        total: amount,
        sub_total: amount,
        type: "ad_account_fee",
        currency: values.currency,
        status: "unpaid",
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
      };

      const { data, error } = await supabase
        .from("invoices")
        .insert(payload)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      const { error: requestUpdateError } = await supabase
        .from("ad_account_requests")
        .update({ status: "payment_pending" })
        .eq("id", values.ad_account_request_id);

      if (requestUpdateError) {
        throw requestUpdateError;
      }

      return data as Invoice;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["invoices", profile?.tenant_id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["ad-account-requests"],
      });
    },
  });

  return {
    ...mutation,
    createInvoiceFromRequest: mutation.mutate,
  };
}
