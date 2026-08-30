"use client";

import { updateAffiliate as updateAffiliateAction } from "@/actions/admin-actions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// Annotation-only edits: note text, airtable flag, fee_commission
// gate. Rate/amount changes go through useSetAffiliateCommission
// (super-admin only) — kept separate so this mutation stays safe
// for support-desk employees.
type AnnotationInput = {
  id: string;
  note?: string | null;
  airtable?: boolean;
  fee_commission?: boolean;
};

export default function useUpdateAffiliate() {
  const queryClient = useQueryClient();

  const { mutate: updateAffiliate, isPending } = useMutation({
    mutationFn: async ({ id, ...payload }: AnnotationInput) => {
      const result = await updateAffiliateAction(id, payload);
      if (!result.ok) throw new Error(result.error);
      return null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["affiliates"] });
      toast.success("Affiliate updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update affiliate");
    },
  });

  return { updateAffiliate, isPending };
}
