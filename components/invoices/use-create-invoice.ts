import { createInvoiceAsAdmin } from "@/actions/invoice-actions";
import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export type CreateInvoiceInput = {
  advertiser_id: string;
  currency: "EUR" | "USD";
  amount: number;
  description?: string;
};

export default function useCreateInvoice() {
  const { profile } = useAppContext();
  const queryClient = useQueryClient();

  const mutation = useMutation<{ id: string }, Error, CreateInvoiceInput>({
    mutationKey: ["create-invoice", profile?.tenant_id],
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
      const description =
        values.description?.trim() || "Additional Advertising Access";
      const result = await createInvoiceAsAdmin({
        company_id: company.id,
        advertiser_id: values.advertiser_id,
        total: amount,
        type: "manual_invoice",
        currency: values.currency,
        items: [
          {
            tax: 0,
            name: description,
            rate: amount,
            amount,
            currency: values.currency,
            quantity: 1,
          },
        ],
      });
      if (!result.ok) throw new Error(result.error);
      return result.data;
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
