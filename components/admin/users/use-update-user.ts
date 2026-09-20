import { updateUserProfile as updateUserProfileAction } from "@/actions/admin-actions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type UpdateUserPayload = {
  userId: string;
  // fee_status / fee / airtable live on `advertisers` (edited via
  // updateAdvertiser), not user_profiles — keep them out of this payload.
  data: Partial<{
    is_active: boolean;
    status: string;
    full_name: string;
  }>;
};

export default function useUpdateUserProfile() {
  const queryClient = useQueryClient();

  const { mutate: updateUserProfile, isPending } = useMutation<
    unknown,
    Error,
    UpdateUserPayload
  >({
    mutationKey: ["update-user"],
    mutationFn: async (payload) => {
      const result = await updateUserProfileAction(payload.userId, payload.data);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["users"] }),
        queryClient.invalidateQueries({ queryKey: ["subscriptions"] }),
        // ── THE DRAWER AND THE COUNTERS READ THEIR OWN QUERIES ──────
        //
        // UserDetailsSheet reads ["user", profileId] and the "N active /
        // N deactivated" strip reads ["people-counts"]. Neither was
        // invalidated, and staleTime keeps them, so after switching a
        // customer off the drawer still said Active and the counters
        // still said 5 active -- correct only after a full reload. Two
        // screens disagreeing about whether a customer has access is
        // exactly the kind of thing somebody acts on.
        queryClient.invalidateQueries({ queryKey: ["user"] }),
        queryClient.invalidateQueries({ queryKey: ["people-counts"] }),
        queryClient.invalidateQueries({ queryKey: ["advertiser-plan-badges"] }),
      ]);
    },
    onError: (err) => {
      toast.error(`Something went wrong`, { description: err.message });
    },
  });

  return { updateUserProfile, isPending };
}
