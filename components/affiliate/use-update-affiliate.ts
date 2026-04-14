"use client";

import { createClient } from "@/lib/supabase/client";
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
      const supabase = createClient();
      const { data, error } = await supabase
        .from("affiliates")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
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
