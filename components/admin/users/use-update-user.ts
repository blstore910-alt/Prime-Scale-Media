import { createClient } from "@/lib/supabase/client";
import { PostgrestError } from "@supabase/supabase-js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

const now = dayjs().utc().format("YYYY-MM-DD HH:mm:ss+00");

type UpdateUserPayload = {
  userId: string;
  data: Partial<{
    is_active: boolean;
    fee_status: string;
    fee: number;
    airtable: boolean;
    status: string;
  }>;
};

export default function useUpdateUserProfile() {
  const queryClient = useQueryClient();

  const { mutate: updateUserProfile, isPending } = useMutation<
    unknown,
    PostgrestError,
    UpdateUserPayload
  >({
    mutationKey: ["update-user"],
    mutationFn: async (payload) => {
      const supabase = createClient();
      const shouldDeactivateSubscriptions = payload.data.status === "inactive";

      if (shouldDeactivateSubscriptions) {
        const { data: advertisers, error: advertisersError } = await supabase
          .from("advertisers")
          .select("id")
          .eq("profile_id", payload.userId);

        if (advertisersError) {
          throw advertisersError;
        }

        const advertiserIds = (advertisers ?? []).map(
          (advertiser) => advertiser.id,
        );

        if (advertiserIds.length > 0) {
          const { error: subscriptionsError } = await supabase
            .from("subscriptions")
            .update({
              status: "inactive",
            })
            .in("advertiser_id", advertiserIds)
            .neq("status", "inactive");

          if (subscriptionsError) {
            throw subscriptionsError;
          }
        }
      }

      const { data, error } = await supabase
        .from("user_profiles")
        .update({
          ...payload.data,
          updated_at: now,
        })
        .eq("id", payload.userId)
        .select("*");
      if (error) throw error;

      return data;
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
