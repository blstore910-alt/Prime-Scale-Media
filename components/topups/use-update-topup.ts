/* eslint-disable @typescript-eslint/no-explicit-any */
import { updateTopupAsAdmin } from "@/actions/topup-actions";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function useUpdateTopup() {
  const queryClient = useQueryClient();
  const { mutate: updateTopup, isPending } = useMutation<any, Error, any>({
    mutationKey: ["update-topup"],
    mutationFn: async (data) => {
      // The topup_logs audit row is written inside updateTopupAsAdmin now,
      // with author/updated_by derived from the server session (a client
      // insert let an admin forge the author or fabricate the logged values).
      const result = await updateTopupAsAdmin(data.topupId, data.payload);
      if (!result.ok) throw new Error(result.error);
      return { id: data.topupId, ...data.payload };
    },
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["top-ups"], exact: false });
      }, 500);
    },
  });

  return { updateTopup, isPending };
}
