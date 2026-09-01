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
      ]);
    },
    onError: (err) => {
      toast.error(`Something went wrong`, { description: err.message });
    },
  });

  return { updateUserProfile, isPending };
}
