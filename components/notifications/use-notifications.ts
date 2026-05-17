import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { Notification } from "@/lib/types/notification";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function useNotifications() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user } = useAppContext();
  const userId = user?.id ?? null;

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    queryFn: async () => {
      // P1-12 fix: explicit user filter (defense in depth on top of RLS)
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("recipient_user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Notification[];
    },
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

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

  return {
    notifications,
    isLoading,
    unreadCount,
    markAsRead,
    markAllAsRead,
  };
}
