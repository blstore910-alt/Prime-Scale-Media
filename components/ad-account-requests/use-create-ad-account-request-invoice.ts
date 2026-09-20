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

      // ── DO NOT MINT A SECOND ONE ────────────────────────────────
      //
      // This is two writes with no transaction: the invoice, then the
      // request status. A throw on the second surfaced as "Failed to
      // create invoice" while the invoice was already live with a Pay
      // now button on the customer's billing page — so pressing the
      // button again minted a SECOND payable EUR 50 ad_account_fee
      // invoice for the same request.
      //
      // There is no unique constraint to lean on, so the check is here:
      // an unpaid ad_account_fee invoice already carrying this request
      // id means the first attempt got through and only the status
      // write failed. Fix the status, keep the invoice.
      const amount = Number(values.amount);
      const { data: already, error: alreadyError } = await supabase
        .from("invoices")
        .select("id, items")
        .eq("advertiser_id", values.advertiser_id)
        .eq("type", "ad_account_fee")
        .eq("status", "unpaid")
        // 50 was a cap on the ONLY thing standing between a customer
        // and two identical invoices. 500 is well past any real
        // backlog of unpaid fees for one advertiser.
        .limit(500);
      // ── A FAILED CHECK IS NOT "NO DUPLICATE" ──────────────────────
      //
      // The comment above says this check is the only protection --
      // "there is no unique constraint to lean on" -- and its error was
      // discarded. So a refused read made `already` null, `existing`
      // undefined, and the next line raised a SECOND payable EUR 50
      // invoice for the same request. The customer's billing page then
      // shows two, each with a live Pay now that debits their wallet,
      // and there is no undo.
      //
      // Refusing costs one retry. Charging twice costs a refund and an
      // apology.
      if (alreadyError) {
        throw new Error(
          "We couldn't check whether this request has already been invoiced, so nothing was created. Try again in a moment.",
        );
      }
      const existing = (already ?? []).find((inv) => {
        const items = (inv as { items?: unknown }).items;
        return (
          Array.isArray(items) &&
          items.some(
            (it) =>
              (it as { ad_account_request_id?: string })
                ?.ad_account_request_id === values.ad_account_request_id,
          )
        );
      });
      if (existing) {
        const fix = await setAdAccountRequestStatus(
          values.ad_account_request_id,
          "payment_pending",
        );
        if (!fix.ok) throw new Error(fix.error);
        return { id: String((existing as { id: string }).id) };
      }

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
