import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { Invoice } from "@/lib/types/invoice-extended";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export type CreateInvoiceInput = {
  advertiser_id: string;
  currency: "EUR" | "USD";
  amount: number;
};

export default function useCreateInvoice() {
  const { profile } = useAppContext();
  const queryClient = useQueryClient();

  const mutation = useMutation<Invoice, Error, CreateInvoiceInput>({
    mutationKey: ["create-invoice", profile?.tenant_id],
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
        type: "manual_invoice",
        currency: values.currency,
        status: "unpaid",
        items: [
          {
            tax: 0,
            name: "Additional Advertising Access",
            rate: amount,
            amount,
            currency: values.currency,
            quantity: 1,
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

      return data as Invoice;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["invoices", profile?.tenant_id],
      });
    },
  });

  return {
    ...mutation,
    createInvoice: mutation.mutate,
  };
}
