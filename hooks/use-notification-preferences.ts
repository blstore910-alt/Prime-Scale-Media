import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { setNotificationPreference } from "@/actions/notification-preference-actions";
import type { NotificationType } from "@/lib/types/notification";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type PrefRow = { type: string; push_enabled: boolean };

/**
 * Per-user push preferences. Absence of a row means enabled (opt-out
 * model), so `isEnabled` defaults to true. Reads go direct under RLS
 * (own rows only); writes go through the owner-checked server action.
 */
export default function useNotificationPreferences() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user } = useAppContext();
  const userId = user?.id ?? null;

  const { data: prefs = [], isLoading, isError } = useQuery({
    queryKey: ["notification-preferences", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("type, push_enabled");
      if (error) throw error;
      return (data ?? []) as PrefRow[];
    },
  });

  // ── A FAILED READ IS NOT "EVERYTHING IS ON" ───────────────────────
  //
  // prefs defaulted to [] on any failure, so `disabled` was empty and
  // isEnabled() returned true for every type -- and both Settings
  // toggles rendered ON for a customer who had turned them off. They
  // then either leave them (and keep getting alerts they refused) or
  // toggle them again, writing a preference that was already there.
  //
  // isError is exported so the screen can say "we couldn't read your
  // preferences" instead of showing a state that is not theirs.
  const disabled = new Set(
    prefs.filter((p) => p.push_enabled === false).map((p) => p.type),
  );

  const isEnabled = (type: NotificationType) => !disabled.has(type);

  const setPreference = useMutation({
    mutationFn: async (vars: { type: NotificationType; enabled: boolean }) => {
      const res = await setNotificationPreference(vars.type, vars.enabled);
      if (!res.ok) throw new Error(res.error);
      return vars;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["notification-preferences", userId],
      });
    },
    onError: (err) => {
      toast.error("Couldn't save preference", {
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });

  return { isLoading, isError, isEnabled, setPreference };
}
