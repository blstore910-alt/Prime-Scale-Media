import {
  setAdvertiserCommission,
  updateAdvertiser as updateAdvertiserAction,
} from "@/actions/admin-actions";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// Two actions on the server (annotation vs commission) — one hook on
// the client. This hook splits the payload and routes each half to
// the correct endpoint, so the caller's UX stays "save the whole
// dialog" while the authority split is enforced by the server.
type AnnotationFields = {
  startup_fee?: number;
  fee_status?: string;
  airtable?: boolean;
  note?: string;
};

type CommissionFields = {
  commission_type?: string | null;
  commission_pct?: number | null;
  commission_onetime?: number | null;
  commission_monthly?: number | null;
  commission_currency?: string | null;
};

type UpdatePayload = {
  id: string;
  payload: Partial<AnnotationFields & CommissionFields>;
};

const COMMISSION_KEYS: (keyof CommissionFields)[] = [
  "commission_type",
  "commission_pct",
  "commission_onetime",
  "commission_monthly",
  "commission_currency",
];

export default function useUpdateAdvertiser() {
  const queryClient = useQueryClient();
  const { mutate: updateAdvertiser, isPending } = useMutation<
    unknown,
    Error,
    UpdatePayload
  >({
    mutationFn: async ({ id, payload }) => {
      const annotation: AnnotationFields = {};
      const commission: CommissionFields = {};
      for (const [k, v] of Object.entries(payload)) {
        if ((COMMISSION_KEYS as string[]).includes(k)) {
          (commission as Record<string, unknown>)[k] = v;
        } else {
          (annotation as Record<string, unknown>)[k] = v;
        }
      }

      if (Object.keys(annotation).length > 0) {
        const res = await updateAdvertiserAction(id, annotation);
        if (!res.ok) throw new Error(res.error);
      }
      if (Object.keys(commission).length > 0) {
        const res = await setAdvertiserCommission(id, commission);
        if (!res.ok) throw new Error(res.error);
      }
      return null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });
  return { updateAdvertiser, isPending };
}
