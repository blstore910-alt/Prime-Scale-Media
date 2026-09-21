"use client";

import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Loader2, ScrollText } from "lucide-react";

type Row = {
  id: number;
  occurred_at: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  table_name: string;
  row_id: string | null;
};

/**
 * Last 20 audit_events where the caller was the actor. Gives the
 * user a self-service "was that me?" answer without needing to ask
 * an admin.
 *
 * ── ONLY THE TENANT OWNER CAN ACTUALLY READ THIS ────────────────────
 *
 * The one SELECT policy on `audit_events` is
 *
 *     using (public._is_super_admin_of(tenant_id))
 *
 * and that function is `tenants.owner_id = auth.uid()` — the owner, and
 * nobody else. RLS FILTERS, it does not refuse: the query came back `[]`
 * with no error, so `isError` was false and this rendered "Nothing here
 * yet. Your changes will show up as you use the app." to every customer
 * and every affiliate, for ever. A confident empty over a read that was
 * never permitted, on the screen somebody opens when a figure has
 * surprised them.
 *
 * So it renders for the one role that can see it, and nothing for the
 * rest. A customer-facing account history is a real gap and is written
 * up as one — it needs its own narrowed view, because `audit_events`
 * carries `old_data`/`new_data` and those hold supplier figures.
 */
export default function MyActivity() {
  const { user, isSuperAdmin } = useAppContext();

  const { data, isLoading, isError } = useQuery<Row[]>({
    queryKey: ["my-activity", user?.id],
    enabled: !!user?.id && isSuperAdmin,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("audit_events")
        .select("id, occurred_at, action, table_name, row_id")
        .eq("actor_user_id", user!.id)
        .order("occurred_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  if (!isSuperAdmin) return null;

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">My recent activity</h3>
        <p className="text-sm text-muted-foreground">
          The last 20 changes you made across the app.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">
          Couldn&apos;t load your activity.
        </p>
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground">
          Nothing here yet. Your changes will show up as you use the app.
        </p>
      ) : (
        <ol className="space-y-2">
          {data.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
            >
              <ScrollText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-mono text-xs text-muted-foreground w-40 shrink-0">
                {new Date(r.occurred_at).toLocaleString()}
              </span>
              <Badge
                variant={r.action === "DELETE" ? "destructive" : "secondary"}
                className="uppercase text-[10px]"
              >
                {r.action}
              </Badge>
              <span className="font-mono text-xs">{r.table_name}</span>
              {r.row_id && (
                <span className="font-mono text-[10px] text-muted-foreground truncate">
                  {r.row_id}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
