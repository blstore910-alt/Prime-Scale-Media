import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { Notification } from "@/lib/types/notification";
import { toast } from "sonner";
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

  // isError, and it is RETURNED. Without it no caller could tell "you
  // have no notifications" from "we could not ask" — and these carry
  // "your top-up was rejected".
  const {
    data: notifications = [],
    isLoading,
    isError,
  } = useQuery({
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
  const { data: unreadCount = 0, isError: countError } = useQuery({
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
      // .select() and count: an UPDATE matching no rows is not an error in
      // PostgREST, so without this a click that RLS refused (or a row
      // someone else already removed) reported success, the list refetched,
      // and the notification came back unread with nothing to explain it.
      const { data: rows, error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("recipient_user_id", userId)
        .select("id");
      if (error) throw error;
      if (!rows || rows.length === 0) {
        throw new Error("That notification could not be updated. Reload and try again.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    // Without this the thrown guard above is swallowed and the click still
    // looks like it worked.
    onError: (err: Error) =>
      toast.error("Couldn't mark it read", { description: err.message }),
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      // No row count here ON PURPOSE: "mark whatever is unread as read"
      // legitimately matches nothing when everything already is, and a
      // guard would turn the ordinary case into an error.
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
    // A refused "mark all read" refetched, everything was still unread,
    // and nothing was said — the sibling markAsRead has had this since it
    // was written.
    onError: (e: Error) =>
      toast.error("Couldn't mark them read", { description: e.message }),
  });

  const deleteRead = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      // Only the caller's own read notifications older than 30 days.
      // Clean-up habit; keeps the popover list from getting unwieldy.
      const cutoff = new Date(
        Date.now() - 30 * 86_400_000,
      ).toISOString();
      // Also deliberately uncounted: most of the time there is nothing
      // older than 30 days to clear.
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
    // Same as its sibling: a delete that is refused should say so, not
    // look like a slow refetch.
    onError: (e: Error) =>
      toast.error("Couldn't clear them", { description: e.message }),
  });

  return {
    notifications,
    isLoading,
    // Both, so a caller can say "we couldn't ask" instead of "you have
    // none" and can show the badge as a dot when the count is unknown.
    isError,
    countError,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteRead,
  };
}
