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

      const { data, error } = await supabase
        .from("ad_account_requests")
        .insert([
          {
            advertiser_id: payload.advertiser_id,
            tenant_id: payload.tenant_id,
            email: payload.email,
            platform: payload.platform,
            currency: payload.currency,
            timezone: payload.timezone,
            website_url: payload.website_url || null,
            notes: payload.notes || null,
            metadata: payload.metadata,
            status: "pending",
          },
        ])
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    onSuccess: () => {
      toast.success("Ad Account Request submitted successfully!");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to submit request");
    },
  });
};
