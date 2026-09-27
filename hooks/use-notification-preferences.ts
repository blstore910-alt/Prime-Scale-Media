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

  const { data: prefs = [], isPending, isError } = useQuery({
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

  // ── ONE PRESS, ONE WRITE, ONE REFETCH ────────────────────────────
  //
  // GroupToggle used to loop `setPreference.mutate` over every type in
  // the group. Measured on production 27-09, on a group of ten:
  //
  //   * ten separate round-trips, 14:30:12 to 14:30:17 -- five seconds,
  //     with the label counting down as they landed
  //   * and then it STAYED wrong. The first onSuccess invalidates, the
  //     refetch that starts reads the table while the other nine writes
  //     are still in flight, and react-query folds the later
  //     invalidations into that same in-flight refetch. So the screen
  //     settled on "7 of 10 on" over a database where all ten were set,
  //     and stayed there until a reload.
  //
  //   That is the worst shape for a switch: the customer presses once,
  //   is told it half-worked, presses again -- and undoes it.
  //
  // So a group is one mutation. Every write is awaited, then the cache
  // is invalidated once, at the end.
  const setGroup = useMutation({
    mutationFn: async (vars: {
      types: NotificationType[];
      enabled: boolean;
    }) => {
      // Sequential rather than Promise.all: these are server actions on
      // one row each, and ten at once is a burst this needs no part of.
      // A failure stops there and says which one -- a half-applied group
      // the customer can see beats a silent one.
      for (const t of vars.types) {
        const res = await setNotificationPreference(t, vars.enabled);
        if (!res.ok) throw new Error(res.error);
      }
      return vars;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["notification-preferences", userId],
      });
    },
    onError: (err) => {
      toast.error("Couldn't save those preferences", {
        description: err instanceof Error ? err.message : undefined,
      });
      // Whatever did land is real, so put the screen back on the truth
      // rather than on what it hoped for.
      queryClient.invalidateQueries({
        queryKey: ["notification-preferences", userId],
      });
    },
  });

  return {
    // isPending, not isLoading: react-query v5 reports isLoading FALSE
    // for a query that never ran, and this one is `enabled: !!userId`.
    // Without a user every switch rendered ON and pressable over a read
    // nobody made -- the state this hook's own note above says must
    // never be drawn.
    isLoading: isPending,
    isError,
    isEnabled,
    setPreference,
    setGroup,
  };
}
