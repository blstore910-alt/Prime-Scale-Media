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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => {
      toast.error(`Something went wrong`, { description: err.message });
    },
  });

  return { updateUserProfile, isPending };
}
