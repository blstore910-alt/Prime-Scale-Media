import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { Notification } from "@/lib/types/notification";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function useNotifications() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user } = useAppContext();
  const userId = user?.id ?? null;

  // Capped. This hook is mounted at the ROOT of both SPA shells, so it runs on
  // first paint for every advertiser and affiliate — not only when the
  // notifications view is opened. Unbounded, it pulled the user's entire
  // history on every app load, and only read-and-older-than-30-days rows are
  // ever pruned, so unread rows accumulate forever.
  const RECENT_LIMIT = 50;

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    queryFn: async () => {
      // P1-12 fix: explicit user filter (defense in depth on top of RLS)
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("recipient_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT);

      if (error) throw error;
      return data as Notification[];
    },
  });

  // Counted server-side, so the badge stays honest past the cap instead of
  // undercounting to at most RECENT_LIMIT.
  const { data: unreadCount = 0 } = useQuery({
    // Nested under "notifications" on purpose: the three mutations below
    // invalidate that prefix, so the badge refreshes with the list.
    queryKey: ["notifications", userId, "unread-count"],
    enabled: !!userId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_user_id", userId)
        .eq("is_read", false);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      if (!userId) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("recipient_user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("recipient_user_id", userId)
        .or("is_read.is.false,is_read.is.null");

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const deleteRead = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      // Only the caller's own read notifications older than 30 days.
      // Clean-up habit; keeps the popover list from getting unwieldy.
      const cutoff = new Date(
        Date.now() - 30 * 86_400_000,
      ).toISOString();
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("recipient_user_id", userId)
        .eq("is_read", true)
        .lt("created_at", cutoff);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  return {
    notifications,
    isLoading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteRead,
  };
}
