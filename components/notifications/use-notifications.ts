import { useAppContext } from "@/context/app-provider";
import { adminOnlyNotificationTypes } from "@/lib/notification-catalog";
import { createClient } from "@/lib/supabase/client";
import { Notification } from "@/lib/types/notification";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { safeErrorMessage } from "@/lib/pure-error";
import { useState } from "react";

// Whether THIS database has notifications.archived_at. A fact about the
// schema, so it outlives any one mount -- see the note where it is read.
let ARCHIVE_COLUMN_SEEN = false;

export default function useNotifications(
  view: "active" | "archived" = "active",
) {
  // ── MODULE SCOPE, NOT A REF ───────────────────────────────────────
  //
  // As a useRef this reset to false on every mount, and react-query
  // serves cached data for staleTime without running queryFn -- so
  // navigating away and back within 30 seconds remounted the component
  // with the flag false and NO query run to set it again. The Archive
  // tab vanished and nothing was swipeable, twenty seconds after both
  // worked.
  //
  // Whether this database has the column is a fact about the database,
  // not about one mount, so it lives outside the component. useState
  // seeds from it so a later discovery still triggers a render.
  const [archiveReady, setArchiveReady] = useState(ARCHIVE_COLUMN_SEEN);
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user, profile } = useAppContext();
  const isAdmin = profile?.role === "admin";
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
    // isPending too. isLoading is FALSE for a query that is switched off
    // (no userId yet) and for one paused offline -- exactly the two
    // states where nothing has been read -- so an empty list with
    // isLoading false rendered "You're all caught up" over alerts that
    // include a rejected payout.
    isPending,
    isError,
  } = useQuery({
    queryKey: ["notifications", userId, view],
    enabled: !!userId,
    queryFn: async () => {
      // P1-12 fix: explicit user filter (defense in depth on top of RLS)
      const base = () =>
        supabase
          .from("notifications")
          .select("*")
          .eq("recipient_user_id", userId)
          .order("created_at", { ascending: false })
          .limit(RECENT_LIMIT);

      // ── A COLUMN THE MIGRATION MAY NOT HAVE ADDED YET ────────────
      //
      // Code reaches production in minutes; migrations are pasted by
      // hand. A select naming archived_at before it exists does not
      // degrade -- PostgREST throws, and "column notifications.archived_at
      // does not exist" lands on the customer's own alerts page.
      //
      // So: ask for it, and if that is refused, ask again without it.
      // Until the migration lands, the list is every notification and the
      // archive is empty -- the feature stays dark instead of the screen
      // breaking.
      const { data, error } = await (view === "archived"
        ? base().not("archived_at", "is", null)
        : base().is("archived_at", null));

      if (!error) {
        ARCHIVE_COLUMN_SEEN = true;
        setArchiveReady(true);
        return data as Notification[];
      }

      // ── ONLY A MISSING COLUMN MEANS "NO ARCHIVE HERE" ─────────────
      //
      // This treated EVERY error the same: a network blip on the
      // Archive tab returned [] as a SUCCESS, which reads as "you have
      // archived nothing" -- a confident zero over a failed read. And
      // it flipped the flag off, which removed the tab bar while `view`
      // was still "archived", leaving no way back to the inbox without
      // reloading the page.
      //
      // 42703 is "column does not exist". Anything else is a real
      // failure and is thrown, so isError renders instead of an empty
      // list, and the tabs stay where they are.
      const missingColumn =
        (error as { code?: string } | null)?.code === "42703";
      if (!missingColumn) throw error;

      ARCHIVE_COLUMN_SEEN = false;
      setArchiveReady(false);
      if (view === "archived") return [] as Notification[];
      const { data: plain, error: plainError } = await base();
      if (plainError) throw plainError;
      return plain as Notification[];
    },
  });

  // Counted server-side, so the badge stays honest past the cap instead of
  // undercounting to at most RECENT_LIMIT.
  const {
    data: unreadCount = 0,
    isError: countError,
    isPending: countPending,
  } = useQuery({
    // Nested under "notifications" on purpose: the three mutations below
    // invalidate that prefix, so the badge refreshes with the list.
    queryKey: ["notifications", userId, "unread-count"],
    enabled: !!userId,
    queryFn: async () => {
      // ── NOT THE ONES ALREADY PUT ASIDE ──────────────────────────
      //
      // Archiving an unread alert took it out of the inbox and left it
      // in this count, so the bell read 3 over a list showing 2 and
      // nothing on the inbox could clear it.
      // ── AND NOT AN ADMIN ALERT ON A CUSTOMER'S RECORD ───────────
      //
      // Both customer shells now FILTER admin-audience types out of the
      // list they render. This count did not, so one mis-addressed row
      // left a red badge over a list it does not appear in, and "mark
      // all read" could never clear it.
      const adminTypes = isAdmin ? [] : adminOnlyNotificationTypes();
      const base = () => {
        let q = supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("recipient_user_id", userId)
          .eq("is_read", false);
        if (adminTypes.length > 0) {
          // PostgREST negates as `column.not.operator.value`, so it is
          // `type.not.in.(…)` -- `not.type.in.(…)` is a 400. That 400
          // is what put a grey DOT on the bell with no notification
          // behind it: the count query failed, countError went true,
          // and the badge correctly said "we could not ask" -- about a
          // question this code was asking wrongly.
          q = q.or(`type.is.null,type.not.in.(${adminTypes.join(",")})`);
        }
        return q;
      };

      const { count, error } = await base().is("archived_at", null);
      if (!error) return count ?? 0;
      // Same pending-column rule as the list above.
      if ((error as { code?: string } | null)?.code !== "42703") throw error;
      const { count: plain, error: plainError } = await base();
      if (plainError) throw plainError;
      return plain ?? 0;
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
    // ALL THREE THROW THE RAW PostgrestError, and `.message` on one of
    // those is not the sanitised string this rule is about: the object
    // also carries `details`, `hint` and `row`, and safeErrorMessage is
    // what keeps them out of a customer's screen. This hook is mounted at
    // the root of BOTH SPA shells, so it is every advertiser and every
    // affiliate.
    onError: (err: Error) =>
      toast.error("Couldn't mark it read", { description: safeErrorMessage(err) }),
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
      toast.error("Couldn't mark them read", { description: safeErrorMessage(e) }),
  });

  // ── PUT ONE ASIDE ─────────────────────────────────────────────────
  //
  // The only way to clear the list was "delete all read" -- all or
  // nothing, and the row is gone. Working a queue you want the
  // opposite: deal with this one, get it off the screen, still find it
  // in a week when somebody asks what the alert said.
  //
  // Private by construction: recipient_user_id already scopes every row
  // to one person, so clearing your own queue cannot touch anyone else's.
  const setArchived = useMutation({
    mutationFn: async (vars: { id: string; archived: boolean }) => {
      if (!userId) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("notifications")
        .update({
          archived_at: vars.archived ? new Date().toISOString() : null,
        })
        .eq("id", vars.id)
        .eq("recipient_user_id", userId)
        .select("id");
      if (error) throw error;
      // An update that matched nothing returns no error and no rows, so
      // the row would slide away on screen and come back on refetch.
      if (!data || data.length === 0) {
        throw new Error("That notification could not be found.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e: Error) =>
      toast.error("Couldn't move it", { description: safeErrorMessage(e) }),
  });

  const deleteRead = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      // Only the caller's own read notifications older than 30 days.
      // Clean-up habit; keeps the popover list from getting unwieldy.
      const cutoff = new Date(
        Date.now() - 30 * 86_400_000,
      ).toISOString();
      // ── COUNT FIRST, THEN DELETE ──────────────────────────────────
      //
      // This was uncounted because "most of the time there is nothing
      // older than 30 days" -- and that reasoning hid a permanent
      // no-op. `notifications` has a SELECT policy and an UPDATE
      // policy and NO DELETE POLICY at all
      // (supabase/migrations/20260828140000_rls_templates.sql:480-486),
      // so with RLS on, this delete matches zero rows for everyone.
      // PostgREST does not call that an error, so the confirmation
      // dialog warned that this "cannot be undone", the toast said
      // "Old read notifications cleaned", and nothing was ever
      // removed.
      //
      // Counting the matching rows first separates the two cases the
      // old code could not tell apart: nothing to clear, and not
      // allowed to clear it.
      const { count: matching, error: countError } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_user_id", userId)
        .eq("is_read", true)
        .lt("created_at", cutoff);
      if (countError) throw countError;

      const { data: removed, error } = await supabase
        .from("notifications")
        .delete()
        .eq("recipient_user_id", userId)
        .eq("is_read", true)
        .lt("created_at", cutoff)
        .select("id");
      if (error) throw error;

      const gone = removed?.length ?? 0;
      if ((matching ?? 0) > 0 && gone === 0) {
        throw new Error(
          "Nothing was removed — this account is not allowed to delete notifications. Nobody has lost anything; the list is unchanged.",
        );
      }
      return gone;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    // Same as its sibling: a delete that is refused should say so, not
    // look like a slow refetch.
    onError: (e: Error) =>
      toast.error("Couldn't clear them", { description: safeErrorMessage(e) }),
  });

  return {
    notifications,
    isLoading,
    /** No answer yet -- including a query that is switched off or paused. */
    isPending,
    /** Same, for the badge: 0 unread and "we never asked" are not the same. */
    countPending,
    // Both, so a caller can say "we couldn't ask" instead of "you have
    // none" and can show the badge as a dot when the count is unknown.
    isError,
    countError,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteRead,
    setArchived,
    // False until a read has actually come back with the column in it,
    // so the archive tab and the swipe stay hidden rather than offering
    // something that would fail.
    canArchive: archiveReady,
  };
}
