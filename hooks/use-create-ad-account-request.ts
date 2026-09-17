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
        // Not "the fee was charged": the RPC sets the fee to 0 and debits
        // nothing when the request is covered by the plan or a perk, and the
        // form said "Included in your plan — no fee" one tap earlier. Two
        // contradictory statements in five seconds is how a customer ends up
        // checking their balance instead of trusting the screen.
        "Request sent — we'll set the account up and it will appear here.",
      );
    },
    onError: (error) => {
      toast.error(error.message || "Failed to submit request");
    },
  });
};
