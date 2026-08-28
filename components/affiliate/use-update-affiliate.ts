"use client";

import { updateAffiliate as updateAffiliateAction } from "@/actions/admin-actions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Affiliate } from "@/lib/types/affiliate";

export default function useUpdateAffiliate() {
  const queryClient = useQueryClient();

  const { mutate: updateAffiliate, isPending } = useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string;
    } & Partial<Affiliate>) => {
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
