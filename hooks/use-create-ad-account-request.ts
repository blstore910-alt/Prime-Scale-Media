import { createClient } from "@/lib/supabase/client";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

interface CreateAdAccountRequestPayload {
  advertiser_id: string | null;
  tenant_id: string;
  email: string;
  platform: string;
  currency: string;
  timezone: string;
  website_url?: string;
  notes?: string;
  metadata: Record<string, unknown>;
}

export const useCreateAdAccountRequest = () => {
  return useMutation({
    mutationFn: async (payload: CreateAdAccountRequestPayload) => {
      const supabase = createClient();

      // Server-side RPC: derives advertiser/tenant/email from the caller,
      // charges the €50 request fee from the wallet, then creates the
      // request — no raw client insert, no client-supplied ids.
      const { data, error } = await supabase.rpc(
        "ad_account_request_create_paid",
        {
          p_platform: payload.platform,
          p_currency: payload.currency,
          p_timezone: payload.timezone,
          p_website_url: payload.website_url || null,
          p_notes: payload.notes || null,
          p_metadata: payload.metadata ?? {},
        },
      );

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    onSuccess: () => {
      toast.success(
        "Ad Account Request submitted — the fee was charged to your wallet.",
      );
    },
    onError: (error) => {
      toast.error(error.message || "Failed to submit request");
    },
  });
};
