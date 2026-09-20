import { createClient } from "@/lib/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// ── NO IDS, BECAUSE NONE ARE SENT ───────────────────────────────────
//
// advertiser_id, tenant_id and email used to sit in this type. The RPC
// below takes none of the three -- it derives all of them from
// auth.uid() -- so they were accepted, spread into the object at the
// call site, and silently dropped. A type that names an id reads as a
// promise that the id matters, and the next person to touch the form
// has to open the RPC to find out that it does not. Worse: it reads as
// if the client chooses the advertiser, which is exactly the shape this
// codebase is trying not to have.
interface CreateAdAccountRequestPayload {
  platform: string;
  currency: string;
  timezone: string;
  website_url?: string;
  notes?: string;
  metadata: Record<string, unknown>;
}

export const useCreateAdAccountRequest = () => {
  const qc = useQueryClient();
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
      // THE SCREEN HAS TO CATCH UP WITH THE MONEY. This debits 50 EUR and
      // creates a request, and invalidated nothing — so the toast said
      // "it will appear here" and it did not, and the balance beside it
      // still showed the amount from before the charge. The advertiser
      // app is a single page whose views are CSS toggles, so nothing
      // remounts and the 30-second staleTime with refetchOnWindowFocus
      // off means it stays wrong until a hard reload. A customer whose
      // balance disagrees with what they just did checks their bank,
      // not the page.
      //
      // request-fee-preview too: a second request inside 30 seconds
      // would otherwise still read "Included in your plan — no fee"
      // after that allowance was just used up.
      qc.invalidateQueries({ queryKey: ["ad-account-requests"] });
      qc.invalidateQueries({ queryKey: ["wallet"], exact: false });
      qc.invalidateQueries({ queryKey: ["request-fee-preview"] });
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
